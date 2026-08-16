import {
  experimentSchema,
  observationSchema,
  persistedEntrySchema,
  snapshotSchema,
  variantSchema,
  type Experiment,
  type Observation,
  type PersistedEntry,
  type Snapshot,
  type Variant,
} from "../contracts/index.js";
import {
  repositoryTable,
  type ExperimentDatabase,
} from "./database.js";

export function createRepositoryWriter(database: ExperimentDatabase) {
  const experiments = repositoryTable(database, "experiments");
  const variants = repositoryTable(database, "experiment_variants");
  const entries = repositoryTable(database, "experiment_entries");
  const snapshots = repositoryTable(database, "experiment_snapshots");
  const observations = repositoryTable(database, "experiment_observations");

  async function createExperiment(input: Experiment): Promise<void> {
    const value = experimentSchema.parse(input);
    await database.execute(
      `INSERT INTO ${experiments}
        (id, company_id, title, hypothesis, status, primary_metric,
         guardrail_metric, minimum_sample_per_variant, target_lift,
         planned_start_at, started_at, ended_at, linked_issue_id,
         responsible_agent_id, version, archived_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        value.id, value.companyId, value.title, value.hypothesis, value.status,
        value.primaryMetric, value.guardrailMetric ?? null,
        value.minimumSamplePerVariant, value.targetLift ?? null,
        value.plannedStartAt ?? null, value.startedAt ?? null,
        value.endedAt ?? null, value.linkedIssueId ?? null,
        value.responsibleAgentId ?? null, value.version,
        value.archivedAt ?? null, value.updatedAt,
      ],
    );
  }

  async function createVariant(input: Variant): Promise<void> {
    const value = variantSchema.parse(input);
    await database.execute(
      `INSERT INTO ${variants}
        (id, company_id, experiment_id, key, name, description, is_control, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        value.id, value.companyId, value.experimentId, value.key,
        value.name, value.description, value.isControl, value.sortOrder,
      ],
    );
  }

  async function createEntry(input: PersistedEntry): Promise<void> {
    const value = persistedEntrySchema.parse(input);
    await database.execute(
      `INSERT INTO ${entries}
        (id, company_id, experiment_id, variant_id, lead_key_hash, outcome,
         utm_source, utm_medium, utm_campaign, entered_at, outcome_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        value.id, value.companyId, value.experimentId, value.variantId,
        value.leadKeyHash, value.outcome, value.utmSource ?? null,
        value.utmMedium ?? null, value.utmCampaign ?? null, value.enteredAt,
        value.outcomeAt, value.version,
      ],
    );
  }

  async function appendSnapshot(input: Snapshot): Promise<void> {
    const value = snapshotSchema.parse(input);
    await database.execute(
      `INSERT INTO ${snapshots}
        (id, company_id, experiment_id, recorded_at, variant_metrics_json,
         funnel_generated_at, funnel_data_through, funnel_quality_status, source)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
      [
        value.id, value.companyId, value.experimentId, value.recordedAt,
        JSON.stringify(value.variantMetrics), value.funnelGeneratedAt,
        value.funnelDataThrough, value.funnelQuality, value.source,
      ],
    );
  }

  async function appendObservation(input: Observation): Promise<void> {
    const value = observationSchema.parse(input);
    await database.execute(
      `INSERT INTO ${observations}
        (id, company_id, experiment_id, kind, summary, evidence_json,
         funnel_generated_at, funnel_report_hash, issue_comment_id,
         work_product_id, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
      [
        value.id, value.companyId, value.experimentId, value.kind,
        value.summary, JSON.stringify(value.evidence),
        value.funnelGeneratedAt, value.funnelReportHash, value.issueCommentId,
        value.workProductId, value.idempotencyKey, value.createdAt,
      ],
    );
  }

  return {
    createExperiment,
    createVariant,
    createEntry,
    appendSnapshot,
    appendObservation,
  };
}
