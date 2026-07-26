import type { PluginActivityLogEntry } from "@paperclipai/plugin-sdk";
import { z } from "zod";

import {
  actionPayloadCreateExperimentSchema,
  actionPayloadEntrySchema,
  actionPayloadLifecycleSchema,
  actionPayloadUpdateEntrySchema,
  actionPayloadUpdateExperimentSchema,
  actionPayloadVariantPatchSchema,
  boardActionResponseSchema,
  type BoardActionInput,
  type Experiment,
  type ExperimentStatus,
  type FunnelQuality,
  type Observation,
  type PersistedEntry,
  type Snapshot,
  type Variant,
} from "../contracts/index.js";
import type { ExperimentIssueIntegration } from "../issue-integration.js";
import type { ExperimentDetail, ExperimentPatch } from "../repository.js";

export type BoardActionResponse = Readonly<z.infer<typeof boardActionResponseSchema>>;
export type CreateExperimentPayload = Readonly<z.infer<typeof actionPayloadCreateExperimentSchema>>;
export type UpdateExperimentPayload = Readonly<z.infer<typeof actionPayloadUpdateExperimentSchema>>;
export type VariantPatchPayload = Readonly<z.infer<typeof actionPayloadVariantPatchSchema>>;
export type LifecyclePayload = Readonly<z.infer<typeof actionPayloadLifecycleSchema>>;
export type IdempotencyPayload = { readonly idempotencyKey?: string | null };
export type EntryPayload = Readonly<z.infer<typeof actionPayloadEntrySchema>> & IdempotencyPayload;
export type UpdateEntryPayload = Readonly<z.infer<typeof actionPayloadUpdateEntrySchema>> & IdempotencyPayload;
export type ServiceBoardActionInput = BoardActionInput
  | Readonly<{ readonly action: "create-entry"; readonly payload: EntryPayload }>
  | Readonly<{ readonly action: "update-entry"; readonly payload: UpdateEntryPayload }>;
export type LifecycleAction = "start-experiment" | "pause-experiment" | "complete-experiment" | "cancel-experiment";
export type LinkIssuePayload = Extract<
  BoardActionInput,
  { readonly action: "link-issue" }
>["payload"];
export type RepositoryErrorCode =
  | "experiment_not_found"
  | "idempotency_conflict"
  | "immutable_snapshot"
  | "running_experiment_exists"
  | "invalid_version"
  | "variant_conflict";

export type FunnelFreshness = {
  readonly quality: FunnelQuality | null;
  readonly dataThrough: string | null;
  readonly generatedAt: string | null;
};

export type EntryWrite = PersistedEntry & {
  readonly idempotencyKey?: string | null;
};

export type ExperimentServiceRepository = {
  readonly getExperiment: (companyId: string, experimentId: string) => Promise<ExperimentDetail | null>;
  readonly createExperiment: (input: Experiment) => Promise<ExperimentDetail>;
  readonly updateExperiment: (input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly expectedVersion: number;
    readonly patch: ExperimentPatch;
    readonly updatedAt: string;
  }) => Promise<ExperimentDetail>;
  readonly replaceDraftVariants: (input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly expectedVersion: number;
    readonly variants: readonly Variant[];
    readonly updatedAt: string;
  }) => Promise<ExperimentDetail>;
  readonly transitionExperiment: (input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly expectedVersion: number;
    readonly to: ExperimentStatus;
    readonly at: string;
    readonly reason?: string;
  }) => Promise<ExperimentDetail>;
  readonly createEntry: (input: EntryWrite) => Promise<ExperimentDetail>;
  readonly updateEntry: (input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly entryId: string;
    readonly expectedVersion: number;
    readonly patch: EntryWrite;
  }) => Promise<ExperimentDetail>;
  readonly deleteEntry: (input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly entryId: string;
    readonly variantId: string;
    readonly expectedVersion: number;
  }) => Promise<ExperimentDetail>;
  readonly appendSnapshot: (input: Snapshot) => Promise<void>;
  readonly appendObservation: (input: Observation) => Promise<void>;
};

export type SpacebogamExperimentServiceDeps = {
  readonly repository: ExperimentServiceRepository;
  readonly activity: {
    readonly log: (entry: PluginActivityLogEntry) => Promise<void>;
  };
  readonly now: () => string;
  readonly newId: () => string;
  readonly hashLeadKey: (leadKey: string) => Promise<string>;
  readonly funnelFreshness: (
    companyId: string,
    experimentId: string,
  ) => Promise<FunnelFreshness>;
  readonly issueIntegration?: ExperimentIssueIntegration;
  readonly resolveLinkedProjectId?: (
    companyId: string,
  ) => Promise<string | null>;
  readonly validateAgent?: (
    companyId: string,
    agentId: string,
  ) => Promise<boolean>;
  readonly reconcileRoutine?: (
    companyId: string,
    enabled: boolean,
    responsibleAgentId: string | null | undefined,
  ) => Promise<void>;
};
