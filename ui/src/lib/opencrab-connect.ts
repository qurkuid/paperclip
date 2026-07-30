import { OPENCRAB_MCP_URL_PREFIX } from "@paperclipai/shared";
import { OPENCRAB_SAFE_TOOL_NAMES } from "./opencrab-safe-tools";

export interface OpenCrabConnectionRecord {
  id: string;
  transport: string | null;
  status?: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  credentialSecretRefs?: Array<{
    secretId: string;
    configPath: string;
    label?: string | null;
  }>;
}

const OPENCRAB_SECRET_KEY = "opencrab_mcp_url";
const OPENCRAB_ENDPOINT_SECRET_PATH = "transport.url";
const OPENCRAB_SAFE_CONFIG = {
  url: "https://opencrab.sh/api/mcp",
  provider: "opencrab",
  credentialMode: "vault_endpoint",
} as const;

interface InstallTarget {
  targetType: "company" | "agent";
  targetId: string;
}

interface CatalogEntry {
  id?: string;
  toolName: string;
  isReadOnly?: boolean;
  status?: string;
}

interface OpenCrabConnectionClient {
  listSecrets: (companyId: string) => Promise<Array<{ id: string; key: string }>>;
  createSecret: (
    companyId: string,
    input: {
      provider: "local_encrypted";
      name: string;
      key: string;
      value: string;
      description: string;
    },
  ) => Promise<{ id: string; key: string }>;
  rotateSecret: (secretId: string, input: { value: string }) => Promise<unknown>;
  createConnection: (
    companyId: string,
    input: {
      applicationName: string;
      name: string;
      transport: "mcp_remote";
      status: "active";
      enabled: true;
      config: typeof OPENCRAB_SAFE_CONFIG;
      credentialSecretRefs: Array<{
        secretId: string;
        configPath: typeof OPENCRAB_ENDPOINT_SECRET_PATH;
        label: string;
      }>;
    },
  ) => Promise<OpenCrabConnectionRecord>;
  updateConnection: (
    connectionId: string,
    input: {
      status: "active";
      enabled: true;
      config?: typeof OPENCRAB_SAFE_CONFIG;
      credentialSecretRefs?: Array<{
        secretId: string;
        configPath: typeof OPENCRAB_ENDPOINT_SECRET_PATH;
        label: string;
      }>;
    },
  ) => Promise<OpenCrabConnectionRecord>;
  refreshCatalog: (connectionId: string) => Promise<unknown>;
  listCatalog: (connectionId: string) => Promise<{ catalog: CatalogEntry[] }>;
  finishApp: (
    companyId: string,
    connectionId: string,
    input: {
      enabledCatalogEntryIds: string[];
      askFirstCatalogEntryIds: string[];
      access: "all_agents";
    },
  ) => Promise<unknown>;
  getConnectionInstalls: (
    connectionId: string,
  ) => Promise<{ connectionId: string; installs: InstallTarget[] }>;
  putConnectionInstalls: (
    connectionId: string,
    installs: InstallTarget[],
  ) => Promise<unknown>;
}

