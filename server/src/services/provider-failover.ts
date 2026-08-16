import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { logActivity } from "./activity-log.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

export function withoutClaudeCredentials(config: RecordValue): RecordValue {
  const env = record(config.env);
  const safeEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !/(?:claude|anthropic)/i.test(key)));
  return Object.fromEntries(Object.entries({ ...config, ...(Object.keys(env).length ? { env: safeEnv } : {}) })
    .filter(([key]) => !/(?:claude|anthropic)/i.test(key)));
}

export async function failOverClaudeQuotaToCodex(input: {
  db: Db;
  companyId: string;
  agentId: string;
  runId: string;
  reason: string;
}) {
  const [company, agent] = await Promise.all([
    input.db.select({ config: companies.providerFailoverConfig }).from(companies).where(eq(companies.id, input.companyId)).then((rows) => rows[0] ?? null),
    input.db.select().from(agents).where(and(eq(agents.companyId, input.companyId), eq(agents.id, input.agentId))).then((rows) => rows[0] ?? null),
  ]);
  const fallback = record(record(company?.config).claudeQuotaFallback);
  if (!agent || agent.adapterType !== "claude_local" || fallback.enabled !== true || fallback.adapterType !== "codex_local" || fallback.model !== "gpt-5.6-sol") return null;

  const updated = await input.db.update(agents).set({
    adapterType: "codex_local",
    adapterConfig: { ...withoutClaudeCredentials(record(agent.adapterConfig)), model: "gpt-5.6-sol" },
    updatedAt: new Date(),
  }).where(and(eq(agents.companyId, input.companyId), eq(agents.id, input.agentId), eq(agents.adapterType, "claude_local"))).returning();
  const switched = updated[0] ?? null;
  if (!switched) return null;

  await logActivity(input.db, {
    companyId: input.companyId,
    actorType: "system",
    actorId: "provider_failover",
    agentId: input.agentId,
    runId: input.runId,
    action: "agent.provider_failed_over",
    entityType: "agent",
    entityId: input.agentId,
    details: { reason: input.reason, previousAdapterType: "claude_local", adapterType: "codex_local", model: "gpt-5.6-sol" },
  });
  return switched;
}
