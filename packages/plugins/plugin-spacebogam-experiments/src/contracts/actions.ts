import { z } from "zod";
import {
  API_ERROR_CODES,
  BOARD_ACTIONS,
  EXPERIMENT_OUTCOMES,
  EXPERIMENT_STATUSES,
  GUARDRAIL_METRICS,
  TOOL_ACTIONS,
} from "./constants.js";

const uuidSchema = z.string().uuid().brand("Uuid");
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const versionSchema = z.number().int().positive();
const safeString = z.string().trim().min(1);
const actionCodeSchema = z.enum(BOARD_ACTIONS);
const toolCodeSchema = z.enum(TOOL_ACTIONS);
const errorCodeSchema = z.enum(API_ERROR_CODES);

export const actionPayloadCreateExperimentSchema = z.object({
  title: z.string().min(1).max(120),
  hypothesis: z.string().min(1).max(2000),
  linkedIssueId: uuidSchema.nullable().optional(),
  primaryMetric: z.literal("won_rate").default("won_rate"),
  guardrailMetric: z.enum(GUARDRAIL_METRICS).nullable().optional(),
  minimumSamplePerVariant: z.number().int().min(1).max(100000).default(30),
  targetLift: z.number().nullable().optional(),
}).strict();

export const actionPayloadUpdateExperimentSchema = actionPayloadCreateExperimentSchema.partial().extend({
  experimentId: uuidSchema,
  version: versionSchema,
  status: z.enum(EXPERIMENT_STATUSES).optional(),
}).strict();

export const actionPayloadLifecycleSchema = z.object({
  experimentId: uuidSchema,
  version: versionSchema,
  reason: z.string().max(400).optional(),
}).strict();

export const actionPayloadEntrySchema = z.object({
  experimentId: uuidSchema,
  variantId: uuidSchema,
  leadKey: safeString.max(200),
  outcome: z.enum(EXPERIMENT_OUTCOMES),
  outcomeAt: nullableTimestampSchema.optional(),
  utmSource: z.string().max(120).nullable().optional(),
  utmMedium: z.string().max(120).nullable().optional(),
  utmCampaign: z.string().max(200).nullable().optional(),
  enteredAt: timestampSchema,
  version: versionSchema,
}).strict();

export const actionPayloadUpdateEntrySchema = actionPayloadEntrySchema.extend({
  entryId: uuidSchema,
}).strict();

export const actionPayloadVariantPatchSchema = z.object({
  experimentId: uuidSchema,
  version: versionSchema,
  variants: z.array(z.object({
    key: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/u),
    name: z.string().min(1).max(80),
    description: z.string().max(1000),
    isControl: z.boolean(),
    sortOrder: z.number().int(),
    variantId: uuidSchema.optional(),
  }).strict()).min(2),
}).strict();

export const boardActionInputSchema = z.discriminatedUnion("action", [
  z.object({ action: actionCodeSchema.extract(["create-experiment"] as const), payload: actionPayloadCreateExperimentSchema }).strict(),
  z.object({ action: actionCodeSchema.extract(["update-experiment"] as const), payload: actionPayloadUpdateExperimentSchema }).strict(),
  z.object({ action: actionCodeSchema.extract(["replace-draft-variants"] as const), payload: actionPayloadVariantPatchSchema }).strict(),
  z.object({ action: actionCodeSchema.extract(["start-experiment", "pause-experiment", "complete-experiment", "cancel-experiment", "archive-experiment"] as const), payload: actionPayloadLifecycleSchema }).strict(),
  z.object({ action: actionCodeSchema.extract(["create-entry"] as const), payload: actionPayloadEntrySchema }).strict(),
  z.object({ action: actionCodeSchema.extract(["update-entry"] as const), payload: actionPayloadUpdateEntrySchema }).strict(),
  z.object({ action: actionCodeSchema.extract(["delete-entry"] as const), payload: z.object({
    experimentId: uuidSchema,
    entryId: uuidSchema,
    variantId: uuidSchema,
    version: versionSchema,
  }).strict() }).strict(),
  z.object({ action: actionCodeSchema.extract(["link-issue"] as const), payload: z.object({
    experimentId: uuidSchema,
    issueId: uuidSchema,
    version: versionSchema,
  }).strict() }).strict(),
  z.object({ action: actionCodeSchema.extract(["select-responsible-agent"] as const), payload: z.object({
    experimentId: uuidSchema,
    responsibleAgentId: uuidSchema,
    version: versionSchema,
  }).strict() }).strict(),
  z.object({ action: actionCodeSchema.extract(["request-strategy"] as const), payload: z.object({
    experimentId: uuidSchema,
    request: safeString.max(4000),
    version: versionSchema,
  }).strict() }).strict(),
  z.object({ action: actionCodeSchema.extract(["reconcile-managed-routine"] as const), payload: z.object({
    experimentId: uuidSchema,
    enabled: z.boolean(),
    version: versionSchema,
  }).strict() }).strict(),
]);

