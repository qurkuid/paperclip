import {
  parseOpenCrabPackListResult,
  type OpenCrabSchemaPack,
} from "@paperclipai/shared";

interface CatalogEntry {
  id?: string;
  toolName: string;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
  isReadOnly?: boolean;
  status?: string;
}

export {
  connectOfficialOpenCrab,
  isOfficialOpenCrabConnection,
  isOfficialOpenCrabUrl,
  type OpenCrabConnectionRecord,
} from "./opencrab-connect";

interface OpenCrabPackClient {
  listCatalog: (connectionId: string) => Promise<{ catalog: CatalogEntry[] }>;
  runTestCall: (
    connectionId: string,
    input: { agentId: string; toolName: string; parameters: Record<string, unknown> },
  ) => Promise<{
    decision: "allowed" | "ask_first" | "off";
    result?: unknown;
    error?: { message: string };
  }>;
}

function requiredInputCount(entry: CatalogEntry): number {
  const required = entry.inputSchema?.required;
  return Array.isArray(required) ? required.length : 0;
}

function packListToolScore(entry: CatalogEntry): number {
  if (entry.status !== "active" || entry.isReadOnly === false || requiredInputCount(entry) > 0) {
    return -1;
  }
  const text = `${entry.toolName} ${entry.description ?? ""}`.toLowerCase();
  if (!text.includes("pack")) return -1;
  return (entry.toolName === "opencrab_search_packs" ? 20 : 0)
    + (text.includes("opencrab") ? 4 : 0)
    + (text.includes("accessible") || text.includes("available") ? 4 : 0)
    + (text.includes("list") ? 4 : 0)
    + (text.includes("marketplace") ? 1 : 0);
}

export async function fetchOfficialOpenCrabPacks(input: {
  connectionId: string;
  agentId: string;
  client: OpenCrabPackClient;
}): Promise<OpenCrabSchemaPack[]> {
  const { catalog } = await input.client.listCatalog(input.connectionId);
  const packListTool = catalog
    .map((entry) => ({ entry, score: packListToolScore(entry) }))
    .filter(({ score }) => score >= 4)
    .sort((left, right) => right.score - left.score)[0]?.entry;
  if (!packListTool) {
    throw new Error("공식 OpenCrab MCP에서 팩 목록 도구를 찾지 못했습니다.");
  }

  const call = await input.client.runTestCall(input.connectionId, {
    agentId: input.agentId,
    toolName: packListTool.toolName,
    parameters: packListTool.toolName === "opencrab_search_packs"
      ? { limit: 1000 }
      : {},
  });
  if (call.decision !== "allowed" || call.error) {
    throw new Error(call.error?.message ?? "OpenCrab 팩 목록을 읽을 권한이 없습니다.");
  }
  const packs = parseOpenCrabPackListResult(call.result);
  if (packs.length === 0) {
    throw new Error("OpenCrab MCP가 반환한 접근 가능 팩 목록이 비어 있습니다.");
  }
  return packs;
}
