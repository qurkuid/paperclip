import type {
  Experiment,
  Observation,
  PersistedEntry,
  Snapshot,
  Variant,
} from "../contracts/index.js";

export type ExperimentRepositoryErrorCode =
  | "experiment_not_found"
  | "idempotency_conflict"
  | "immutable_snapshot"
  | "running_experiment_exists"
  | "invalid_version"
  | "variant_conflict";

export class ExperimentRepositoryError extends Error {
  constructor(
    readonly code: ExperimentRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExperimentRepositoryError";
  }
}

export type ExperimentDetail = {
  readonly experiment: Experiment;
  readonly variants: readonly Variant[];
  readonly entries: readonly PersistedEntry[];
  readonly snapshots: readonly Snapshot[];
  readonly observations: readonly Observation[];
};

export type ExperimentPatch = Readonly<Partial<Pick<
  Experiment,
  | "title"
  | "hypothesis"
  | "primaryMetric"
  | "guardrailMetric"
  | "minimumSamplePerVariant"
  | "targetLift"
  | "plannedStartAt"
  | "linkedIssueId"
  | "responsibleAgentId"
  | "archivedAt"
>>>;

export type EntryWrite = PersistedEntry & {
  readonly idempotencyKey?: string | null;
};

export type RepositoryReader = {
  readonly findExperiment: (
    companyId: string,
    experimentId: string,
  ) => Promise<Experiment | null>;
  readonly listExperiments: (companyId: string) => Promise<Experiment[]>;
  readonly getExperiment: (
    companyId: string,
    experimentId: string,
  ) => Promise<ExperimentDetail | null>;
};
