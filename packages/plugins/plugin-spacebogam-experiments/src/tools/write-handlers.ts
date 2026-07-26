import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";

import {
  toolObservationPayloadSchema,
  toolStrategyPayloadSchema,
} from "../contracts/index.js";
import {
  appendAgentSnapshot,
  appendObservation,
  findExistingObservation,
  idempotentResultKey,
  logAgentAction,
  observationEvidence,
  observationResult,
  rejectUnsafeContent,
  requireCompanyAccess,
  requireDetail,
  strategyResult,
  type ExperimentToolDeps,
} from "./support.js";

export function createWriteToolHandlers(
  deps: ExperimentToolDeps,
  idempotentResults: Map<string, ToolResult>,
) {
  async function recordObservation(
    params: unknown,
    runCtx: ToolRunContext,
  ): Promise<ToolResult> {
    const input = toolObservationPayloadSchema.parse(params);
    requireCompanyAccess(runCtx, input.companyId);
    rejectUnsafeContent([input.summary, input.evidenceMarkdown ?? ""].join("\n"));
    const cacheKey = idempotentResultKey(
      "record_observation",
      runCtx.companyId,
      input.experimentId,
      input.idempotencyKey,
    );
    const cached = idempotentResults.get(cacheKey);
    if (cached !== undefined) return cached;
    const detail = await requireDetail(deps, runCtx.companyId, input.experimentId);
    const existing = findExistingObservation(
      detail.observations,
      input.idempotencyKey,
    );
    if (existing !== null) {
      const result = observationResult(input.experimentId, existing);
      idempotentResults.set(cacheKey, result);
      return result;
    }
    const observation = await appendObservation(deps, {
      companyId: runCtx.companyId,
      experimentId: input.experimentId,
      kind: input.kind,
      summary: input.summary,
      evidence: observationEvidence(runCtx, input.evidenceMarkdown),
      idempotencyKey: input.idempotencyKey,
      issueCommentId: null,
      workProductId: null,
    });
    await appendAgentSnapshot(deps, detail);
    await logAgentAction(
      deps,
      runCtx,
      input.experimentId,
      "record_observation",
    );
    const result = observationResult(input.experimentId, observation);
    idempotentResults.set(cacheKey, result);
    return result;
  }

  async function proposeStrategy(
    params: unknown,
    runCtx: ToolRunContext,
  ): Promise<ToolResult> {
    const input = toolStrategyPayloadSchema.parse(params);
    requireCompanyAccess(runCtx, input.companyId);
    rejectUnsafeContent(`${input.proposal}\n${input.evidenceMarkdown}`);
    const cacheKey = idempotentResultKey(
      "propose_strategy",
      runCtx.companyId,
      input.experimentId,
      input.idempotencyKey,
    );
    const cached = idempotentResults.get(cacheKey);
    if (cached !== undefined) return cached;
    const detail = await requireDetail(deps, runCtx.companyId, input.experimentId);
    const responsibleAgentId = detail.experiment.responsibleAgentId;
    if (responsibleAgentId !== null && responsibleAgentId !== runCtx.agentId) {
      throw new Error("Only the responsible agent can propose a strategy");
    }
    const issueId = detail.experiment.linkedIssueId;
    if (issueId === null || issueId === undefined) {
      throw new Error("Link a Paperclip issue before proposing a strategy");
    }
    const existing = findExistingObservation(
      detail.observations,
      input.idempotencyKey,
    );
    if (existing !== null) {
      const result = strategyResult(input.experimentId, issueId, existing);
      idempotentResults.set(cacheKey, result);
      return result;
    }
    const artifact = await deps.issueIntegration.publishStrategy({
      companyId: runCtx.companyId,
      experimentId: input.experimentId,
      experimentTitle: detail.experiment.title,
      issueId,
      proposal: input.proposal,
      evidenceMarkdown: input.evidenceMarkdown,
      idempotencyKey: input.idempotencyKey,
      authorAgentId: runCtx.agentId,
    });
    const observation = await appendObservation(deps, {
      companyId: runCtx.companyId,
      experimentId: input.experimentId,
      kind: "strategy_proposal",
      summary: input.proposal,
      evidence: {
        source: "agent_tool",
        runId: runCtx.runId,
        issueId: artifact.issueId,
        documentKey: artifact.documentKey,
      },
      idempotencyKey: input.idempotencyKey,
      issueCommentId: artifact.commentId,
      workProductId: artifact.documentId,
    });
    await logAgentAction(deps, runCtx, input.experimentId, "propose_strategy");
    const result = strategyResult(
      input.experimentId,
      artifact.issueId,
      observation,
    );
    idempotentResults.set(cacheKey, result);
    return result;
  }

  return { recordObservation, proposeStrategy };
}