export const boardActionSchema = boardActionInputSchema;

const toolIdempotencyKeySchema =
  z.string().regex(/^[A-Za-z0-9._:-]+$/u).min(1).max(120);
const toolCompanyIdSchema = uuidSchema;

export const toolOverviewPayloadSchema = z.object({
  companyId: toolCompanyIdSchema,
  includeArchived: z.boolean().optional(),
  status: z.array(z.enum(EXPERIMENT_STATUSES)).optional(),
}).strict();

export const toolExperimentPayloadSchema = z.object({
  companyId: toolCompanyIdSchema,
  experimentId: uuidSchema,
}).strict();

export const toolObservationPayloadSchema = z.object({
  companyId: toolCompanyIdSchema,
  experimentId: uuidSchema,
  kind: z.enum(["note", "measurement"]),
  summary: z.string().min(1).max(4000),
  evidenceMarkdown: z.string().min(1).max(8000).optional(),
  idempotencyKey: toolIdempotencyKeySchema,
}).strict();

export const toolStrategyPayloadSchema = z.object({
  companyId: toolCompanyIdSchema,
  experimentId: uuidSchema,
  proposal: safeString.max(4000),
  evidenceMarkdown: safeString.max(8000),
  idempotencyKey: toolIdempotencyKeySchema,
}).strict();

export const toolInputSchema = z.discriminatedUnion("tool", [
  z.object({ tool: toolCodeSchema.extract(["spacebogam_experiments_overview"] as const), payload: toolOverviewPayloadSchema }).strict(),
  z.object({ tool: toolCodeSchema.extract(["spacebogam_experiment_get"] as const), payload: toolExperimentPayloadSchema }).strict(),
  z.object({ tool: toolCodeSchema.extract(["spacebogam_experiment_record_observation"] as const), payload: toolObservationPayloadSchema }).strict(),
  z.object({ tool: toolCodeSchema.extract(["spacebogam_experiment_propose_strategy"] as const), payload: toolStrategyPayloadSchema }).strict(),
]);

export const toolOutputSchema = z.object({
  ok: z.boolean(),
  requestId: uuidSchema,
  payload: z.unknown(),
}).strict();

export const errorResponseSchema = z.object({
  ok: z.literal(false),
  code: errorCodeSchema,
  message: z.string().min(1).max(400),
  requestId: uuidSchema,
  details: z.record(z.unknown()).optional(),
}).strict();

export const boardActionResponseSchema = z.object({
  ok: z.boolean(),
  requestId: uuidSchema,
  experimentId: uuidSchema,
  version: versionSchema,
}).strict();

export type BoardActionInput = Readonly<z.infer<typeof boardActionInputSchema>>;
export type ToolInput = Readonly<z.infer<typeof toolInputSchema>>;
export type ErrorResponse = Readonly<z.infer<typeof errorResponseSchema>>;