export function isOfficialOpenCrabUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "opencrab.sh"
      && /^\/api\/mcp\/ocm(?:cp)?_[a-zA-Z0-9_-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function connectionUrl(connection: OpenCrabConnectionRecord): string {
  const value = connection.config?.url;
  return typeof value === "string" ? value : "";
}

export function isOfficialOpenCrabConnection(
  connection: OpenCrabConnectionRecord,
): boolean {
  return connection.transport === "mcp_remote"
    && (
      isOfficialOpenCrabUrl(connectionUrl(connection))
      || connection.config?.provider === "opencrab"
    );
}

function endpointSecretId(connection: OpenCrabConnectionRecord): string | null {
  return connection.credentialSecretRefs?.find(
    (ref) => ref.configPath === OPENCRAB_ENDPOINT_SECRET_PATH,
  )?.secretId ?? null;
}

async function persistOpenCrabUrl(input: {
  companyId: string;
  mcpUrl: string;
  client: OpenCrabConnectionClient;
}): Promise<string> {
  const secrets = await input.client.listSecrets(input.companyId);
  const existing = secrets.find((secret) => secret.key === OPENCRAB_SECRET_KEY);
  if (existing) {
    await input.client.rotateSecret(existing.id, { value: input.mcpUrl });
    return existing.id;
  }
  const created = await input.client.createSecret(input.companyId, {
    provider: "local_encrypted",
    name: "OpenCrab 계정 전용 MCP URL",
    key: OPENCRAB_SECRET_KEY,
    value: input.mcpUrl,
    description: "OpenCrab 공식 원격 MCP 자격증명",
  });
  return created.id;
}

export async function connectOfficialOpenCrab(input: {
  companyId: string;
  agentId: string;
  mcpUrl: string;
  connections: OpenCrabConnectionRecord[];
  client: OpenCrabConnectionClient;
}): Promise<{ connection: OpenCrabConnectionRecord; created: boolean }> {
  let connection = input.connections.find(isOfficialOpenCrabConnection);
  const created = !connection;
  const enteredUrl = input.mcpUrl.trim();
  const legacyStoredUrl = connection && isOfficialOpenCrabUrl(connectionUrl(connection))
    ? connectionUrl(connection)
    : "";
  const mcpUrl = enteredUrl || legacyStoredUrl;
  const existingSecretId = connection ? endpointSecretId(connection) : null;
  if (!connection && !isOfficialOpenCrabUrl(mcpUrl)) {
    throw new Error(`공식 URL(${OPENCRAB_MCP_URL_PREFIX}...)을 입력해 주세요.`);
  }
  if (mcpUrl && !isOfficialOpenCrabUrl(mcpUrl)) {
    throw new Error(`공식 URL(${OPENCRAB_MCP_URL_PREFIX}...)을 입력해 주세요.`);
  }
  const shouldPersistCredential = Boolean(mcpUrl && (enteredUrl || !existingSecretId));
  const secretId = shouldPersistCredential
    ? await persistOpenCrabUrl({ companyId: input.companyId, mcpUrl, client: input.client })
    : existingSecretId;
  const credentialSecretRefs = secretId
    ? [{
        secretId,
        configPath: OPENCRAB_ENDPOINT_SECRET_PATH,
        label: "OpenCrab 계정 전용 MCP URL",
      } as const]
    : undefined;

  if (!connection) {
    if (!credentialSecretRefs) {
      throw new Error("OpenCrab MCP 자격증명을 안전하게 저장하지 못했습니다.");
    }
    connection = await input.client.createConnection(input.companyId, {
      applicationName: "OpenCrab 공식 SaaS",
      name: "OpenCrab 공식 MCP",
      transport: "mcp_remote",
      status: "active",
      enabled: true,
      config: OPENCRAB_SAFE_CONFIG,
      credentialSecretRefs,
    });
  } else if (
    connection.status !== "active"
    || !connection.enabled
    || shouldPersistCredential
  ) {
    connection = await input.client.updateConnection(connection.id, {
      status: "active",
      enabled: true,
      ...(shouldPersistCredential
        ? { config: OPENCRAB_SAFE_CONFIG, credentialSecretRefs }
        : {}),
    });
  }

  await input.client.refreshCatalog(connection.id);
  const { catalog } = await input.client.listCatalog(connection.id);
  const enabledCatalogEntryIds = catalog.flatMap((entry) =>
    entry.id
    && entry.status === "active"
    && entry.isReadOnly !== false
    && OPENCRAB_SAFE_TOOL_NAMES.has(entry.toolName)
      ? [entry.id]
      : []);
  if (enabledCatalogEntryIds.length === 0) {
    throw new Error("OpenCrab 읽기 전용 도구를 확인하지 못했습니다.");
  }
  await input.client.finishApp(input.companyId, connection.id, {
    enabledCatalogEntryIds,
    askFirstCatalogEntryIds: [],
    access: "all_agents",
  });
  const snapshot = await input.client.getConnectionInstalls(connection.id);
  const installs = snapshot.installs.map(({ targetType, targetId }) => ({ targetType, targetId }));
  const installedForCompany = installs.some(
    (target) => target.targetType === "company" && target.targetId === input.companyId,
  );
  const installedForAgent = installs.some(
    (target) => target.targetType === "agent" && target.targetId === input.agentId,
  );
  await input.client.putConnectionInstalls(connection.id, [
    ...installs,
    ...(installedForCompany ? [] : [{ targetType: "company" as const, targetId: input.companyId }]),
    ...(installedForAgent ? [] : [{ targetType: "agent" as const, targetId: input.agentId }]),
  ]);
  return { connection, created };
}
