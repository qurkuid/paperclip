import { describe, expect, it } from "vitest";
import manifest, { PUBLISH_JOB_KEY, ROUTE_PATH, TOOL_NAMES } from "../src/manifest.js";
import plugin from "../src/worker.js";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";

describe("autoTHREADS plugin contract", () => {
  it("keeps publishing opt-in and secret-ref-only", () => {
    expect(manifest.database).toMatchObject({ namespaceSlug: "autothreads", migrationsDir: "migrations" });
    expect(manifest.instanceConfigSchema?.properties).toMatchObject({
      threadsAccessTokenRef: { format: "secret-ref" },
      publishingPaused: { default: true },
    });
    expect(manifest.jobs?.[0]).toMatchObject({ jobKey: PUBLISH_JOB_KEY, schedule: "* * * * *" });
    expect(manifest.ui?.slots).toContainEqual(expect.objectContaining({ type: "page", routePath: ROUTE_PATH }));
  });

  it("asks only for the capabilities required by the MVP", () => {
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
      "database.namespace.migrate", "api.routes.register", "jobs.schedule", "secrets.read-ref", "activity.log.write",
      "instance.settings.register", "agent.tools.register",
    ]));
    expect(manifest.capabilities).not.toContain("issues.create");
  });

  it("registers only draft-safe agent tools", async () => {
    expect(manifest.tools?.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_NAMES).not.toContain("publish" as never);
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    await expect(harness.executeTool("list_contents", {}, {
      companyId: "company-a", agentId: "agent-a", projectId: "project-a", runId: "run-a",
    })).resolves.toMatchObject({ data: { contents: [] } });
    await expect(harness.executeTool("create_draft", { body: "Draft" }, {
      companyId: "company-a", agentId: "agent-a", projectId: "project-a", runId: "run-a",
    })).resolves.toMatchObject({ error: "idempotency_key_required" });
  });

  it("requires a complete, review-gated connection before publishing can be enabled", () => {
    const enabled = manifest.instanceConfigSchema as Record<string, unknown>;
    expect(enabled.allOf).toBeDefined();
  });

  it("rejects an enabled publisher without its connection and approval roles", async () => {
    await expect(plugin.definition.onValidateConfig?.({ publishingPaused: false })).resolves.toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Threads user ID is required.", "At least one reviewer is required."]),
    });
  });

  it("reports only safe secret connection state", async () => {
    const harness = createTestHarness({ manifest, config: { publishingPaused: true } });
    await plugin.definition.setup(harness.ctx);
    await expect(plugin.definition.onApiRequest?.({
      routeKey: "health", method: "GET", path: "/health", params: {}, query: {}, body: null,
      actor: { actorType: "user", actorId: "board", userId: "board" }, companyId: "company-a", headers: {},
    })).resolves.toMatchObject({ body: { publishingPaused: true, token: "missing", userIdConfigured: false } });
  });

  it("keeps list reads and transitions inside the requested company", async () => {
    const harness = createTestHarness({ manifest, config: { reviewerPrincipalIds: ["reviewer"] } });
    await plugin.definition.setup(harness.ctx);
    const originalQuery = harness.ctx.db.query;
    harness.ctx.db.query = async (sql, params) => {
      if (sql.includes("WHERE id = $1")) return [{
        id: "content-a", company_id: "company-a", revision: 1, body: "Draft", scheduled_at_utc: null,
        status: "IN_REVIEW", approval_status: "NONE", approval_revision: null, idempotency_key: "key", external_media_id: null,
        permalink: null, last_error_code: null, retry_count: 0,
      }];
      return [];
    };
    const result = await plugin.definition.onApiRequest?.({
      routeKey: "content-action", method: "POST", path: "/contents/content-a/review", params: { contentId: "content-a", action: "review" }, query: {}, body: { expectedRevision: 1 },
      actor: { actorType: "user", actorId: "not-a-reviewer", userId: "not-a-reviewer" }, companyId: "company-a", headers: {},
    });
    expect(result).toMatchObject({ status: 403, body: { error: "reviewer_required" } });
    harness.ctx.db.query = originalQuery;
    await plugin.definition.onApiRequest?.({
      routeKey: "contents", method: "GET", path: "/contents", params: {}, query: {}, body: null,
      actor: { actorType: "user", actorId: "board", userId: "board" }, companyId: "company-a", headers: {},
    });
    expect(harness.dbQueries.at(-1)).toMatchObject({ params: ["company-a"] });
  });

  it("rejects another company's content and cannot schedule without approval", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.db.query = async (_sql, params) => params?.[1] === "company-a" ? [{
      id: "content-a", company_id: "company-a", revision: 1, body: "Draft", scheduled_at_utc: null,
      status: "IN_REVIEW", approval_status: "NONE", approval_revision: null, idempotency_key: "key", external_media_id: null,
      permalink: null, last_error_code: null, retry_count: 0,
    }] : [];

    await expect(plugin.definition.onApiRequest?.({
      routeKey: "content-action", method: "POST", path: "/contents/content-a/schedule", params: { contentId: "content-a", action: "schedule" }, query: {}, body: { expectedRevision: 1, scheduledAtUtc: "2099-01-01T00:00:00.000Z" },
      actor: { actorType: "user", actorId: "board", userId: "board" }, companyId: "company-b", headers: {},
    })).resolves.toMatchObject({ status: 404, body: { error: "content_not_found" } });
    await expect(plugin.definition.onApiRequest?.({
      routeKey: "content-action", method: "POST", path: "/contents/content-a/schedule", params: { contentId: "content-a", action: "schedule" }, query: {}, body: { expectedRevision: 1, scheduledAtUtc: "2099-01-01T00:00:00.000Z" },
      actor: { actorType: "user", actorId: "board", userId: "board" }, companyId: "company-a", headers: {},
    })).resolves.toMatchObject({ status: 422, body: { error: "invalid_transition" } });
    expect(harness.dbExecutes).toEqual([]);
  });

  it("requires an explicit review decision", async () => {
    const harness = createTestHarness({ manifest, config: { reviewerPrincipalIds: ["reviewer"] } });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.db.query = async () => [{
      id: "content-a", company_id: "company-a", revision: 1, body: "Draft", scheduled_at_utc: null,
      status: "IN_REVIEW", approval_status: "NONE", approval_revision: null, idempotency_key: "key", external_media_id: null,
      permalink: null, last_error_code: null, retry_count: 0,
    }];

    await expect(plugin.definition.onApiRequest?.({
      routeKey: "content-action", method: "POST", path: "/contents/content-a/review", params: { contentId: "content-a", action: "review" }, query: {}, body: { expectedRevision: 1 },
      actor: { actorType: "user", actorId: "reviewer", userId: "reviewer" }, companyId: "company-a", headers: {},
    })).resolves.toMatchObject({ status: 422, body: { error: "review_decision_required" } });
  });

  it("rolls a scheduled item back to a non-approved draft in its company", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.db.query = async () => [{
      id: "content-a", company_id: "company-a", revision: 2, body: "Draft", scheduled_at_utc: "2099-01-01T00:00:00.000Z",
      status: "SCHEDULED", approval_status: "APPROVED", approval_revision: 2, idempotency_key: "key", external_media_id: null,
      permalink: null, last_error_code: null, retry_count: 0,
    }];
    const execute = harness.ctx.db.execute.bind(harness.ctx.db);
    harness.ctx.db.execute = async (sql, params) => {
      await execute(sql, params);
      return { rowCount: 1 };
    };

    await plugin.definition.onApiRequest?.({
      routeKey: "content-action", method: "POST", path: "/contents/content-a/rollback", params: { contentId: "content-a", action: "rollback" }, query: {}, body: { expectedRevision: 2 },
      actor: { actorType: "user", actorId: "board", userId: "board" }, companyId: "company-a", headers: {},
    });

    expect(harness.dbExecutes[0]?.params).toEqual(["DRAFT", "REVOKED", null, "content-a", "company-a", 2, "SCHEDULED"]);
  });

  it("does not resolve a token or publish while the company kill switch is on", async () => {
    const harness = createTestHarness({ manifest, config: { publishingPaused: true, threadsAccessTokenRef: "secret-ref", threadsUserId: "user" } });
    await plugin.definition.setup(harness.ctx);
    let secretReads = 0;
    harness.ctx.secrets.resolve = async () => { secretReads += 1; return "must-not-be-read"; };
    harness.ctx.db.query = async (sql) => sql.includes("status = 'SCHEDULED'") ? [{
      id: "content-a", company_id: "company-a", revision: 1, body: "Ready", scheduled_at_utc: new Date(0).toISOString(),
      status: "SCHEDULED", approval_status: "APPROVED", approval_revision: 1, idempotency_key: "key", external_media_id: null,
      permalink: null, last_error_code: null, retry_count: 0,
    }] : [];
    await harness.runJob(PUBLISH_JOB_KEY);
    expect(secretReads).toBe(0);
    expect(harness.dbExecutes).toHaveLength(0);
  });

  it("does not persist provider error text that could contain a secret", async () => {
    const harness = createTestHarness({ manifest, config: { publishingPaused: false, threadsAccessTokenRef: "secret-ref", threadsUserId: "user" } });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.secrets.resolve = async () => "resolved-token";
    harness.ctx.db.query = async (sql) => sql.includes("status = 'SCHEDULED'") ? [{
      id: "content-a", company_id: "company-a", revision: 1, body: "Ready", scheduled_at_utc: new Date(0).toISOString(),
      status: "SCHEDULED", approval_status: "APPROVED", approval_revision: 1, idempotency_key: "key", external_media_id: null,
      permalink: null, last_error_code: null, retry_count: 0,
    }] : [];
    const execute = harness.ctx.db.execute.bind(harness.ctx.db);
    harness.ctx.db.execute = async (sql, params) => {
      await execute(sql, params);
      return { rowCount: 1 };
    };
    harness.ctx.http.fetch = async () => { throw new Error("Bearer provider-secret-value"); };

    await harness.runJob(PUBLISH_JOB_KEY);

    const persisted = JSON.stringify(harness.dbExecutes);
    expect(persisted).not.toContain("provider-secret-value");
    expect(persisted).toContain("Publishing request failed. Check the configuration and retry.");
  });
});
