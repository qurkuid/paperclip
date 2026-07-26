import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfigFromEnv, type NaverSearchAdConfig } from "./config.js";
import { createNaverSearchAdClient, type NaverSearchAdClient } from "./naver-client.js";
import { createToolDefinitions } from "./tools.js";

export interface CreateNaverSearchAdMcpServerOptions {
  client?: NaverSearchAdClient;
}

export function createNaverSearchAdMcpServer(
  config: NaverSearchAdConfig = readConfigFromEnv(),
  options: CreateNaverSearchAdMcpServerOptions = {},
) {
  const server = new McpServer({
    name: "paperclip-naver-searchad",
    version: "0.1.0",
  });
  const client = options.client ?? createNaverSearchAdClient(config);
  const tools = createToolDefinitions({
    client,
    secretRedactions: config.secretRedactions,
  });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema.shape,
        annotations: tool.annotations,
      },
      tool.execute,
    );
  }
  return { server, client, tools };
}

export async function runServer(config: NaverSearchAdConfig = readConfigFromEnv()) {
  const { server } = createNaverSearchAdMcpServer(config);
  await server.connect(new StdioServerTransport());
}

export { createNaverSearchAdConfig, readConfigFromEnv, readNaverCredentialsFile } from "./config.js";
export { createNaverSearchAdClient, normalizeStats, signNaverSearchAdRequest } from "./naver-client.js";
export { createToolDefinitions } from "./tools.js";
export type { NaverSearchAdConfig } from "./config.js";
export type { NaverSearchAdClient } from "./naver-client.js";
