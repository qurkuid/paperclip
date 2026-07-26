import type { PluginPerformActionContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";

import {
  actionPayloadEntrySchema,
  actionPayloadUpdateEntrySchema,
  boardActionInputSchema,
  boardActionResponseSchema,
  type ErrorResponse,
} from "./contracts/index.js";
import type { ExperimentDetail } from "./repository.js";
import { requireBoardActor } from "./service/actor.js";
import { createEntryActionHandlers } from "./service/entry-actions.js";
import { normalizeError } from "./service/errors.js";
import { createExperimentActionHandlers } from "./service/experiment-actions.js";
import { createIssueActionHandlers } from "./service/issue-actions.js";
import type {
  BoardActionResponse,
  ExperimentServiceRepository,
  ServiceBoardActionInput,
  SpacebogamExperimentServiceDeps,
} from "./service/types.js";

export type {
  ExperimentServiceRepository,
  SpacebogamExperimentServiceDeps,
} from "./service/types.js";
export { requireBoardActor } from "./service/actor.js";

const idempotencyKeySchema =
  z.string().trim().min(1).max(200).nullable().optional();
const entryActionWithIdempotencySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create-entry"),
    payload: actionPayloadEntrySchema.extend({
      idempotencyKey: idempotencyKeySchema,
    }).strict(),
  }).strict(),
  z.object({
    action: z.literal("update-entry"),
    payload: actionPayloadUpdateEntrySchema.extend({
      idempotencyKey: idempotencyKeySchema,
    }).strict(),
  }).strict(),
]);

export function createSpacebogamExperimentService(
  deps: SpacebogamExperimentServiceDeps,
) {
  const entryActions = createEntryActionHandlers(deps);
  const experimentActions = createExperimentActionHandlers(
    deps,
    (detail) => entryActions.appendSnapshot(detail, "lifecycle"),
  );
  const issueActions = createIssueActionHandlers(deps);

  async function performBoardAction(
    input: unknown,
    context: PluginPerformActionContext,
  ): Promise<BoardActionResponse | ErrorResponse> {
    const requestId = deps.newId();
    try {
      const actor = requireBoardActor(context);
      const action = parseBoardActionInput(input);
      const detail = await mutate(action, actor.companyId);
      await deps.activity.log({
        companyId: actor.companyId,
        message: `Spacebogam experiment ${action.action}`,
        entityType: "spacebogam_experiment",
        entityId: detail.experiment.id,
        metadata: {
          action: action.action,
          experimentId: detail.experiment.id,
          requestId,
        },
      });
      return boardActionResponseSchema.parse({
        ok: true,
        requestId,
        experimentId: detail.experiment.id,
        version: detail.experiment.version,
      });
    } catch (error) {
      return normalizeError(error, requestId);
    }
  }

  async function mutate(
    action: ServiceBoardActionInput,
    companyId: string,
  ): Promise<ExperimentDetail> {
    switch (action.action) {
      case "create-experiment":
        return issueActions.createExperiment(companyId, action.payload);
      case "update-experiment":
        return deps.repository.updateExperiment({
          companyId,
          experimentId: action.payload.experimentId,
          expectedVersion: action.payload.version,
          patch: action.payload,
          updatedAt: deps.now(),
        });
      case "replace-draft-variants":
        return experimentActions.replaceDraftVariants(companyId, action.payload);
      case "start-experiment":
      case "pause-experiment":
      case "complete-experiment":
      case "cancel-experiment":
        return experimentActions.transition(
          companyId,
          action.action,
          action.payload,
        );
      case "archive-experiment":
        return experimentActions.archiveExperiment(companyId, action.payload);
      case "create-entry":
        return entryActions.createEntry(companyId, action.payload);
      case "update-entry":
        return entryActions.updateEntry(companyId, action.payload);
      case "delete-entry":
        return entryActions.appendSnapshot(
          await deps.repository.deleteEntry({
            companyId,
            experimentId: action.payload.experimentId,
            entryId: action.payload.entryId,
            variantId: action.payload.variantId,
            expectedVersion: action.payload.version,
          }),
          "manual",
        );
      case "link-issue":
        return issueActions.linkIssue(companyId, action.payload);
      case "select-responsible-agent":
        return issueActions.selectResponsibleAgent(companyId, action.payload);
      case "request-strategy":
        return issueActions.requestStrategy(companyId, action.payload);
      case "reconcile-managed-routine":
        return issueActions.reconcileManagedRoutine(companyId, action.payload);
    }
  }

  return { performBoardAction };
}

function parseBoardActionInput(input: unknown): ServiceBoardActionInput {
  const standard = boardActionInputSchema.safeParse(input);
  if (standard.success) return standard.data;
  return entryActionWithIdempotencySchema.parse(input);
}
