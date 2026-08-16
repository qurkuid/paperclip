import { randomUUID } from "node:crypto";
import { definePlugin, runWorker, type PluginApiRequestInput, type PluginContext, type PluginPerformActionContext, type ToolResult, type ToolRunContext } from "@paperclipai/plugin-sdk";
import manifest, { PLUGIN_ID, PUBLISH_JOB_KEY, TOOL_NAMES } from "./manifest.js";

type Content = { id: string; company_id: string; revision: number; body: string; scheduled_at_utc: string | null; status: string; approval_status: string; approval_revision: number | null; idempotency_key: string; external_media_id: string | null; permalink: string | null; last_error_code: string | null; retry_count: number };
type Config = { threadsAccessTokenRef?: string | { type: "secret_ref"; secretId: string; version?: string }; threadsUserId?: string; reviewerPrincipalIds?: unknown; approverPrincipalIds?: unknown; publishingPaused?: boolean };
type Actor = { actorType: "user" | "agent" | "system"; actorId: string };

const table = (ctx: PluginContext, name: string) => `${ctx.db.namespace}.${name}`;
const asRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const expectedRevision = (body: Record<string, unknown>) => Number.isInteger(body.expectedRevision) ? Number(body.expectedRevision) : null;
const principalIds = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())) : [];
const publishFailureMessage = "Publishing request failed. Check the configuration and retry.";

function publishConfigErrors(config: Config) {
  if (config.publishingPaused !== false) return [];
  const errors: string[] = [];
  if (!config.threadsAccessTokenRef || typeof config.threadsAccessTokenRef === "string") errors.push("Threads access-token secret reference is required.");
  if (!asString(config.threadsUserId)) errors.push("Threads user ID is required.");
  if (principalIds(config.reviewerPrincipalIds).length === 0) errors.push("At least one reviewer is required.");
  if (principalIds(config.approverPrincipalIds).length === 0) errors.push("At least one final approver is required.");
  return errors;
}

let activeContext: PluginContext | null = null;

function requireContext() {
  if (!activeContext) throw new Error("autoTHREADS plugin has not been set up");
  return activeContext;
}

function actorFromApi(actor: PluginApiRequestInput["actor"]): Actor {
  return { actorType: actor.actorType, actorId: actor.actorId };
}

function actorFromAction(context: PluginPerformActionContext): Actor {
  const actorId = context.actor.userId ?? context.actor.agentId;
  if (!actorId || context.actor.type === "system") throw new Error("An authenticated user or agent is required");
  return { actorType: context.actor.type, actorId };
}

function hasPrincipal(ids: unknown, actor: Actor) {
  const allowed = principalIds(ids);
  return allowed.length > 0 && allowed.includes(actor.actorId);
}

async function activity(ctx: PluginContext, companyId: string, contentId: string, message: string, metadata: Record<string, unknown>) {
  await ctx.activity.log({ companyId, entityType: "autothreads_content", entityId: contentId, message, metadata });
}

async function getContent(ctx: PluginContext, companyId: string, contentId: string) {
  return (await ctx.db.query<Content>(`SELECT * FROM ${table(ctx, "contents")} WHERE id = $1 AND company_id = $2`, [contentId, companyId]))[0] ?? null;
}

async function listContents(ctx: PluginContext, companyId: string) {
  return ctx.db.query<Content>(`SELECT * FROM ${table(ctx, "contents")} WHERE company_id = $1 ORDER BY scheduled_at_utc NULLS LAST, created_at DESC`, [companyId]);
}

