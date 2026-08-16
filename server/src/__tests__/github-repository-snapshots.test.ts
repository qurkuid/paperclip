import { describe, expect, it } from "vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { companies, createDb, githubRepositorySnapshots } from "@paperclipai/db";
import { createGitHubRepositorySnapshotSchema } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { fetchGoldenRepository, GOLDEN_REPOSITORY_COMMIT, GOLDEN_REPOSITORY_URL } from "./fixtures/github-repository-golden.js";
import {
  collectGitHubRepositorySnapshot,
  normalizeGitHubRepositoryUrl,
  recommendGitHubRepositoryAdoption,
} from "../services/github-repository-snapshots.js";
import { githubRepositorySnapshotService } from "../services/github-repository-snapshots.js";

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describe("GitHub repository snapshots", () => {
  it("normalizes the autoTHREADS golden fixture URL without retaining credentials or query text", () => {
    expect(normalizeGitHubRepositoryUrl("https://www.github.com/eisenjimmy/autoTHREADS.git/")).toMatchObject({ sourceUrl: GOLDEN_REPOSITORY_URL, repository: "autoTHREADS" });
    expect(() => normalizeGitHubRepositoryUrl("https://token@github.com/eisenjimmy/autoTHREADS?token=value")).toThrow("invalid_github_repository_url");
    expect(createGitHubRepositorySnapshotSchema.safeParse({ url: "https://token@github.com/eisenjimmy/autoTHREADS?token=value" }).success).toBe(false);
  });

  it("keeps the golden recommendation and plan inputs deterministic without retaining secret values", async () => {
    const snapshot = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, fetchGoldenRepository);
    expect(snapshot.status).toBe("ready");
    expect(snapshot).toMatchObject({
      sourceUrl: GOLDEN_REPOSITORY_URL,
      defaultBranch: "main",
      headCommit: GOLDEN_REPOSITORY_COMMIT,
      license: "MIT",
      recommendation: "plugin",
      exclusionScope: ["core_change", "adapter", "skill", "repository_code_execution", "credential_use"],
      sourceEvidenceUrl: `${GOLDEN_REPOSITORY_URL}/tree/${GOLDEN_REPOSITORY_COMMIT}`,
    });
    expect(snapshot.data).toMatchObject({
      languages: [],
      manifestDependencies: ["electron", "electron-builder", "react", "react-dom", "typescript", "vite", "zustand"],
      lockfiles: ["package-lock.json"],
      supplyChain: { dependencyCount: 7, hasLockfile: true },
      uiPaths: ["src/App.tsx"],
      dataPaths: [],
      externalApiHints: ["github"],
      secrets: { templateFiles: [".env.example"], sensitiveFiles: [], keyNames: ["GITHUB_TOKEN", "PUBLIC_FLAG"], valuesRetained: false },
      workflow: { phase: "plan_required", approvalRequired: true, implementationAllowed: false },
    });
    const planInputs = { sourceEvidenceUrl: snapshot.sourceEvidenceUrl, headCommit: snapshot.headCommit, recommendation: snapshot.recommendation, license: snapshot.license };
    expect(planInputs).toEqual({ sourceEvidenceUrl: `${GOLDEN_REPOSITORY_URL}/tree/${GOLDEN_REPOSITORY_COMMIT}`, headCommit: GOLDEN_REPOSITORY_COMMIT, recommendation: "plugin", license: "MIT" });
    expect(JSON.stringify(snapshot)).not.toContain("golden-secret-value");
  });

  it("pins every collected source request after branch resolution to the head commit", async () => {
    const requested: string[] = [];
    await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async (url) => {
      requested.push(url);
      return fetchGoldenRepository(url);
    });
    expect(requested).toEqual(expect.arrayContaining([
      expect.stringContaining(`/contents?ref=${GOLDEN_REPOSITORY_COMMIT}`),
      expect.stringContaining(`/git/trees/${GOLDEN_REPOSITORY_COMMIT}?recursive=1`),
      expect.stringContaining(`/contents/package.json?ref=${GOLDEN_REPOSITORY_COMMIT}`),
      expect.stringContaining(`/contents/.env.example?ref=${GOLDEN_REPOSITORY_COMMIT}`),
    ]));
    expect(requested.filter((url) => !url.endsWith("/repos/eisenjimmy/autoTHREADS") && !url.includes("/commits/main"))).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/\/(?:releases|languages)(?:\?|$)/)]),
    );
  });

  it("never fetches real environment or key files and records only their paths as risks", async () => {
    const requested: string[] = [];
    const snapshot = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async (url) => {
      requested.push(url);
      if (url.endsWith("/repos/eisenjimmy/autoTHREADS")) return response({ default_branch: "main", size: 2, license: { spdx_id: "MIT" } });
      if (url.includes("/commits/main")) return response({ sha: "abc123" });
      if (url.includes("/releases")) return response([]);
      if (url.endsWith("/languages")) return response({});
      if (url.includes("/contents?ref=abc123")) return response([
        { name: ".env", path: ".env", url: "https://api.github.com/secret-env" },
        { name: "id_rsa", path: "id_rsa", url: "https://api.github.com/secret-key" },
        { name: "deploy.pem", path: "deploy.pem", url: "https://api.github.com/secret-key" },
      ]);
      if (url.includes("/git/trees/abc123")) return response({ tree: [
        { path: ".env" }, { path: "id_rsa" }, { path: "deploy.pem" },
      ] });
      throw new Error(`unexpected URL ${url}`);
    });
    expect(requested).not.toContain("https://api.github.com/secret-env");
    expect(requested).not.toContain("https://api.github.com/secret-key");
    expect(snapshot.data).toMatchObject({
      secrets: {
        sensitiveFiles: [".env", "deploy.pem", "id_rsa"],
        keyNames: [],
        valuesRetained: false,
      },
    });
  });

  it("classifies inaccessible, missing, and oversized repositories without leaking responses", async () => {
    const missing = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async () => response({}, 404));
    const privateRepo = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async () => response({}, 403));
    const rateLimited = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
    const oversized = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async () => response({ size: 100_000 }));
    expect([missing.status, privateRepo.status, rateLimited.status, oversized.status]).toEqual(["not_found", "private", "rate_limited", "too_large"]);
    expect([missing, privateRepo, rateLimited, oversized].every((snapshot) => snapshot.recommendation === "excluded" && Object.keys(snapshot.data).length === 0)).toBe(true);
  });

  it("excludes a ready snapshot with a non-permissive license", async () => {
    const snapshot = await collectGitHubRepositorySnapshot(GOLDEN_REPOSITORY_URL, async (url) => {
      if (url.endsWith("/repos/eisenjimmy/autoTHREADS")) return response({ default_branch: "main", size: 2, license: { spdx_id: "GPL-3.0-only" } });
      if (url.includes("/commits/main")) return response({ sha: "abc123" });
      if (url.includes("/releases")) return response([]);
      if (url.endsWith("/languages")) return response({});
      if (url.includes("/contents?ref=abc123")) return response([]);
      return response({ tree: [] });
    });
    expect(snapshot).toMatchObject({ status: "ready", recommendation: "excluded", exclusionScope: expect.arrayContaining(["adoption"]) });
  });

  it("classifies instruction-only and execution-boundary repositories without selecting core automatically", () => {
    expect(recommendGitHubRepositoryAdoption("ready", "MIT", { frameworkFiles: [], languages: [] }).recommendation).toBe("skill");
    expect(recommendGitHubRepositoryAdoption("ready", "MIT", {
      frameworkFiles: ["package.json"],
      languages: ["TypeScript"],
      manifestDependencies: ["@paperclipai/adapter-utils"],
    }).recommendation).toBe("adapter");
    expect(recommendGitHubRepositoryAdoption("ready", "MIT", {
      frameworkFiles: ["package.json"],
      languages: ["TypeScript"],
    }).recommendation).toBe("plugin");
    expect(recommendGitHubRepositoryAdoption("ready", "GPL-3.0-only", {}).recommendation).toBe("excluded");
  });
});

describeEmbeddedPostgres("GitHub repository snapshot persistence", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-github-snapshot-");
    db = createDb(tempDb.connectionString);
  }, 30_000);
  afterEach(async () => { await db.delete(githubRepositorySnapshots); await db.delete(companies); });
  afterAll(async () => { await tempDb?.cleanup(); });

  it("keeps successive collections as separate immutable records", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Snapshots", issuePrefix: "SNP" });
    const service = githubRepositorySnapshotService(db, fetchGoldenRepository);
    const first = await service.collect(companyId, GOLDEN_REPOSITORY_URL);
    const second = await service.collect(companyId, GOLDEN_REPOSITORY_URL);
    expect(first.id).not.toBe(second.id);
    expect(await service.list(companyId)).toHaveLength(2);
  });
});
