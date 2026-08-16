import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { githubRepositorySnapshots } from "@paperclipai/db";
import type {
  GitHubRepositorySnapshotFailure,
  GitHubRepositorySnapshotData,
  GitHubRepositorySnapshotRecommendation,
  GitHubRepositorySnapshotStatus,
} from "@paperclipai/shared";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type ObjectRecord = Record<string, unknown>;
const MAX_REPOSITORY_BYTES = 100_000_000;
const MAX_ENV_FILE_BYTES = 128 * 1024;
const PLUGIN_EXCLUSIONS = ["core_change", "adapter", "skill", "repository_code_execution", "credential_use"];
const EXTERNAL_PLUGIN_LICENSES = new Set(["Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT", "MPL-2.0"]);
const MANIFEST_FILES = new Set(["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"]);
const LOCKFILE_RE = /^(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb|poetry\.lock|Cargo\.lock|go\.sum|Gemfile\.lock)$/i;
const UI_PATH_RE = /^(?:src|app|pages|components|ui|frontend)\//i;
const DATA_PATH_RE = /(?:^|\/)(?:prisma|drizzle|migrations|schema|models?)(?:\/|\.|$)/i;
const ENV_TEMPLATE_RE = /^\.env(?:\.[\w-]+)?\.(?:example|sample|template)$/i;
const SENSITIVE_FILE_RE = /(?:^|\/)(?:\.env(?:\.[\w-]+)?|.*\.(?:pem|key|p12|pfx)|id_(?:rsa|ed25519))$/i;
const EXTERNAL_API_DEPENDENCY_RE = /(?:^|[-_/])(?:aws|azure|firebase|github|google|openai|stripe|supabase|twilio)(?:$|[-_/])/i;

export function normalizeGitHubRepositoryUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("invalid_github_repository_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid_github_repository_url");
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") throw new Error("invalid_github_repository_url");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !/^[A-Za-z0-9_.-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_.-]+$/.test(parts[1]!.replace(/\.git$/i, ""))) throw new Error("invalid_github_repository_url");
  const owner = parts[0]!;
  const repository = parts[1]!.replace(/\.git$/i, "");
  return { owner, repository, sourceUrl: `https://github.com/${owner}/${repository}` };
}

function object(value: unknown): ObjectRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectRecord : {}; }
function string(value: unknown): string | null { return typeof value === "string" ? value : null; }
function failure(response: Response): GitHubRepositorySnapshotFailure {
  if (response.status === 404) return "not_found";
  if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") return "rate_limited";
  if (response.status === 401 || response.status === 403) return "private";
  return "collection_failed";
}

async function json(fetcher: FetchLike, url: string) {
  const response = await fetcher(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "paperclip-repository-snapshot" } });
  if (!response.ok) throw Object.assign(new Error("github_fetch_failed"), { snapshotStatus: failure(response) });
  return response.json() as Promise<unknown>;
}

function secretKeyNames(files: Array<{ name?: unknown; content?: unknown }>) {
  return [...new Set(files.flatMap((file) => {
    if (typeof file.name !== "string" || !/^\.env(?:\.[\w-]+)?(?:\.example|\.sample|\.template)?$/i.test(file.name) || typeof file.content !== "string") return [];
    try {
      const source = Buffer.from(file.content, "base64");
      if (source.byteLength > MAX_ENV_FILE_BYTES) return [];
      return source.toString("utf8").split(/\r?\n/).map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]).filter((key): key is string => Boolean(key));
    } catch { return []; }
  }))].sort();
}

function packageDependencies(file: ObjectRecord) {
  if (file.name !== "package.json" || typeof file.content !== "string") return [];
  try {
    const manifest = object(JSON.parse(Buffer.from(file.content, "base64").toString("utf8")));
    return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
      .flatMap((key) => Object.keys(object(manifest[key])))
      .filter((name, index, names) => names.indexOf(name) === index)
      .sort();
  } catch { return []; }
}

