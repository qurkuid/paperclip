import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";

import { aggregateVariantMetrics } from "./analytics.js";
import { readExperimentPluginConfig } from "./config.js";
import { PLUGIN_ID, ROUTINE_KEY, SPACEBOGAM_AGENT_KEY } from "./manifest.js";
import type { createExperimentRepository } from "./repository.js";

type ExperimentRepository = ReturnType<typeof createExperimentRepository>;

const companyParamsSchema = z.object({
  companyId: z.string().uuid(),
}).passthrough();

function readyPayload(
  ctx: PluginContext,
  companyId: string,
  configured: boolean,
  extra: Record<string, unknown>,
) {
  return {
    pluginId: PLUGIN_ID,
    companyId,
    status: "ready",
    configured,
    namespace: ctx.db.namespace,
    managed: {
      agentKey: SPACEBOGAM_AGENT_KEY,
      routineKey: ROUTINE_KEY,
    },
    ...extra,
  };
}

export function registerExperimentBoardData(
  ctx: PluginContext,
  repository: ExperimentRepository,
) {
  ctx.data.register("overview", async (params) => {
    const { companyId } = companyParamsSchema.parse(params);
    const [config, experiments] = await Promise.all([
      readExperimentPluginConfig(ctx, companyId),
      repository.listExperiments(companyId),
    ]);
    return readyPayload(ctx, companyId, config !== null, { experiments });
  });

  ctx.data.register("experiment", async (params) => {
    const parsed = companyParamsSchema.extend({
      experimentId: z.string().uuid().optional(),
    }).parse(params);
    if (parsed.experimentId === undefined) return null;
    const detail = await repository.getExperiment(
      parsed.companyId,
      parsed.experimentId,
    );
    if (detail === null) return null;
    return {
      experiment: detail.experiment,
      variants: detail.variants,
      variantMetrics: aggregateVariantMetrics(detail.variants, detail.entries),
      snapshots: detail.snapshots,
      recentObservations: detail.observations.slice(0, 20),
    };
  });

  ctx.data.register("operations-options", async (params) => {
    const { companyId } = companyParamsSchema.parse(params);
    const [agents, issues, routine] = await Promise.all([
      ctx.agents.list({ companyId, limit: 200, offset: 0 }),
      ctx.issues.list({ companyId, limit: 100, offset: 0 }),
      ctx.routines.managed.get(ROUTINE_KEY, companyId),
    ]);
    return {
      agents: agents
        .filter((agent) => agent.status !== "terminated")
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          title: agent.title,
          status: agent.status,
        })),
      issues: issues.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
      })),
      routine: {
        resolutionStatus: routine.status,
        id: routine.routineId,
        status: routine.routine?.status ?? "paused",
        assigneeAgentId: routine.routine?.assigneeAgentId ?? null,
      },
    };
  });
}
