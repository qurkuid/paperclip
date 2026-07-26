import { z } from "zod";
import {
  ALLOWED_LIFECYCLE_TRANSITIONS,
  EXPERIMENT_OUTCOMES,
  EXPERIMENT_STATUSES,
  FUNNEL_QUALITIES,
  GUARDRAIL_METRICS,
  OBSERVATION_KINDS,
  READINESS_STATES,
  SNAPSHOT_SOURCES,
} from "./constants.js";

const allowedLifecycleTransitionSet = new Set<string>(ALLOWED_LIFECYCLE_TRANSITIONS);
const uuidSchema = z.string().uuid().brand("Uuid");
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const versionSchema = z.number().int().positive();

const outcomeAtInvariant = <Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) =>
  schema.superRefine((value, context) => {
    const outcome = value["outcome"];
    const outcomeAt = value["outcomeAt"];
    if (outcome === "pending" && outcomeAt !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["outcomeAt"], message: "pending outcomeAt must be null" });
    }
    if (outcome !== "pending" && outcomeAt === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["outcomeAt"], message: "resolved outcomeAt is required" });
    }
  });

export const experimentSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema,
  title: z.string().min(1).max(120),
  hypothesis: z.string().min(1).max(2000),
  status: z.enum(EXPERIMENT_STATUSES),
  primaryMetric: z.literal("won_rate").default("won_rate"),
  guardrailMetric: z.enum(GUARDRAIL_METRICS).nullable().optional(),
  minimumSamplePerVariant: z.number().int().min(1).max(100000).default(30),
  targetLift: z.number().nullable().optional(),
  plannedStartAt: nullableTimestampSchema.optional(),
  startedAt: nullableTimestampSchema.optional(),
  endedAt: nullableTimestampSchema.optional(),
  linkedIssueId: uuidSchema.nullable().optional(),
  responsibleAgentId: uuidSchema.nullable().optional(),
  version: versionSchema,
  archivedAt: nullableTimestampSchema.optional(),
  updatedAt: timestampSchema,
}).strict();

export const variantSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema,
  experimentId: uuidSchema,
  key: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/u),
  name: z.string().min(1).max(80),
  description: z.string().max(1000),
  isControl: z.boolean(),
  sortOrder: z.number().int(),
}).strict();

const entryBaseSchema = {
  companyId: uuidSchema,
  experimentId: uuidSchema,
  variantId: uuidSchema,
  outcome: z.enum(EXPERIMENT_OUTCOMES),
  enteredAt: timestampSchema,
  outcomeAt: nullableTimestampSchema,
} satisfies z.ZodRawShape;

export const entryInputSchema = outcomeAtInvariant(z.object({
  ...entryBaseSchema,
  leadKey: z.string().min(1).max(200),
  utmSource: z.string().min(1).max(120).nullable().optional(),
  utmMedium: z.string().min(1).max(120).nullable().optional(),
  utmCampaign: z.string().min(1).max(200).nullable().optional(),
}).strict());

export const persistedEntrySchema = outcomeAtInvariant(z.object({
  id: uuidSchema,
  ...entryBaseSchema,
  leadKeyHash: z.string().min(1).max(200),
  utmSource: z.string().min(1).max(120).nullable().optional(),
  utmMedium: z.string().min(1).max(120).nullable().optional(),
  utmCampaign: z.string().min(1).max(200).nullable().optional(),
  version: versionSchema,
}).strict());

export const variantMetricSchema = z.object({
  variantId: uuidSchema,
  key: z.string().min(1).max(80),
  isControl: z.boolean(),
  sample: z.number().int().min(0),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  pending: z.number().int().min(0),
  disqualified: z.number().int().min(0),
  resolved: z.number().int().min(0),
  wonRate: z.number().min(0).max(1).nullable(),
  absoluteDeltaFromControl: z.number().nullable(),
  relativeLiftFromControl: z.number().nullable(),
}).strict();

export const snapshotSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema,
  experimentId: uuidSchema,
  recordedAt: timestampSchema,
  variantMetrics: z.array(variantMetricSchema),
  funnelGeneratedAt: nullableTimestampSchema,
  funnelDataThrough: nullableTimestampSchema,
  funnelQuality: z.enum(FUNNEL_QUALITIES).nullable(),
  source: z.enum(SNAPSHOT_SOURCES),
}).strict();

export const observationSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema,
  experimentId: uuidSchema,
  kind: z.enum(OBSERVATION_KINDS),
  summary: z.string().min(1).max(4000),
  evidence: z.record(z.unknown()).default({}),
  funnelGeneratedAt: nullableTimestampSchema,
  funnelReportHash: z.string().min(1).max(200).nullable(),
  issueCommentId: uuidSchema.nullable(),
  workProductId: uuidSchema.nullable(),
  idempotencyKey: z.string().min(1).max(200).nullable(),
  createdAt: timestampSchema,
}).strict();

export const lifecycleTransitionSchema = z.object({
  from: z.enum(EXPERIMENT_STATUSES),
  to: z.enum(EXPERIMENT_STATUSES),
}).strict().superRefine((transition, context) => {
  if (!allowedLifecycleTransitionSet.has(`${transition.from}:${transition.to}`)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "invalid lifecycle transition" });
  }
});

export const experimentProjectionSchema = z.object({
  experiment: experimentSchema,
  variants: z.array(variantSchema),
  variantMetrics: z.array(variantMetricSchema),
  readiness: z.enum(READINESS_STATES),
  freshness: z.object({
    experimentUpdatedAt: timestampSchema,
    funnelDataThrough: nullableTimestampSchema,
    funnelGeneratedAt: nullableTimestampSchema,
    funnelQuality: z.enum(FUNNEL_QUALITIES).nullable(),
  }).strict(),
  recentObservations: z.array(observationSchema),
}).strict().superRefine((projection, context) => {
  if (projection.variants.filter((variant) => variant.isControl).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "exactly one control variant is required" });
  }
  for (const variant of projection.variants) {
    if (variant.companyId !== projection.experiment.companyId || variant.experimentId !== projection.experiment.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "variant ownership mismatch" });
    }
  }
});

export type Experiment = Readonly<z.infer<typeof experimentSchema>>;
export type Variant = Readonly<z.infer<typeof variantSchema>>;
export type EntryInput = Readonly<z.infer<typeof entryInputSchema>>;
export type PersistedEntry = Readonly<z.infer<typeof persistedEntrySchema>>;
export type VariantMetric = Readonly<z.infer<typeof variantMetricSchema>>;
export type Snapshot = Readonly<z.infer<typeof snapshotSchema>>;
export type Observation = Readonly<z.infer<typeof observationSchema>>;
export type LifecycleTransition = Readonly<z.infer<typeof lifecycleTransitionSchema>>;
export type ExperimentProjection = Readonly<z.infer<typeof experimentProjectionSchema>>;
