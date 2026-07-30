import { describe, expect, it, vi } from "vitest";
import {
  connectOfficialOpenCrab,
  fetchOfficialOpenCrabPacks,
  isOfficialOpenCrabConnection,
} from "./opencrab-connection";

const OFFICIAL_URL = "https://opencrab.sh/api/mcp/ocm_private-key";

function remoteConnection() {
  return {
    id: "connection-1",
    transport: "mcp_remote",
    status: "active",
    enabled: true,
    config: { url: OFFICIAL_URL },
  };
}

describe("official OpenCrab connection", () => {
  it("creates the account-scoped remote MCP and installs it for the company and selected agent", async () => {
    const connection = remoteConnection();
    const client = {
      listSecrets: vi.fn().mockResolvedValue([]),
      createSecret: vi.fn().mockResolvedValue({ id: "secret-1", key: "opencrab_mcp_url" }),
      rotateSecret: vi.fn(),
      createConnection: vi.fn().mockResolvedValue({
        ...connection,
        config: {
          url: "https://opencrab.sh/api/mcp",
          provider: "opencrab",
          credentialMode: "vault_endpoint",
        },
      }),
      updateConnection: vi.fn(),
      refreshCatalog: vi.fn().mockResolvedValue({}),
      listCatalog: vi.fn().mockResolvedValue({
        catalog: [
          { id: "read-1", toolName: "opencrab_search_packs", status: "active", isReadOnly: true },
          { id: "write-1", toolName: "opencrab_ingest_text", status: "active", isReadOnly: false },
        ],
      }),
      finishApp: vi.fn().mockResolvedValue({}),
      getConnectionInstalls: vi.fn().mockResolvedValue({ connectionId: connection.id, installs: [] }),
      putConnectionInstalls: vi.fn().mockResolvedValue({}),
    };

    const result = await connectOfficialOpenCrab({
      companyId: "company-1",
      agentId: "agent-1",
      mcpUrl: OFFICIAL_URL,
      connections: [],
      client,
    });

    expect(client.createConnection).toHaveBeenCalledWith("company-1", {
      applicationName: "OpenCrab 공식 SaaS",
      name: "OpenCrab 공식 MCP",
      transport: "mcp_remote",
      status: "active",
      enabled: true,
      config: {
        url: "https://opencrab.sh/api/mcp",
        provider: "opencrab",
        credentialMode: "vault_endpoint",
      },
      credentialSecretRefs: [{
        secretId: "secret-1",
        configPath: "transport.url",
        label: "OpenCrab 계정 전용 MCP URL",
      }],
    });
    expect(client.createSecret).toHaveBeenCalledWith("company-1", {
      provider: "local_encrypted",
      name: "OpenCrab 계정 전용 MCP URL",
      key: "opencrab_mcp_url",
      value: OFFICIAL_URL,
      description: "OpenCrab 공식 원격 MCP 자격증명",
    });
    expect(client.refreshCatalog).toHaveBeenCalledWith(connection.id);
    expect(client.putConnectionInstalls).toHaveBeenCalledWith(connection.id, [
      { targetType: "company", targetId: "company-1" },
      { targetType: "agent", targetId: "agent-1" },
    ]);
    expect(client.finishApp).toHaveBeenCalledWith("company-1", connection.id, {
      enabledCatalogEntryIds: ["read-1"],
      askFirstCatalogEntryIds: [],
      access: "all_agents",
    });
    expect(result.connection).toMatchObject({
      id: connection.id,
      config: {
        url: "https://opencrab.sh/api/mcp",
        provider: "opencrab",
        credentialMode: "vault_endpoint",
      },
    });
  });

  it("reuses a vault-backed connection without asking for the credential again", async () => {
    const connection = {
      ...remoteConnection(),
      config: {
        url: "https://opencrab.sh/api/mcp",
        provider: "opencrab",
        credentialMode: "vault_endpoint",
      },
      credentialSecretRefs: [{
        secretId: "secret-1",
        configPath: "transport.url",
        label: "OpenCrab 계정 전용 MCP URL",
      }],
    };
    const client = {
      listSecrets: vi.fn(),
      createSecret: vi.fn(),
      rotateSecret: vi.fn(),
      createConnection: vi.fn(),
      updateConnection: vi.fn(),
      refreshCatalog: vi.fn().mockResolvedValue({}),
      listCatalog: vi.fn().mockResolvedValue({
        catalog: [
          { id: "read-1", toolName: "opencrab_search_packs", status: "active", isReadOnly: true },
        ],
      }),
      finishApp: vi.fn().mockResolvedValue({}),
      getConnectionInstalls: vi.fn().mockResolvedValue({
        connectionId: connection.id,
        installs: [{ targetType: "company", targetId: "company-1" }],
      }),
      putConnectionInstalls: vi.fn(),
    };

    await connectOfficialOpenCrab({
      companyId: "company-1",
      agentId: "agent-1",
      mcpUrl: "",
      connections: [connection],
      client,
    });

    expect(client.listSecrets).not.toHaveBeenCalled();
    expect(client.rotateSecret).not.toHaveBeenCalled();
    expect(client.updateConnection).not.toHaveBeenCalled();
    expect(client.refreshCatalog).toHaveBeenCalledWith(connection.id);
  });

  it("restores agent-scoped access after rebuilding the all-agent profile", async () => {
    const connection = {
      ...remoteConnection(),
      credentialSecretRefs: [{
        secretId: "secret-1",
        configPath: "transport.url",
      }],
    };
    const client = {
      listSecrets: vi.fn(),
      createSecret: vi.fn(),
      rotateSecret: vi.fn(),
      createConnection: vi.fn(),
      updateConnection: vi.fn(),
      refreshCatalog: vi.fn().mockResolvedValue({}),
      listCatalog: vi.fn().mockResolvedValue({
        catalog: [{ id: "read-1", toolName: "opencrab_search_packs", status: "active", isReadOnly: true }],
      }),
      finishApp: vi.fn().mockResolvedValue({}),
      getConnectionInstalls: vi.fn().mockResolvedValue({
        connectionId: connection.id,
        installs: [{ targetType: "company", targetId: "company-1" }],
      }),
      putConnectionInstalls: vi.fn().mockResolvedValue({}),
    };

    await connectOfficialOpenCrab({
      companyId: "company-1",
      agentId: "agent-1",
      mcpUrl: "",
      connections: [connection],
      client,
    });

    expect(client.putConnectionInstalls).toHaveBeenCalledWith(connection.id, [
      { targetType: "company", targetId: "company-1" },
      { targetType: "agent", targetId: "agent-1" },
    ]);
    expect(client.finishApp.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(
      client.putConnectionInstalls.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it("does not mistake the old local LocalCrab runtime for the hosted service", () => {
    expect(isOfficialOpenCrabConnection({
      id: "local-1",
      transport: "local_stdio",
      status: "active",
      enabled: true,
      config: { templateId: "paperclip.opencrab" },
    })).toBe(false);
  });

  it("rejects URLs that are not official account-scoped MCP endpoints", async () => {
    await expect(connectOfficialOpenCrab({
      companyId: "company-1",
      agentId: "agent-1",
      mcpUrl: "http://localhost:9000/mcp",
      connections: [],
      client: {} as never,
    })).rejects.toThrow("opencrab.sh/api/mcp/ocm_");

    await expect(connectOfficialOpenCrab({
      companyId: "company-1",
      agentId: "agent-1",
      mcpUrl: "https://opencrab.sh/api/mcp/not-a-key",
      connections: [],
      client: {} as never,
    })).rejects.toThrow("opencrab.sh/api/mcp/ocm_");
  });

  it("loads packs by discovering and calling the official MCP pack-list tool", async () => {
    const client = {
      listCatalog: vi.fn().mockResolvedValue({
        catalog: [{
          toolName: "opencrab_search_packs",
          description: "Search every ontology pack allowed by the caller's tier.",
          inputSchema: { type: "object", properties: {}, required: [] },
          isReadOnly: true,
          status: "active",
        }],
      }),
      runTestCall: vi.fn().mockResolvedValue({
        decision: "allowed",
        invocationId: "invocation-1",
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({
              access_mode: "marketplace_installed_only",
              packs: [{ package_id: "pack-1", title: "인테리어 마케팅 팩" }],
            }),
          }],
        },
      }),
    };

    const packs = await fetchOfficialOpenCrabPacks({
      connectionId: "connection-1",
      agentId: "agent-1",
      client,
    });

    expect(client.runTestCall).toHaveBeenCalledWith("connection-1", {
      agentId: "agent-1",
      toolName: "opencrab_search_packs",
      parameters: { limit: 1000 },
    });
    expect(packs).toEqual([
      expect.objectContaining({ id: "pack-1", name: "인테리어 마케팅 팩" }),
    ]);
  });
});
