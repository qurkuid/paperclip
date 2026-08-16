import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  activityLog,
  companies,
  createDb,
  heartbeatRuns,
  toolAccessAuditEvents,
  toolApplications,
  toolCatalogEntries,
  toolConnectionInstalls,
  toolConnections,
  toolMcpGateways,
  toolMcpGatewayTokens,
  toolProfileBindings,
  toolProfileEntries,
  toolProfiles,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  buildPaperclipRuntimeMcpServers,
  createManagedMcpRunConfig,
  managedMcpGatewayAppliesToRun,
  selectManagedMcpRuntimeToolNames,
} from "../services/heartbeat.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describe("managed MCP gateway run policy", () => {
  const gateway = {
    profileId: "publisher-profile",
    agentId: null,
    projectId: null,
    issueId: null,
    contextScopeType: "none" as const,
    contextScopeId: null,
  };

  it("requires the gateway profile to be effective for the agent", () => {
    expect(managedMcpGatewayAppliesToRun({
      gateway,
      effectiveProfileIds: new Set(["publisher-profile"]),
      agentId: "content-manager",
      projectId: null,
      issueId: null,
    })).toBe(true);

    expect(managedMcpGatewayAppliesToRun({
      gateway,
      effectiveProfileIds: new Set(["privileged-profile"]),
      agentId: "content-manager",
      projectId: null,
      issueId: null,
    })).toBe(false);
  });

  it("projects permitted upstream names as managed runtime callable aliases", () => {
    expect(selectManagedMcpRuntimeToolNames({
      connectionId: "publisher-connection",
      permittedUpstreamToolNames: ["intm_internal_prepare_content_approval"],
      visibleTools: [
        {
          name: "mcp.intm-internal-data-f34243c6:intm-internal-prepare-content-approval",
          upstreamToolName: "intm_internal_prepare_content_approval",
          connectionId: "publisher-connection",
        },
        {
          name: "mcp.intm-internal-data-f34243c6:intm-internal-publish-approved-content",
          upstreamToolName: "intm_internal_publish_approved_content",
          connectionId: "publisher-connection",
        },
      ],
    })).toEqual(["intm_internal_prepare_content_approval"]);
  });
});