async function createDraft(ctx: PluginContext, companyId: string, actor: Actor, body: Record<string, unknown>) {
  const text = asString(body.body);
  if (!text || text.length > 500) return { status: 422, body: { error: "body_must_be_1_to_500_characters" } };
  const idempotencyKey = asString(body.idempotencyKey) ?? randomUUID();
  if (idempotencyKey.length > 200) return { status: 422, body: { error: "idempotency_key_too_long" } };
  const existing = (await ctx.db.query<Content>(`SELECT * FROM ${table(ctx, "contents")} WHERE company_id = $1 AND idempotency_key = $2`, [companyId, idempotencyKey]))[0];
  if (existing) return { body: existing };

  const id = randomUUID();
  await ctx.db.execute(`INSERT INTO ${table(ctx, "contents")} (id, company_id, body, idempotency_key) VALUES ($1, $2, $3, $4) ON CONFLICT (company_id, idempotency_key) DO NOTHING`, [id, companyId, text, idempotencyKey]);
  const content = (await ctx.db.query<Content>(`SELECT * FROM ${table(ctx, "contents")} WHERE company_id = $1 AND idempotency_key = $2`, [companyId, idempotencyKey]))[0];
  if (!content) return { status: 409, body: { error: "draft_create_conflict" } };
  if (content.id !== id) return { body: content };
  await ctx.db.execute(`INSERT INTO ${table(ctx, "content_revisions")} (id, content_id, company_id, revision, body, changed_by) VALUES ($1, $2, $3, 1, $4, $5)`, [randomUUID(), id, companyId, text, actor.actorId]);
  await activity(ctx, companyId, id, "autoTHREADS draft created", { actor: actor.actorId, revision: 1 });
  return { status: 201, body: content };
}

async function transition(ctx: PluginContext, companyId: string, actor: Actor, contentId: string, action: string, body: Record<string, unknown>) {
  const content = await getContent(ctx, companyId, contentId);
  if (!content) return { status: 404, body: { error: "content_not_found" } };
  const revision = expectedRevision(body);
  if (revision === null || revision !== content.revision) return { status: 409, body: { error: "revision_conflict", revision: content.revision } };
  const config = await ctx.config.get(companyId) as Config;
  let nextStatus = content.status;
  let nextApproval = content.approval_status;
  let scheduledAt = content.scheduled_at_utc;

  if (action === "edit" && ["DRAFT", "IN_REVIEW", "SCHEDULED"].includes(content.status)) {
    const text = asString(body.body);
    if (!text || text.length > 500) return { status: 422, body: { error: "body_must_be_1_to_500_characters" } };
    const changed = await ctx.db.execute(`UPDATE ${table(ctx, "contents")} SET body = $1, revision = revision + 1, status = 'DRAFT', approval_status = 'REVOKED', approval_revision = NULL, scheduled_at_utc = NULL, updated_at = now() WHERE id = $2 AND company_id = $3 AND revision = $4`, [text, content.id, companyId, revision]);
    if (changed.rowCount !== 1) return { status: 409, body: { error: "revision_conflict" } };
    const nextRevision = revision + 1;
    await ctx.db.execute(`INSERT INTO ${table(ctx, "content_revisions")} (id, content_id, company_id, revision, body, changed_by) VALUES ($1, $2, $3, $4, $5, $6)`, [randomUUID(), content.id, companyId, nextRevision, text, actor.actorId]);
    await activity(ctx, companyId, content.id, "autoTHREADS approval revoked by edit", { actor: actor.actorId, fromStatus: content.status, toStatus: "DRAFT", revision: nextRevision });
    return { body: await getContent(ctx, companyId, content.id) };
  }
  if (action === "submit-review" && content.status === "DRAFT") nextStatus = "IN_REVIEW";
  else if (action === "review" && content.status === "IN_REVIEW") {
    if (!hasPrincipal(config.reviewerPrincipalIds, actor)) return { status: 403, body: { error: "reviewer_required" } };
    if (body.decision !== "approve" && body.decision !== "reject") return { status: 422, body: { error: "review_decision_required" } };
    nextApproval = body.decision === "reject" ? "NONE" : "REVIEWED";
    nextStatus = body.decision === "reject" ? "DRAFT" : "IN_REVIEW";
  } else if (action === "approve" && content.status === "IN_REVIEW" && content.approval_status === "REVIEWED") {
    if (!hasPrincipal(config.approverPrincipalIds, actor)) return { status: 403, body: { error: "approver_required" } };
    nextApproval = "APPROVED";
  } else if (action === "schedule" && content.status === "IN_REVIEW" && content.approval_status === "APPROVED") {
    scheduledAt = asString(body.scheduledAtUtc);
    if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= Date.now()) return { status: 422, body: { error: "future_scheduled_at_required" } };
    nextStatus = "SCHEDULED";
  } else if (action === "retry" && content.status === "FAILED" && content.retry_count < 1 && content.last_error_code !== "AMBIGUOUS_REMOTE_COMMIT") {
    nextStatus = "SCHEDULED";
  } else if (action === "rollback" && ["IN_REVIEW", "SCHEDULED"].includes(content.status)) {
    nextStatus = "DRAFT";
    nextApproval = "REVOKED";
    scheduledAt = null;
  } else if (action === "cancel" && ["DRAFT", "IN_REVIEW", "SCHEDULED", "FAILED"].includes(content.status)) nextStatus = "CANCELLED";
  else return { status: 422, body: { error: "invalid_transition" } };

  const changed = await ctx.db.execute(
    `UPDATE ${table(ctx, "contents")} SET status = $1, approval_status = $2, approval_revision = CASE WHEN $2 = 'APPROVED' THEN revision ELSE NULL END, scheduled_at_utc = $3, idempotency_key = CASE WHEN $1 = 'SCHEDULED' THEN id || ':' || revision || ':' || $3 ELSE idempotency_key END, updated_at = now() WHERE id = $4 AND company_id = $5 AND revision = $6 AND status = $7`,
    [nextStatus, nextApproval, scheduledAt, content.id, companyId, revision, content.status],
  );
  if (changed.rowCount !== 1) return { status: 409, body: { error: "revision_conflict" } };
  await activity(ctx, companyId, content.id, `autoTHREADS ${action}`, { actor: actor.actorId, fromStatus: content.status, toStatus: nextStatus, revision });
  return { body: await getContent(ctx, companyId, content.id) };
}

