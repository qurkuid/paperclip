import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";

import { aggregateVariantMetrics } from "../analytics.js";
import {
  toolExperimentPayloadSchema,
  toolOverviewPayloadSchema,
} from "../contracts/index.js";
import {
  requireCompanyAccess,
  requireDetail,
  sanitizeObservation,
  type ExperimentToolDeps,
} from "./support.js";

export function createReadToolHandlers(deps: ExperimentToolDeps) {
  async function overview(
    params: unknown,
    runCtx: ToolRunContext,
  ): Promise<ToolResult> {
    const input = toolOverviewPayloadSchema.parse(params);
    requireCompanyAccess(runCtx, input.companyId);
    const experiments = await deps.repository.listExperiments(runCtx.companyId);
    const filtered = experiments.filter((experiment) =>
      (input.includeArchived === true || experiment.archivedAt === null)
      && (
        input.status === undefined
        || input.status.includes(experiment.status)
      ));
    const summaries = await Promise.all(filtered.map(async (experiment) => {
      const detail = await deps.repository.getExperiment(
        runCtx.companyId,
        experiment.id,
      );
      if (detail === null) return null;
      const metrics = aggregateVariantMetrics(detail.variants, detail.entries);
      return {
        experiment,
        variantMetrics: metrics,
        totalSample: metrics.reduce((sum, metric) => sum + metric.sample, 0),
        latestObservation: sanitizeObservation(detail.observations[0] ?? null),
      };
    }));
    return {
      content: `공간보감 실험 ${filtered.length}건을 확인했습니다.`,
      data: {
        companyId: runCtx.companyId,
        experiments: summaries.filter((summary) => summary !== null),
      },
    };
  }

  async function getExperiment(
    params: unknown,
    runCtx: ToolRunContext,
  ): Promise<ToolResult> {
    const input = toolExperimentPayloadSchema.parse(params);
    requireCompanyAccess(runCtx, input.companyId);
    const detail = await requireDetail(
      deps,
      runCtx.companyId,
      input.experimentId,
    );
    return {
      content: `${detail.experiment.title} 실험의 구조화 상태를 확인했습니다.`,
      data: {
        experiment: detail.experiment,
        variants: detail.variants,
        variantMetrics: aggregateVariantMetrics(
          detail.variants,
          detail.entries,
        ),
        latestSnapshot: detail.snapshots[0] ?? null,
        recentObservations: detail.observations
          .slice(0, 10)
          .map((observation) => sanitizeObservation(observation)),
      },
    };
  }

  return { overview, getExperiment };
}
