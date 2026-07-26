import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest, {
  PLUGIN_ID,
  ROUTE_PATH,
  ROUTINE_KEY,
  SPACEBOGAM_AGENT_KEY,
  TOOL_NAMES,
} from "../src/manifest.js";
import plugin from "../src/worker.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const SECRET_REF = {
  type: "secret_ref",
  secretId: "spacebogam-lead-hash",
  version: "latest",
};

describe("spacebogam experiments plugin bundle", () => {
  it("declares the first-party host contract", () => {
    expect(manifest.id).toBe(PLUGIN_ID);
    expect(manifest.database).toMatchObject({
      namespaceSlug: "spacebogam_experiments",
      migrationsDir: "migrations",
      coreReadTables: ["companies", "issues", "issue_comments", "agents", "projects"],
    });
    expect(manifest.capabilities).toEqual([
      "database.namespace.migrate",
      "database.namespace.read",
      "database.namespace.write",
      "secrets.read-ref",
      "activity.read",
      "activity.log.write",
      "issues.read",
      "issues.create",
      "issues.update",
      "issues.wakeup",
      "issue.comments.read",
      "issue.comments.create",
      "issue.interactions.create",
      "issue.documents.read",
      "issue.documents.write",
      "agents.read",
      "agents.managed",
      "agent.sessions.create",
      "agent.sessions.list",
      "agent.sessions.send",
      "agent.sessions.close",
      "routines.managed",
      "agent.tools.register",
      "api.routes.register",
      "ui.sidebar.register",
      "ui.page.register",
    ]);
    expect(manifest.entrypoints).toEqual({
      worker: "./dist/worker.js",
      ui: "./dist/ui",
    });
  });

  it("prepares native navigation slots and managed operations resources", () => {
    expect(ROUTE_PATH).toMatch(/^[a-z0-9][a-z0-9-]*$/u);
    expect(["api", "admin", "settings", "plugins"]).not.toContain(ROUTE_PATH);
    expect(manifest.ui?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "sidebar",
        id: "spacebogam-experiments-sidebar",
        displayName: "실험 운영",
      }),
      expect.objectContaining({ type: "page", routePath: ROUTE_PATH, exportName: "SpacebogamExperimentsPage" }),
      expect.objectContaining({ type: "routeSidebar", routePath: ROUTE_PATH, exportName: "SpacebogamExperimentsRouteSidebar" }),
    ]));
    expect(manifest.agents).toContainEqual(expect.objectContaining({
      agentKey: SPACEBOGAM_AGENT_KEY,
      status: "paused",
      budgetMonthlyCents: 0,
    }));
    expect(manifest.routines).toContainEqual(expect.objectContaining({
      routineKey: ROUTINE_KEY,
      status: "paused",
      assigneeRef: { resourceKind: "agent", resourceKey: SPACEBOGAM_AGENT_KEY },
    }));
  });

  it("registers bridge data, board actions, and all experiment tools", async () => {
    expect(TOOL_NAMES).toHaveLength(4);
    expect(manifest.tools?.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    const harness = createTestHarness({
      manifest,
      config: { leadHashSecret: SECRET_REF },
    });
    await plugin.definition.setup(harness.ctx);

    await expect(harness.getData("overview", { companyId: COMPANY_ID })).resolves.toMatchObject({
      pluginId: PLUGIN_ID,
      companyId: COMPANY_ID,
      status: "ready",
      namespace: "test_paperclipai_plugin_spacebogam_experiments",
      experiments: [],
    });
    await expect(harness.performAction("board-action", {
      companyId: COMPANY_ID,
      action: "request-strategy",
      payload: {
        experimentId: "22222222-2222-4222-8222-222222222222",
        request: "Draft next test",
        version: 1,
      },
    }, {
      actor: { type: "user", userId: "user-1" },
      companyId: COMPANY_ID,
    })).resolves.toMatchObject({ ok: false, code: "experiment_not_found" });

    await expect(harness.executeTool(TOOL_NAMES[0], {
      companyId: COMPANY_ID,
    }, {
      companyId: COMPANY_ID,
      agentId: "agent-1",
      projectId: "project-1",
      runId: "run-1",
    })).resolves.toMatchObject({
      data: { companyId: COMPANY_ID, experiments: [] },
    });
    await expect(harness.executeTool(TOOL_NAMES[1], {
      companyId: COMPANY_ID,
      experimentId: "22222222-2222-4222-8222-222222222222",
    }, {
      companyId: COMPANY_ID,
      agentId: "agent-1",
      projectId: "project-1",
      runId: "run-1",
    })).rejects.toThrow("Experiment not found");
  });
});