async function recordAttempt(ctx: PluginContext, content: Content, outcome: string, fields: { code?: string; message?: string; mediaId?: string } = {}) {
  await ctx.db.execute(`INSERT INTO ${table(ctx, "publish_attempts")} (id, content_id, company_id, attempt_number, outcome, provider_code, safe_message, external_media_id, finished_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`, [randomUUID(), content.id, content.company_id, content.retry_count + 1, outcome, fields.code ?? null, fields.message ?? null, fields.mediaId ?? null]);
}

async function recoverStalePublishing(ctx: PluginContext) {
  const stale = await ctx.db.query<Content>(`SELECT * FROM ${table(ctx, "contents")} WHERE status = 'PUBLISHING' AND updated_at < now() - interval '15 minutes' AND external_media_id IS NULL LIMIT 25`);
  for (const content of stale) {
    await ctx.db.execute(`UPDATE ${table(ctx, "contents")} SET status = 'DRAFT', approval_status = 'REVOKED', approval_revision = NULL, last_error_code = 'AMBIGUOUS_REMOTE_COMMIT', last_error_safe_message = 'Publishing outcome could not be confirmed. Review before scheduling again.', updated_at = now() WHERE id = $1 AND company_id = $2 AND status = 'PUBLISHING'`, [content.id, content.company_id]);
    await recordAttempt(ctx, content, "ambiguous", { code: "AMBIGUOUS_REMOTE_COMMIT", message: "Publishing outcome could not be confirmed." });
    await activity(ctx, content.company_id, content.id, "autoTHREADS publishing outcome requires review", { code: "AMBIGUOUS_REMOTE_COMMIT" });
  }
}