function manifestSnapshot(file: ObjectRecord): GitHubRepositorySnapshotData["manifests"][number] | null {
  const name = string(file.name);
  if (!name || !MANIFEST_FILES.has(name)) return null;
  const ecosystem = name === "package.json" ? "npm"
    : name === "pyproject.toml" ? "python"
    : name === "Cargo.toml" ? "cargo"
    : name === "go.mod" ? "go"
    : name === "pom.xml" || name === "build.gradle" ? "jvm"
    : "unknown";
  return { file: name, ecosystem, dependencies: packageDependencies(file) };
}

function externalApiHints(dependencies: string[], keyNames: string[]) {
  const dependencyHints = dependencies.filter((name) => EXTERNAL_API_DEPENDENCY_RE.test(name));
  const environmentHints = keyNames
    .map((name) => /^([A-Z][A-Z0-9]+)_(?:API_?KEY|TOKEN|SECRET|URL|ENDPOINT)$/.exec(name)?.[1]?.toLowerCase())
    .filter((name): name is string => Boolean(name));
  return [...new Set([...dependencyHints, ...environmentHints])].sort();
}

export function recommendGitHubRepositoryAdoption(
  status: GitHubRepositorySnapshotStatus,
  license: string | null,
  data: ObjectRecord,
): { recommendation: GitHubRepositorySnapshotRecommendation; exclusionScope: string[] } {
  if (status !== "ready" || license === null || !EXTERNAL_PLUGIN_LICENSES.has(license)) {
    return { recommendation: "excluded", exclusionScope: ["adoption", "repository_code_execution", "credential_use"] };
  }
  const dependencies = Array.isArray(data.manifestDependencies)
    ? data.manifestDependencies.filter((value): value is string => typeof value === "string")
    : [];
  const observedPaths = [data.uiPaths, data.dataPaths]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((value): value is string => typeof value === "string");
  if (dependencies.some((name) => name === "@paperclipai/adapter-utils") || observedPaths.some((path) => /(?:^|\/)adapters?\//i.test(path))) {
    return { recommendation: "adapter", exclusionScope: ["core_change", "plugin", "skill", "repository_code_execution", "credential_use"] };
  }
  const frameworkFiles = Array.isArray(data.frameworkFiles) ? data.frameworkFiles : [];
  const languages = Array.isArray(data.languages) ? data.languages : [];
  if (frameworkFiles.length === 0 && languages.length === 0) {
    return { recommendation: "skill", exclusionScope: ["core_change", "adapter", "plugin", "repository_code_execution", "credential_use"] };
  }
  return { recommendation: "plugin", exclusionScope: PLUGIN_EXCLUSIONS };
}

export async function collectGitHubRepositorySnapshot(rawUrl: string, fetcher: FetchLike = fetch) {
  const identity = normalizeGitHubRepositoryUrl(rawUrl);
  const base = `https://api.github.com/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repository)}`;
  let status: GitHubRepositorySnapshotStatus = "collection_failed";
  let defaultBranch: string | null = null;
  let headCommit: string | null = null;
  let license: string | null = null;
  let data: ObjectRecord = {};
  try {
    const repository = object(await json(fetcher, base));
    if (typeof repository.size === "number" && repository.size * 1024 > MAX_REPOSITORY_BYTES) status = "too_large";
    else {
      defaultBranch = string(repository.default_branch);
      license = string(object(repository.license).spdx_id) ?? string(object(repository.license).name);
      const head = await json(fetcher, `${base}/commits/${encodeURIComponent(defaultBranch ?? "main")}`);
      headCommit = string(object(head).sha);
      if (!headCommit) throw new Error("github_head_missing");
      const ref = encodeURIComponent(headCommit);
      const [contents, tree] = await Promise.all([
        json(fetcher, `${base}/contents?ref=${ref}`),
        json(fetcher, `${base}/git/trees/${ref}?recursive=1`),
      ]);
      const root = Array.isArray(contents) ? contents.map(object) : [];
      const metadataFiles = await Promise.all(root.filter((entry) => {
        const name = string(entry.name) ?? "";
        return (MANIFEST_FILES.has(name) || ENV_TEMPLATE_RE.test(name))
          && (typeof entry.path === "string" || typeof entry.name === "string")
          && (typeof entry.size !== "number" || entry.size <= MAX_ENV_FILE_BYTES);
      }).slice(0, 10).map((entry) => {
        const path = string(entry.path) ?? string(entry.name)!;
        return json(fetcher, `${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`);
      }));
      const treeEntries = object(tree).tree;
      const paths = (Array.isArray(treeEntries) ? treeEntries : [])
        .map(object)
        .map((entry) => string(entry.path))
        .filter((path): path is string => path !== null);
      if (object(tree).truncated === true) {
        status = "too_large";
        throw Object.assign(new Error("github_tree_truncated"), { snapshotStatus: status });
      }
      const manifests = metadataFiles.map(object).map(manifestSnapshot).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      const dependencies = [...new Set(manifests.flatMap((manifest) => manifest.dependencies))].sort();
      const lockfiles = paths.filter((path) => LOCKFILE_RE.test(path.split("/").at(-1) ?? "")).sort();
      const keyNames = secretKeyNames(metadataFiles.map(object));
      const templateFiles = root.map((entry) => string(entry.name)).filter((name): name is string => name !== null && ENV_TEMPLATE_RE.test(name)).sort();
      const sensitiveFiles = paths.filter((path) => SENSITIVE_FILE_RE.test(path) && !ENV_TEMPLATE_RE.test(path.split("/").at(-1) ?? "")).slice(0, 100).sort();
      data = {
        // These GitHub endpoints do not accept a commit ref, so do not record
        // moving repository-level facts in an immutable source snapshot.
        releases: [],
        languages: [],
        frameworkFiles: root.map((entry) => string(entry.name)).filter((name): name is string => name !== null && MANIFEST_FILES.has(name)),
        buildTestFiles: root.map((entry) => string(entry.name)).filter((name): name is string => name !== null && /^(package\.json|Makefile|tox\.ini|pytest\.ini|vitest\.config|jest\.config)/i.test(name)),
        manifests,
        manifestDependencies: dependencies,
        lockfiles,
        supplyChain: {
          dependencyCount: dependencies.length,
          hasLockfile: lockfiles.length > 0,
          findings: [
            ...(dependencies.length > 0 && lockfiles.length === 0 ? ["manifest_without_lockfile"] : []),
            "security_advisories_not_collected_without_authenticated_scope",
          ],
        },
        uiPaths: paths.filter((path) => UI_PATH_RE.test(path)).slice(0, 100),
        dataPaths: paths.filter((path) => DATA_PATH_RE.test(path)).slice(0, 100),
        externalApiHints: externalApiHints(dependencies, keyNames),
        secrets: { templateFiles, sensitiveFiles, keyNames, valuesRetained: false },
        secretKeyNames: keyNames,
        securityAlerts: "unavailable_without_authenticated_security_scope",
        workflow: {
          phase: "plan_required",
          approvalRequired: true,
          implementationAllowed: false,
          requiredGates: ["license", "secrets", "supply_chain", "company_scope", "rollback"],
        },
      };
      status = "ready";
    }
  } catch (error) { status = (error as { snapshotStatus?: GitHubRepositorySnapshotFailure }).snapshotStatus ?? "collection_failed"; }
  const sourceEvidenceUrl = status === "ready" && headCommit ? `${identity.sourceUrl}/tree/${headCommit}` : identity.sourceUrl;
  return {
    ...identity,
    sourceEvidenceUrl,
    defaultBranch,
    headCommit,
    status,
    license,
    data,
    ...recommendGitHubRepositoryAdoption(status, license, data),
  };
}

export function githubRepositorySnapshotService(db: Db, fetcher?: FetchLike) {
  return {
    async collect(companyId: string, url: string) {
      const collected = await collectGitHubRepositorySnapshot(url, fetcher);
      return db.insert(githubRepositorySnapshots).values({ companyId, ...collected }).returning().then((rows) => rows[0]!);
    },
    list(companyId: string) { return db.select().from(githubRepositorySnapshots).where(eq(githubRepositorySnapshots.companyId, companyId)).orderBy(desc(githubRepositorySnapshots.collectedAt)); },
    get(companyId: string, id: string) { return db.select().from(githubRepositorySnapshots).where(and(eq(githubRepositorySnapshots.companyId, companyId), eq(githubRepositorySnapshots.id, id))).then((rows) => rows[0] ?? null); },
  };
}