describeEmbeddedPostgres("heartbeat runtime MCP servers", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const originalApiUrl = process.env.PAPERCLIP_API_URL;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-heartbeat-runtime-mcp-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    if (originalApiUrl === undefined) delete process.env.PAPERCLIP_API_URL;
    else process.env.PAPERCLIP_API_URL = originalApiUrl;
    await db.delete(toolMcpGatewayTokens);
    await db.delete(activityLog);
    await db.delete(toolAccessAuditEvents);
    await db.delete(heartbeatRuns);
    await db.delete(toolMcpGateways);
    await db.delete(toolConnectionInstalls);
    await db.delete(toolProfileBindings);
    await db.delete(toolProfileEntries);
    await db.delete(toolProfiles);
    await db.delete(toolCatalogEntries);
    await db.delete(toolConnections);
    await db.delete(toolApplications);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("provisions one gateway per installed connection and mints short-lived run tokens", async () => {
    process.env.PAPERCLIP_API_URL = "https://paperclip.example.test";
    const [company] = await db.insert(companies).values({
      name: `Runtime MCP ${randomUUID()}`,
      issuePrefix: `RM${randomUUID().slice(0, 5).toUpperCase()}`,
    }).returning();
    const [agent] = await db.insert(agents).values({
      companyId: company!.id,
      name: "Runtime MCP Agent",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {},
    }).returning();
    const [application] = await db.insert(toolApplications).values({
      companyId: company!.id,
      applicationKey: `runtime-${randomUUID().slice(0, 8)}`,
      name: "Runtime MCP App",
      type: "mcp_http",
      status: "active",
    }).returning();
    const [installedConnection, uninstalledConnection] = await db.insert(toolConnections).values([
      {
        companyId: company!.id,
        applicationId: application!.id,
        name: "Installed MCP",
        uid: `test/${randomUUID()}`,
        transport: "mcp_remote",
        status: "active",
        enabled: true,
        healthStatus: "healthy",
        config: { url: "https://installed.example.test/mcp" },
      },
      {
        companyId: company!.id,
        applicationId: application!.id,
        name: "Uninstalled MCP",
        uid: `test/${randomUUID()}`,
        transport: "mcp_remote",
        status: "active",
        enabled: true,
        config: { url: "https://uninstalled.example.test/mcp" },
      },
    ]).returning();
    const [profile] = await db.insert(toolProfiles).values({
      companyId: company!.id,
      profileKey: `app:${installedConnection!.id}`,
      name: "Installed MCP",
      defaultAction: "deny",
    }).returning();
    await db.insert(toolProfileEntries).values({
      companyId: company!.id,
      profileId: profile!.id,
      selectorType: "connection",
      effect: "include",
      applicationId: application!.id,
      connectionId: installedConnection!.id,
    });
    await db.insert(toolProfileBindings).values({
      companyId: company!.id,
      profileId: profile!.id,
      targetType: "agent",
      targetId: agent!.id,
    });
    await db.insert(toolConnectionInstalls).values({
      companyId: company!.id,
      connectionId: installedConnection!.id,
      targetType: "agent",
      targetId: agent!.id,
    });
    await db.insert(toolCatalogEntries).values({
      companyId: company!.id,
      applicationId: application!.id,
      connectionId: installedConnection!.id,
      name: "publish_content",
      toolName: "publish_content",
      riskLevel: "write",
      versionHash: randomUUID(),
      schemaHash: randomUUID(),
    });

    const before = Date.now();
    const first = await buildPaperclipRuntimeMcpServers({ db, agent: agent!, runId: randomUUID() });
    const second = await buildPaperclipRuntimeMcpServers({ db, agent: agent!, runId: randomUUID() });

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      name: `paperclip-${installedConnection!.id.slice(0, 8)}`,
      connectionId: installedConnection!.id,
      url: expect.stringMatching(/^https:\/\/paperclip\.example\.test\/api\/tool-gateway\/gateways\/.+\/mcp$/),
      token: expect.stringMatching(/^pcgw_/),
      toolNames: ["publish_content"],
    });
    expect(first.some((server) => server.connectionId === uninstalledConnection!.id)).toBe(false);
    expect(second).toHaveLength(1);

    const gateways = await db.select().from(toolMcpGateways);
    expect(gateways).toHaveLength(1);
    expect(gateways[0]!.metadata).toMatchObject({ managedRuntimeConnectionId: installedConnection!.id });
    const tokens = await db.select().from(toolMcpGatewayTokens);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      expect(token.subjectType).toBe("heartbeat_run");
      expect(token.subjectId).toMatch(/^[0-9a-f-]{36}$/);
      expect(token.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
      expect(token.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000);
    }
    expect(JSON.stringify(tokens)).not.toContain(first[0]!.token);
  });

  it("mints managed gateway tokens only for profiles effective for the agent", async () => {
    const [company] = await db.insert(companies).values({
      name: `Managed MCP least privilege ${randomUUID()}`,
      issuePrefix: `ML${randomUUID().slice(0, 5).toUpperCase()}`,
    }).returning();
    const [agent] = await db.insert(agents).values({
      companyId: company!.id,
      name: "Managed MCP Agent",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {},
    }).returning();
    const [allowedProfile, privilegedProfile] = await db.insert(toolProfiles).values([
      {
        companyId: company!.id,
        profileKey: `allowed-${randomUUID()}`,
        name: "Allowed publisher",
        defaultAction: "deny",
      },
      {
        companyId: company!.id,
        profileKey: `privileged-${randomUUID()}`,
        name: "Privileged operations",
        defaultAction: "allow",
      },
    ]).returning();
    await db.insert(toolProfileBindings).values({
      companyId: company!.id,
      profileId: allowedProfile!.id,
      targetType: "agent",
      targetId: agent!.id,
    });
    const [allowedGateway, privilegedGateway] = await db.insert(toolMcpGateways).values([
      {
        companyId: company!.id,
        profileId: allowedProfile!.id,
        name: "Allowed publisher",
        slug: `allowed-${randomUUID()}`,
      },
      {
        companyId: company!.id,
        profileId: privilegedProfile!.id,
        name: "Privileged operations",
        slug: `privileged-${randomUUID()}`,
      },
    ]).returning();

    const runId = randomUUID();
    const config = await createManagedMcpRunConfig({
      db,
      agent: agent!,
      runId,
      config: {},
      projectId: null,
      issueId: null,
    });

    expect(config?.gateways).toHaveLength(1);
    expect(config?.gateways[0]).toMatchObject({
      id: allowedGateway!.id,
      name: "Allowed publisher",
      bearerToken: expect.stringMatching(/^pcgw_/),
    });
    expect(config?.gateways.some((gateway) => gateway.id === privilegedGateway!.id)).toBe(false);
    const tokens = await db.select().from(toolMcpGatewayTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      gatewayId: allowedGateway!.id,
      subjectType: "heartbeat_run",
      subjectId: runId,
    });
  });

  it("does not mint a duplicate managed token for runtime connection gateways", async () => {
    const [company] = await db.insert(companies).values({
      name: `Managed MCP runtime dedupe ${randomUUID()}`,
      issuePrefix: `MD${randomUUID().slice(0, 5).toUpperCase()}`,
    }).returning();
    const [agent] = await db.insert(agents).values({
      companyId: company!.id,
      name: "Managed MCP Runtime Agent",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {},
    }).returning();
    const [profile] = await db.insert(toolProfiles).values({
      companyId: company!.id,
      profileKey: `runtime-${randomUUID()}`,
      name: "Runtime publisher",
      defaultAction: "deny",
    }).returning();
    await db.insert(toolProfileBindings).values({
      companyId: company!.id,
      profileId: profile!.id,
      targetType: "agent",
      targetId: agent!.id,
    });
    await db.insert(toolMcpGateways).values({
      companyId: company!.id,
      profileId: profile!.id,
      name: "Runtime publisher",
      slug: `runtime-${randomUUID()}`,
      metadata: { managedRuntimeConnectionId: randomUUID() },
    });

    const config = await createManagedMcpRunConfig({
      db,
      agent: agent!,
      runId: randomUUID(),
      config: {},
      projectId: null,
      issueId: null,
    });

    expect(config).toBeNull();
    expect(await db.select().from(toolMcpGatewayTokens)).toHaveLength(0);
  });

  it("audits permitted remote MCP connections that were not installed when delivery is empty", async () => {
    const [company] = await db.insert(companies).values({
      name: `Runtime MCP diagnostic ${randomUUID()}`,
      issuePrefix: `RD${randomUUID().slice(0, 5).toUpperCase()}`,
    }).returning();
    const [agent] = await db.insert(agents).values({
      companyId: company!.id,
      name: "Runtime MCP Diagnostic Agent",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {},
    }).returning();
    const [application] = await db.insert(toolApplications).values({
      companyId: company!.id,
      applicationKey: `runtime-diagnostic-${randomUUID().slice(0, 8)}`,
      name: "Zapier",
      type: "mcp_http",
      status: "active",
    }).returning();
    const [connection] = await db.insert(toolConnections).values({
      companyId: company!.id,
      applicationId: application!.id,
      name: "Zapier",
      uid: `test/${randomUUID()}`,
      transport: "mcp_remote",
      status: "active",
      enabled: true,
      config: { url: "https://zapier.example.test/mcp" },
    }).returning();
    const [profile] = await db.insert(toolProfiles).values({
      companyId: company!.id,
      profileKey: `app:${connection!.id}`,
      name: "Zapier",
      defaultAction: "deny",
    }).returning();
    await db.insert(toolProfileEntries).values({
      companyId: company!.id,
      profileId: profile!.id,
      selectorType: "connection",
      effect: "include",
      applicationId: application!.id,
      connectionId: connection!.id,
    });
    await db.insert(toolProfileBindings).values({
      companyId: company!.id,
      profileId: profile!.id,
      targetType: "agent",
      targetId: agent!.id,
    });
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId: company!.id,
      agentId: agent!.id,
      status: "running",
      contextSnapshot: {},
    });

    const servers = await buildPaperclipRuntimeMcpServers({ db, agent: agent!, runId });

    expect(servers).toEqual([]);
    const [activity] = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "tool_gateway.runtime_mcp_delivery"));
    expect(activity).toMatchObject({
      companyId: company!.id,
      agentId: agent!.id,
      runId,
      details: expect.objectContaining({
        reasonCode: "permitted_connections_not_installed",
        deliveredServerCount: 0,
        permittedNotInstalledCount: 1,
        permittedNotInstalledConnections: [{ id: connection!.id, name: "Zapier" }],
      }),
    });
    const [audit] = await db.select().from(toolAccessAuditEvents);
    expect(audit).toMatchObject({
      companyId: company!.id,
      actorType: "agent",
      actorId: agent!.id,
      reasonCode: "permitted_connections_not_installed",
      details: expect.objectContaining({ runId, deliveredServerCount: 0 }),
    });
  });
});
