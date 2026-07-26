import type {
  PluginActivityLogEntry,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";

import { aggregateVariantMetrics } from "../analytics.js";
import {
  observationSchema,
  snapshotSchema,
  type Observation,
} from "../contracts/index.js";
import type { ExperimentIssueIntegration } from "../issue-integration.js";
import type {
  ExperimentDetail,
  createExperimentRepository,
} from "../repository.js";
import type { FunnelFreshness } from "../service/types.js";

type ExperimentRepository = Pick<
  ReturnType<typeof createExperimentRepository>,
  | "appendObservation"
  | "appendSnapshot"
  | "getExperiment"
  | "listExperiments"
>;

export type ExperimentToolDeps = {
  readonly repository: ExperimentRepository;
  readonly issueIntegration: ExperimentIssueIntegration;
  readonly activity: {
    readonly log: (entry: PluginActivityLogEntry) => Promise<void>;
  };
  readonly now: () => string;
  readonly newId: () => string;
  readonly funnelFreshness: (
    companyId: string,
    experimentId: string,
  ) => Promise<FunnelFreshness>;
};

const unsafeContactPattern =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|01[016789][-\s]?\d{3,4}[-\s]?\d{4})/iu;

export function requireCompanyAccess(
  runCtx: ToolRunContext,
  companyId: string,
): void {
  if (runCtx.companyId !== companyId) throw new Error("Company mismatch");
}

export async function requireDetail(
  deps: ExperimentToolDeps,
  companyId: string,
  experimentId: string,
) {
  const detail = await deps.repository.getExperiment(companyId, experimentId);
  if (detail === null) throw new Error("Experiment not found");
  return detail;
}

export function observationEvidence(
  runCtx: ToolRunContext,
  evidenceMarkdown: string | undefined,
): Record<string, unknown> {
  return {
    source: "agent_tool",
    runId: runCtx.runId,
    ...(evidenceMarkdown === undefined ? {} : { evidenceMarkdown }),
  };
}

export function sanitizeObservation(observation: Observation | null) {
  if (observation === null) return null;
  return {
    id: observation.id,
    kind: observation.kind,
    summary: observation.summary,
    funnelGeneratedAt: observation.funnelGeneratedAt,
    funnelReportHash: observation.funnelReportHash,
    issueCommentId: observation.issueCommentId,
    workProductId: observation.workProductId,
    createdAt: observation.createdAt,
  };
}

export function rejectUnsafeContent(value: string): void {
  if (unsafeContactPattern.test(value)) {
    throw new Error("Experiment tools cannot store contact identifiers");
  }
}

export function findExistingObservation(
  observations: readonly Observation[],
  idempotencyKey: string,
): Observation | null {
  return observations.find((observation) =>
    observation.idempotencyKey === idempotencyKey) ?? null;
}

export function idempotentResultKey(
  action: string,
  companyId: string,
  experimentId: string,
  idempotencyKey: string,
): string {
  return [action, companyId, experimentId, idempotencyKey].join(":");
}

export function observationResult(
  experimentId: string,
  observation: Observation,
): ToolResult {
  return {
    content: "관찰 기록을 추가했습니다. 실험 설계와 상태는 변경하지 않았습니다.",
    data: { experimentId, observationId: observation.id },
  };
}

export function strategyResult(
  experimentId: string,
  issueId: string,
  observation: Observation,
): ToolResult {
  const documentKey = typeof observation.evidence.documentKey === "string"
    ? observation.evidence.documentKey
    : null;
  return {
    content: "전략 제안을 Paperclip 이슈와 의사결정 검토에 제출했습니다.",
    data: {
      experimentId,
      observationId: observation.id,
      issueId,
      commentId: observation.issueCommentId,
      documentId: observation.workProductId,
      documentKey,
    },
  };
}

export async function appendObservation(
  deps: ExperimentToolDeps,
  input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly kind: Observation["kind"];
    readonly summary: string;
    readonly evidence: Record<string, unknown>;
    readonly idempotencyKey: string;
    readonly issueCommentId: string | null;
    readonly workProductId: string | null;
  },
): Promise<Observation> {
  const funnel = await deps.funnelFreshness(input.companyId, input.experimentId);
  const observation = observationSchema.parse({
    id: deps.newId(),
    ...input,
    funnelGeneratedAt: funnel.generatedAt,
    funnelReportHash: null,
    createdAt: deps.now(),
  });
  await deps.repository.appendObservation(observation);
  return observation;
}

export async function appendAgentSnapshot(
  deps: ExperimentToolDeps,
  detail: ExperimentDetail,
): Promise<void> {
  const funnel = await deps.funnelFreshness(
    detail.experiment.companyId,
    detail.experiment.id,
  );
  await deps.repository.appendSnapshot(snapshotSchema.parse({
    id: deps.newId(),
    companyId: detail.experiment.companyId,
    experimentId: detail.experiment.id,
    recordedAt: deps.now(),
    variantMetrics: aggregateVariantMetrics(detail.variants, detail.entries),
    funnelGeneratedAt: funnel.generatedAt,
    funnelDataThrough: funnel.dataThrough,
    funnelQuality: funnel.quality,
    source: "agent_observation",
  }));
}

export async function logAgentAction(
  deps: ExperimentToolDeps,
  runCtx: ToolRunContext,
  experimentId: string,
  action: string,
): Promise<void> {
  await deps.activity.log({
    companyId: runCtx.companyId,
    message: `Spacebogam experiment ${action}`,
    entityType: "spacebogam_experiment",
    entityId: experimentId,
    metadata: {
      action,
      experimentId,
      runId: runCtx.runId,
      agentId: runCtx.agentId,
    },
  });
}