async function publishDue(ctx: PluginContext) {
  await recoverStalePublishing(ctx);
  const due = await ctx.db.query<Content>(`SELECT * FROM ${table(ctx, "contents")} WHERE status = 'SCHEDULED' AND approval_status = 'APPROVED' AND approval_revision = revision AND scheduled_at_utc <= now() AND external_media_id IS NULL AND (next_retry_at IS NULL OR next_retry_at <= now()) ORDER BY scheduled_at_utc LIMIT 25`);
  for (const content of due) {
    const config = await ctx.config.get(content.company_id) as Config;
    if (config.publishingPaused !== false || !config.threadsUserId || !config.threadsAccessTokenRef) continue;
    const claimed = await ctx.db.execute(`UPDATE ${table(ctx, "contents")} SET status = 'PUBLISHING', updated_at = now() WHERE id = $1 AND company_id = $2 AND status = 'SCHEDULED' AND approval_status = 'APPROVED' AND approval_revision = revision AND external_media_id IS NULL`, [content.id, content.company_id]);
    if (claimed.rowCount !== 1) continue;
    try {
      const token = await ctx.secrets.resolve(config.threadsAccessTokenRef as Parameters<typeof ctx.secrets.resolve>[0], { companyId: content.company_id, configPath: "threadsAccessTokenRef" });
      const create = await ctx.http.fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(config.threadsUserId)}/threads`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ media_type: "TEXT", text: content.body }) });
      const container = asRecord(await create.json());
      const creationId = asString(container.id);
      if (!create.ok || !creationId) throw new Error(`container_${create.status}`);
      const publish = await ctx.http.fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(config.threadsUserId)}/threads_publish`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ creation_id: creationId }) });
      const result = asRecord(await publish.json());
      const mediaId = asString(result.id);
      if (!publish.ok || !mediaId) throw new Error(`publish_${publish.status}`);
      const saved = await ctx.db.execute(`UPDATE ${table(ctx, "contents")} SET status = 'PUBLISHED', external_media_id = $1, published_at = now(), updated_at = now() WHERE id = $2 AND company_id = $3 AND status = 'PUBLISHING' AND external_media_id IS NULL`, [mediaId, content.id, content.company_id]);
      if (saved.rowCount !== 1) throw new Error("publish_result_conflict");
      await recordAttempt(ctx, content, "published", { mediaId });
      await activity(ctx, content.company_id, content.id, "autoTHREADS published", { revision: content.revision, externalMediaId: mediaId });
    } catch (error) {
      const ambiguous = /timeout|abort|network|publish_result_conflict/iu.test(String(error));
      const retry = !ambiguous && content.retry_count === 0;
      await ctx.db.execute(`UPDATE ${table(ctx, "contents")} SET status = $1, approval_status = CASE WHEN $2 THEN approval_status ELSE 'REVOKED' END, approval_revision = CASE WHEN $2 THEN approval_revision ELSE NULL END, retry_count = retry_count + CASE WHEN $2 THEN 1 ELSE 0 END, next_retry_at = CASE WHEN $2 THEN now() + interval '5 minutes' ELSE NULL END, last_error_code = $3, last_error_safe_message = $4, updated_at = now() WHERE id = $5 AND company_id = $6 AND status = 'PUBLISHING'`, [retry ? "SCHEDULED" : "DRAFT", retry, ambiguous ? "AMBIGUOUS_REMOTE_COMMIT" : "PUBLISH_FAILED", publishFailureMessage, content.id, content.company_id]);
      await recordAttempt(ctx, content, ambiguous ? "ambiguous" : "failed", { code: ambiguous ? "AMBIGUOUS_REMOTE_COMMIT" : "PUBLISH_FAILED", message: publishFailureMessage });
      await activity(ctx, content.company_id, content.id, "autoTHREADS publish failed", { code: ambiguous ? "AMBIGUOUS_REMOTE_COMMIT" : "PUBLISH_FAILED", retryScheduled: retry });
    }
  }
}

function toolResult(result: { status?: number; body?: unknown }, success: string): ToolResult {
  return result.status !== undefined && result.status >= 400
    ? { error: typeof result.body === "object" && result.body !== null && "error" in result.body ? String(result.body.error) : "autothreads_request_failed", data: result.body }
    : { content: success, data: result.body };
}

function toolInput(params: unknown) {
  return asRecord(params);
}

