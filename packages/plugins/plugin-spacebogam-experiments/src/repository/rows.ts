import { z } from "zod";
import {
  EXPERIMENT_OUTCOMES,
  EXPERIMENT_STATUSES,
  FUNNEL_QUALITIES,
  GUARDRAIL_METRICS,
  OBSERVATION_KINDS,
  SNAPSHOT_SOURCES,
  experimentSchema,
  observationSchema,
  persistedEntrySchema,
  snapshotSchema,
  variantMetricSchema,
  variantSchema,
  type Experiment,
  type Observation,
  type PersistedEntry,
  type Snapshot,
  type Variant,
} from "../contracts/index.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();

const experimentRowSchema = z.object({
  id: uuid,
  company_id: uuid,
  title: z.string(),
  hypothesis: z.string(),
  status: z.enum(EXPERIMENT_STATUSES),
  primary_metric: z.literal("won_rate"),
  guardrail_metric: z.enum(GUARDRAIL_METRICS).nullable(),
  minimum_sample_per_variant: z.number().int(),
  target_lift: z.number().nullable(),
  planned_start_at: nullableTimestamp,
  started_at: nullableTimestamp,
  ended_at: nullableTimestamp,
  linked_issue_id: uuid.nullable(),
  responsible_agent_id: uuid.nullable(),
  version: z.number().int(),
  archived_at: nullableTimestamp,
  updated_at: timestamp,
}).strict();

const variantRowSchema = z.object({
  id: uuid,
  company_id: uuid,
  experiment_id: uuid,
  key: z.string(),
  name: z.string(),
  description: z.string(),
  is_control: z.boolean(),
  sort_order: z.number().int(),
}).strict();

const entryRowSchema = z.object({
  id: uuid,
  company_id: uuid,
  experiment_id: uuid,
  variant_id: uuid,
  lead_key_hash: z.string(),
  outcome: z.enum(EXPERIMENT_OUTCOMES),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  entered_at: timestamp,
  outcome_at: nullableTimestamp,
  version: z.number().int(),
}).strict();

const snapshotRowSchema = z.object({
  id: uuid,
  company_id: uuid,
  experiment_id: uuid,
  recorded_at: timestamp,
  variant_metrics_json: z.array(variantMetricSchema),
  funnel_generated_at: nullableTimestamp,
  funnel_data_through: nullableTimestamp,
  funnel_quality_status: z.enum(FUNNEL_QUALITIES).nullable(),
  source: z.enum(SNAPSHOT_SOURCES),
}).strict();

const observationRowSchema = z.object({
  id: uuid,
  company_id: uuid,
  experiment_id: uuid,
  kind: z.enum(OBSERVATION_KINDS),
  summary: z.string(),
  evidence_json: z.record(z.unknown()),
  funnel_generated_at: nullableTimestamp,
  funnel_report_hash: z.string().nullable(),
  issue_comment_id: uuid.nullable(),
  work_product_id: uuid.nullable(),
  idempotency_key: z.string().nullable(),
  created_at: timestamp,
}).strict();

export function experimentFromRow(input: unknown): Experiment {
  const row = experimentRowSchema.parse(input);
  return experimentSchema.parse({
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    hypothesis: row.hypothesis,
    status: row.status,
    primaryMetric: row.primary_metric,
    guardrailMetric: row.guardrail_metric,
    minimumSamplePerVariant: row.minimum_sample_per_variant,
    targetLift: row.target_lift,
    plannedStartAt: row.planned_start_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    linkedIssueId: row.linked_issue_id,
    responsibleAgentId: row.responsible_agent_id,
    version: row.version,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  });
}

export function variantFromRow(input: unknown): Variant {
  const row = variantRowSchema.parse(input);
  return variantSchema.parse({
    id: row.id,
    companyId: row.company_id,
    experimentId: row.experiment_id,
    key: row.key,
    name: row.name,
    description: row.description,
    isControl: row.is_control,
    sortOrder: row.sort_order,
  });
}

export function persistedEntryFromRow(input: unknown): PersistedEntry {
  const row = entryRowSchema.parse(input);
  return persistedEntrySchema.parse({
    id: row.id,
    companyId: row.company_id,
    experimentId: row.experiment_id,
    variantId: row.variant_id,
    leadKeyHash: row.lead_key_hash,
    outcome: row.outcome,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    enteredAt: row.entered_at,
    outcomeAt: row.outcome_at,
    version: row.version,
  });
}

export function snapshotFromRow(input: unknown): Snapshot {
  const row = snapshotRowSchema.parse(input);
  return snapshotSchema.parse({
    id: row.id,
    companyId: row.company_id,
    experimentId: row.experiment_id,
    recordedAt: row.recorded_at,
    variantMetrics: row.variant_metrics_json,
    funnelGeneratedAt: row.funnel_generated_at,
    funnelDataThrough: row.funnel_data_through,
    funnelQuality: row.funnel_quality_status,
    source: row.source,
  });
}

export function observationFromRow(input: unknown): Observation {
  const row = observationRowSchema.parse(input);
  return observationSchema.parse({
    id: row.id,
    companyId: row.company_id,
    experimentId: row.experiment_id,
    kind: row.kind,
    summary: row.summary,
    evidence: row.evidence_json,
    funnelGeneratedAt: row.funnel_generated_at,
    funnelReportHash: row.funnel_report_hash,
    issueCommentId: row.issue_comment_id,
    workProductId: row.work_product_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  });
}
