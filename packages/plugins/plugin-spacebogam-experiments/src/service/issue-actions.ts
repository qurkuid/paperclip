import {
  experimentSchema,
  observationSchema,
  type BoardActionInput,
  type Observation,
} from "../contracts/index.js";
import type { ExperimentDetail } from "../repository.js";
import { ServiceError } from "./errors.js";
import type {
  CreateExperimentPayload,
  LinkIssuePayload,
  SpacebogamExperimentServiceDeps,
} from "./types.js";

type SelectResponsiblePayload = Extract<
  BoardActionInput,
  { readonly action: "select-responsible-agent" }
>["payload"];
type RequestStrategyPayload = Extract<
  BoardActionInput,
  { readonly action: "request-strategy" }
>["payload"];
type ReconcileRoutinePayload = Extract<
  BoardActionInput,
  { readonly action: "reconcile-managed-routine" }
>["payload"];

export function createIssueActionHandlers(
  deps: SpacebogamExperimentServiceDeps,
) {
  async function createExperiment(
    companyId: string,
    payload: CreateExperimentPayload,
  ): Promise<ExperimentDetail> {
    const experimentId = deps.newId();
    const projectId = deps.resolveLinkedProjectId === undefined
      ? null
      : await deps.resolveLinkedProjectId(companyId);
    const issue = deps.issueIntegration === undefined
      ? null
      : await deps.issueIntegration.resolveIssue({
          companyId,
          experimentId,
          experimentTitle: payload.title,
          existingIssueId: payload.linkedIssueId ?? null,
          projectId,
        });
    return deps.repository.createExperiment(experimentSchema.parse({
      id: experimentId,
      companyId,
      title: payload.title,
      hypothesis: payload.hypothesis,
      status: "draft",
      primaryMetric: payload.primaryMetric,
      guardrailMetric: payload.guardrailMetric ?? null,
      minimumSamplePerVariant: payload.minimumSamplePerVariant,
      targetLift: payload.targetLift ?? null,
      plannedStartAt: null,
      startedAt: null,
      endedAt: null,
      linkedIssueId: issue?.id ?? null,
      responsibleAgentId: null,
      version: 1,
      archivedAt: null,
      updatedAt: deps.now(),
    }));
  }

  async function linkIssue(
    companyId: string,
    payload: LinkIssuePayload,
  ): Promise<ExperimentDetail> {
    const integration = requireIssueIntegration();
    const detail = await requireExperiment(companyId, payload.experimentId);
    const issue = await integration.resolveIssue({
      companyId,
      experimentId: payload.experimentId,
      experimentTitle: detail.experiment.title,
      existingIssueId: payload.issueId,
      projectId: null,
    });
    const next = await deps.repository.updateExperiment({
      companyId,
      experimentId: payload.experimentId,
      expectedVersion: payload.version,
      patch: {
        linkedIssueId: experimentSchema.shape.linkedIssueId.parse(issue.id),
      },
      updatedAt: deps.now(),
    });
    await appendObservation({
      companyId,
      experimentId: payload.experimentId,
      kind: "note",
      summary: "실험이 Paperclip 이슈에 연결되었습니다.",
      evidence: { linkedIssueId: issue.id },
      idempotencyKey: `link-issue:${payload.experimentId}:${payload.version}`,
    });
    return next;
  }

  async function selectResponsibleAgent(
    companyId: string,
    payload: SelectResponsiblePayload,
  ): Promise<ExperimentDetail> {
    if (deps.validateAgent === undefined) {
      throw new ServiceError("unknown_action", "Agent validation is unavailable");
    }
    if (!await deps.validateAgent(companyId, payload.responsibleAgentId)) {
      throw new ServiceError(
        "company_isolation_violation",
        "Responsible agent is not available in this company",
      );
    }
    const next = await deps.repository.updateExperiment({
      companyId,
      experimentId: payload.experimentId,
      expectedVersion: payload.version,
      patch: { responsibleAgentId: payload.responsibleAgentId },
      updatedAt: deps.now(),
    });
    await appendObservation({
      companyId,
      experimentId: payload.experimentId,
      kind: "decision_result",
      summary: "책임 에이전트가 설정되었습니다.",
      evidence: { responsibleAgentId: payload.responsibleAgentId },
      idempotencyKey: `select-agent:${payload.experimentId}:${payload.version}`,
    });
    return next;
  }

  async function requestStrategy(
    companyId: string,
    payload: RequestStrategyPayload,
  ): Promise<ExperimentDetail> {
    const detail = await requireExperiment(companyId, payload.experimentId);
    const integration = requireIssueIntegration();
    if (detail.experiment.version !== payload.version) {
      throw new ServiceError("invalid_version", "Experiment version is stale");
    }
    const agentId = detail.experiment.responsibleAgentId;
    if (agentId === null || agentId === undefined) {
      throw new ServiceError("unknown_action", "Select a responsible agent first");
    }
    const issueId = detail.experiment.linkedIssueId;
    if (issueId === null || issueId === undefined) {
      throw new ServiceError("unknown_action", "Link a Paperclip issue first");
    }
    const request = await integration.requestStrategyReview({
      companyId,
      experimentId: payload.experimentId,
      experimentTitle: detail.experiment.title,
      issueId,
      responsibleAgentId: agentId,
      request: payload.request,
      idempotencyKey: `${payload.experimentId}:${payload.version}`,
    });
    await appendObservation({
      companyId,
      experimentId: payload.experimentId,
      kind: "note",
      summary: "책임 에이전트에게 전략 검토를 요청했습니다.",
      evidence: {
        agentId,
        issueId: request.issueId,
        requestCommentId: request.commentId,
        queued: request.queued,
        runId: request.runId,
      },
      idempotencyKey: `strategy-request:${payload.experimentId}:${payload.version}`,
    });
    return detail;
  }

  async function reconcileManagedRoutine(
    companyId: string,
    payload: ReconcileRoutinePayload,
  ): Promise<ExperimentDetail> {
    if (deps.reconcileRoutine === undefined) {
      throw new ServiceError("unknown_action", "Routine management is unavailable");
    }
    const detail = await requireExperiment(companyId, payload.experimentId);
    if (detail.experiment.version !== payload.version) {
      throw new ServiceError("invalid_version", "Experiment version is stale");
    }
    if (
      payload.enabled
      && (
        detail.experiment.responsibleAgentId === null
        || detail.experiment.responsibleAgentId === undefined
      )
    ) {
      throw new ServiceError(
        "unknown_action",
        "Select a responsible agent before enabling the routine",
      );
    }
    await deps.reconcileRoutine(
      companyId,
      payload.enabled,
      detail.experiment.responsibleAgentId,
    );
    await appendObservation({
      companyId,
      experimentId: payload.experimentId,
      kind: "decision_result",
      summary: payload.enabled
        ? "정기 검토 루틴을 활성화했습니다."
        : "정기 검토 루틴을 비활성화했습니다.",
      evidence: { enabled: payload.enabled },
      idempotencyKey:
        `routine:${payload.experimentId}:${payload.version}:${payload.enabled}`,
    });
    return detail;
  }

  async function appendObservation(input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly kind: Observation["kind"];
    readonly summary: string;
    readonly evidence: Record<string, unknown>;
    readonly idempotencyKey: string;
  }): Promise<void> {
    const funnel = await deps.funnelFreshness(
      input.companyId,
      input.experimentId,
    );
    await deps.repository.appendObservation(observationSchema.parse({
      id: deps.newId(),
      companyId: input.companyId,
      experimentId: input.experimentId,
      kind: input.kind,
      summary: input.summary,
      evidence: input.evidence,
      funnelGeneratedAt: funnel.generatedAt,
      funnelReportHash: null,
      issueCommentId: null,
      workProductId: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: deps.now(),
    }));
  }

  async function requireExperiment(
    companyId: string,
    experimentId: string,
  ): Promise<ExperimentDetail> {
    const detail = await deps.repository.getExperiment(companyId, experimentId);
    if (detail === null) {
      throw new ServiceError("experiment_not_found", "Experiment not found");
    }
    return detail;
  }

  function requireIssueIntegration() {
    if (deps.issueIntegration === undefined) {
      throw new ServiceError("unknown_action", "Issue integration is unavailable");
    }
    return deps.issueIntegration;
  }

  return {
    createExperiment,
    linkIssue,
    selectResponsibleAgent,
    requestStrategy,
    reconcileManagedRoutine,
  };
}
