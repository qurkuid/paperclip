import {
  experimentSchema,
  variantSchema,
  type Experiment,
  type ExperimentStatus,
  type Variant,
} from "../contracts/index.js";
import { repositoryTable, type ExperimentDatabase } from "./database.js";
import {
  ExperimentRepositoryError,
  type ExperimentDetail,
  type ExperimentPatch,
  type RepositoryReader,
} from "./types.js";
import { createRepositoryWriter } from "./write.js";

type VersionedMutation = {
  readonly companyId: string;
  readonly experimentId: string;
  readonly expectedVersion: number;
  readonly updatedAt: string;
};

async function requiredDetail(
  reader: RepositoryReader,
  companyId: string,
  experimentId: string,
): Promise<ExperimentDetail> {
  const detail = await reader.getExperiment(companyId, experimentId);
  if (detail === null) {
    throw new ExperimentRepositoryError("experiment_not_found", "Experiment not found");
  }
  return detail;
}

function updatedExperiment(
  current: Experiment,
  patch: ExperimentPatch,
  updatedAt: string,
): Experiment {
  return experimentSchema.parse({
    ...current,
    title: patch.title ?? current.title,
    hypothesis: patch.hypothesis ?? current.hypothesis,
    primaryMetric: patch.primaryMetric ?? current.primaryMetric,
    guardrailMetric: patch.guardrailMetric === undefined
      ? current.guardrailMetric
      : patch.guardrailMetric,
    minimumSamplePerVariant: patch.minimumSamplePerVariant
      ?? current.minimumSamplePerVariant,
    targetLift: patch.targetLift === undefined ? current.targetLift : patch.targetLift,
    plannedStartAt: patch.plannedStartAt === undefined
      ? current.plannedStartAt
      : patch.plannedStartAt,
    linkedIssueId: patch.linkedIssueId === undefined
      ? current.linkedIssueId
      : patch.linkedIssueId,
    responsibleAgentId: patch.responsibleAgentId === undefined
      ? current.responsibleAgentId
      : patch.responsibleAgentId,
    archivedAt: patch.archivedAt === undefined ? current.archivedAt : patch.archivedAt,
    version: current.version + 1,
    updatedAt,
  });
}

export function createExperimentMutations(
  database: ExperimentDatabase,
  reader: RepositoryReader,
) {
  const experiments = repositoryTable(database, "experiments");
  const variantsTable = repositoryTable(database, "experiment_variants");
  const writer = createRepositoryWriter(database);

  async function createExperiment(input: Experiment): Promise<ExperimentDetail> {
    const value = experimentSchema.parse(input);
    if (value.status === "running") {
      const running = await database.query(
        `SELECT id FROM ${experiments}
          WHERE company_id = $1 AND status = 'running' AND archived_at IS NULL
          LIMIT 1`,
        [value.companyId],
      );
      if (running.length > 0) {
        throw new ExperimentRepositoryError(
          "running_experiment_exists",
          "Another running experiment already exists",
        );
      }
    }
    await writer.createExperiment(value);
    return requiredDetail(reader, value.companyId, value.id);
  }

  async function createVariant(input: Variant): Promise<void> {
    const value = variantSchema.parse(input);
    if (await reader.findExperiment(value.companyId, value.experimentId) === null) {
      throw new ExperimentRepositoryError("experiment_not_found", "Experiment not found");
    }
    await writer.createVariant(value);
  }

  async function updateExperiment(input: VersionedMutation & {
    readonly patch: ExperimentPatch;
  }): Promise<ExperimentDetail> {
    const current = await reader.findExperiment(input.companyId, input.experimentId);
    if (current === null) {
      throw new ExperimentRepositoryError("experiment_not_found", "Experiment not found");
    }
    if (current.version !== input.expectedVersion) {
      throw new ExperimentRepositoryError("invalid_version", "Experiment version changed");
    }
    const next = updatedExperiment(current, input.patch, input.updatedAt);
    const result = await database.execute(
      `UPDATE ${experiments}
          SET title = $4, hypothesis = $5, primary_metric = $6,
              guardrail_metric = $7, minimum_sample_per_variant = $8,
              target_lift = $9, planned_start_at = $10, linked_issue_id = $11,
              responsible_agent_id = $12, archived_at = $13,
              version = $14, updated_at = $15
        WHERE company_id = $1 AND id = $2 AND version = $3`,
      [
        input.companyId, input.experimentId, input.expectedVersion,
        next.title, next.hypothesis, next.primaryMetric, next.guardrailMetric,
        next.minimumSamplePerVariant, next.targetLift, next.plannedStartAt,
        next.linkedIssueId, next.responsibleAgentId, next.archivedAt,
        next.version, next.updatedAt,
      ],
    );
    if (result.rowCount === 0) {
      throw new ExperimentRepositoryError("invalid_version", "Experiment version changed");
    }
    return requiredDetail(reader, input.companyId, input.experimentId);
  }

  async function replaceDraftVariants(input: VersionedMutation & {
    readonly variants: readonly Variant[];
  }): Promise<ExperimentDetail> {
    const detail = await requiredDetail(reader, input.companyId, input.experimentId);
    if (detail.experiment.version !== input.expectedVersion) {
      throw new ExperimentRepositoryError("invalid_version", "Experiment version changed");
    }
    if (detail.experiment.status !== "draft") {
      throw new ExperimentRepositoryError("variant_conflict", "Draft variants are locked");
    }
    if (input.variants.length < 2 || input.variants.filter((item) => item.isControl).length !== 1) {
      throw new ExperimentRepositoryError("variant_conflict", "Exactly one control and two variants are required");
    }
    await updateExperiment({ ...input, patch: {} });
    await database.execute(
      `DELETE FROM ${variantsTable} WHERE company_id = $1 AND experiment_id = $2`,
      [input.companyId, input.experimentId],
    );
    for (const variant of input.variants) await writer.createVariant(variant);
    return requiredDetail(reader, input.companyId, input.experimentId);
  }

  async function transitionExperiment(input: Omit<VersionedMutation, "updatedAt"> & {
    readonly to: ExperimentStatus;
    readonly at: string;
    readonly reason?: string;
  }): Promise<ExperimentDetail> {
    const result = await database.execute(
      `UPDATE ${experiments}
          SET status = $4,
              started_at = CASE WHEN $4 = 'running' THEN COALESCE(started_at, $5::timestamptz) ELSE started_at END,
              ended_at = CASE WHEN $4 IN ('completed', 'cancelled') THEN $5::timestamptz ELSE NULL END,
              version = version + 1, updated_at = $5::timestamptz
        WHERE company_id = $1 AND id = $2 AND version = $3
          AND archived_at IS NULL`,
      [input.companyId, input.experimentId, input.expectedVersion, input.to, input.at],
    );
    if (result.rowCount === 0) {
      const current = await reader.findExperiment(input.companyId, input.experimentId);
      throw new ExperimentRepositoryError(
        current === null ? "experiment_not_found" : "invalid_version",
        current === null ? "Experiment not found" : "Experiment version changed",
      );
    }
    return requiredDetail(reader, input.companyId, input.experimentId);
  }

  function startExperiment(input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly expectedVersion: number;
    readonly startedAt: string;
  }): Promise<ExperimentDetail> {
    return transitionExperiment({ ...input, to: "running", at: input.startedAt });
  }

  return {
    createExperiment,
    createVariant,
    updateExperiment,
    replaceDraftVariants,
    transitionExperiment,
    startExperiment,
  };
}