async function listContentsTool(ctx: PluginContext, _params: unknown, runCtx: ToolRunContext): Promise<ToolResult> {
  const contents = await listContents(ctx, runCtx.companyId);
  return { content: `${contents.length} autoTHREADS content item(s) found.`, data: { contents } };
}

async function createDraftTool(ctx: PluginContext, params: unknown, runCtx: ToolRunContext): Promise<ToolResult> {
  const input = toolInput(params);
  if (!asString(input.idempotencyKey)) return { error: "idempotency_key_required" };
  return toolResult(await createDraft(ctx, runCtx.companyId, { actorType: "agent", actorId: runCtx.agentId }, input), "Draft created for human review.");
}

async function submitForReviewTool(ctx: PluginContext, params: unknown, runCtx: ToolRunContext): Promise<ToolResult> {
  const input = toolInput(params);
  const contentId = asString(input.contentId);
  if (!contentId) return { error: "content_id_required" };
  return toolResult(await transition(ctx, runCtx.companyId, { actorType: "agent", actorId: runCtx.agentId }, contentId, "submit-review", input), "Draft submitted for human review.");
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    ctx.jobs.register(PUBLISH_JOB_KEY, () => publishDue(ctx));
    ctx.data.register("autothreads-health", async ({ companyId }) => {
      const config = await ctx.config.get(asString(companyId) ?? undefined) as Config;
      return { publishingPaused: config.publishingPaused !== false, token: config.threadsAccessTokenRef ? "configured" : "missing", userIdConfigured: Boolean(config.threadsUserId) };
    });
    ctx.data.register("autothreads-contents", async ({ companyId }) => {
      const scopedCompanyId = asString(companyId);
      if (!scopedCompanyId) throw new Error("companyId is required");
      return listContents(ctx, scopedCompanyId);
    });
    ctx.actions.register("create-draft", async (params, actionContext) => {
      const companyId = actionContext.companyId;
      if (!companyId) throw new Error("companyId is required");
      return createDraft(ctx, companyId, actorFromAction(actionContext), params);
    });
    ctx.actions.register("content-transition", async (params, actionContext) => {
      const companyId = actionContext.companyId;
      const contentId = asString(params.contentId);
      const action = asString(params.action);
      if (!companyId || !contentId || !action) throw new Error("companyId, contentId, and action are required");
      return transition(ctx, companyId, actorFromAction(actionContext), contentId, action, params);
    });
    const toolHandlers = { list_contents: listContentsTool, create_draft: createDraftTool, submit_for_review: submitForReviewTool };
    for (const toolName of TOOL_NAMES) {
      const declaration = manifest.tools?.find((tool) => tool.name === toolName);
      if (!declaration) throw new Error(`Missing manifest declaration for ${toolName}`);
      ctx.tools.register(toolName, declaration, (params, runCtx) => toolHandlers[toolName](ctx, params, runCtx));
    }
  },
  async onApiRequest(input) {
    const ctx = requireContext();
    if (input.routeKey === "health") {
      const config = await ctx.config.get(input.companyId) as Config;
      return { body: { publishingPaused: config.publishingPaused !== false, token: config.threadsAccessTokenRef ? "configured" : "missing", userIdConfigured: Boolean(config.threadsUserId) } };
    }
    if (input.routeKey === "contents") return { body: await listContents(ctx, input.companyId) };
    const body = asRecord(input.body);
    if (input.routeKey === "contents-create") return createDraft(ctx, input.companyId, actorFromApi(input.actor), body);
    if (input.routeKey === "content-action") return transition(ctx, input.companyId, actorFromApi(input.actor), input.params.contentId, input.params.action, body);
    return { status: 404, body: { error: "unknown_route" } };
  },
  async onValidateConfig(config) {
    const errors = publishConfigErrors(config as Config);
    return { ok: errors.length === 0, errors };
  },
  async onHealth() { return { status: "ok", message: "autoTHREADS review-gated publisher ready" }; },
});

export default plugin;
runWorker(plugin, import.meta.url);
