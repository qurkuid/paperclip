import {
  lifecycleTransitionSchema,
  variantSchema,
  type ExperimentStatus,
} from "../contracts/index.js";
import type { ExperimentDetail } from "../repository.js";
import { ServiceError } from "./errors.js";
import type {
  LifecycleAction,
  LifecyclePayload,
  SpacebogamExperimentServiceDeps,
  VariantPatchPayload,
} from "./types.js";

export function createExperimentActionHandlers(
  deps: SpacebogamExperimentServiceDeps,
  withLifecycleSnapshot: (
    detail: ExperimentDetail,
  ) => Promise<ExperimentDetail>,
) {
  async function replaceDraftVariants(
    companyId: string,
    payload: VariantPatchPayload,
  ): Promise<ExperimentDetail> {
    const detail = await requireExperiment(
      deps,
      companyId,
      payload.experimentId,
    );
    if (detail.experiment.status !== "draft") {
      throw new ServiceError(
        "variant_conflict",
        "Running experiment variant design is immutable",
      );
    }
    const variants = payload.variants.map((variant) => variantSchema.parse({
      id: variant.variantId ?? deps.newId(),
      companyId,
      experimentId: payload.experimentId,
      key: variant.key,
      name: variant.name,
      description: variant.description,
      isControl: variant.isControl,
      sortOrder: variant.sortOrder,
    }));
    return deps.repository.replaceDraftVariants({
      companyId,
      experimentId: payload.experimentId,
      expectedVersion: payload.version,
      variants,
      updatedAt: deps.now(),
    });
  }

  async function transition(
    companyId: string,
    action: LifecycleAction,
    payload: LifecyclePayload,
  ): Promise<ExperimentDetail> {
    const detail = await requireExperiment(
      deps,
      companyId,
      payload.experimentId,
    );
    const to = statusForAction(action);
    if (!lifecycleTransitionSchema.safeParse({
      from: detail.experiment.status,
      to,
    }).success) {
      throw new ServiceError(
        "invalid_status_transition",
        "Invalid experiment lifecycle transition",
      );
    }
    return withLifecycleSnapshot(
      await deps.repository.transitionExperiment({
        companyId,
        experimentId: payload.experimentId,
        expectedVersion: payload.version,
        to,
        at: deps.now(),
        ...(payload.reason === undefined ? {} : { reason: payload.reason }),
      }),
    );
  }

  async function archiveExperiment(
    companyId: string,
    payload: LifecyclePayload,
  ): Promise<ExperimentDetail> {
    const detail = await requireExperiment(
      deps,
      companyId,
      payload.experimentId,
    );
    if (
      detail.experiment.status !== "completed"
      && detail.experiment.status !== "cancelled"
    ) {
      throw new ServiceError(
        "invalid_status_transition",
        "Only terminal experiments can be archived",
      );
    }
    return deps.repository.updateExperiment({
      companyId,
      experimentId: payload.experimentId,
      expectedVersion: payload.version,
      patch: { archivedAt: deps.now() },
      updatedAt: deps.now(),
    });
  }

  return { replaceDraftVariants, transition, archiveExperiment };
}

async function requireExperiment(
  deps: SpacebogamExperimentServiceDeps,
  companyId: string,
  experimentId: string,
): Promise<ExperimentDetail> {
  const detail = await deps.repository.getExperiment(companyId, experimentId);
  if (detail === null) {
    throw new ServiceError("experiment_not_found", "Experiment not found");
  }
  return detail;
}

function statusForAction(action: LifecycleAction): ExperimentStatus {
  switch (action) {
    case "start-experiment":
      return "running";
    case "pause-experiment":
      return "paused";
    case "complete-experiment":
      return "completed";
    case "cancel-experiment":
      return "cancelled";
  }
}
