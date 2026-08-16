import {
  experimentFromRow,
  observationFromRow,
  persistedEntryFromRow,
  snapshotFromRow,
  variantFromRow,
} from "./rows.js";
import { repositoryTable, type ExperimentDatabase } from "./database.js";
import type { Experiment } from "../contracts/index.js";
import type { ExperimentDetail, RepositoryReader } from "./types.js";

function experimentColumns(): string {
  return `id, company_id, title, hypothesis, status, primary_metric,
    guardrail_metric, minimum_sample_per_variant, target_lift,
    planned_start_at::text AS planned_start_at, started_at::text AS started_at,
    ended_at::text AS ended_at, linked_issue_id, responsible_agent_id, version,
    archived_at::text AS archived_at, updated_at::text AS updated_at`;
}

export function createRepositoryReader(
  database: ExperimentDatabase,
): RepositoryReader {
  const experiments = repositoryTable(database, "experiments");
  const variants = repositoryTable(database, "experiment_variants");
  const entries = repositoryTable(database, "experiment_entries");
  const snapshots = repositoryTable(database, "experiment_snapshots");
  const observations = repositoryTable(database, "experiment_observations");

  async function findExperiment(
    companyId: string,
    experimentId: string,
  ): Promise<Experiment | null> {
    const rows = await database.query(
      `SELECT ${experimentColumns()}
         FROM ${experiments}
        WHERE company_id = $1 AND id = $2
        LIMIT 1`,
      [companyId, experimentId],
    );
    const row = rows[0];
    return row === undefined ? null : experimentFromRow(row);
  }

  async function listExperiments(companyId: string): Promise<Experiment[]> {
    const rows = await database.query(
      `SELECT ${experimentColumns()}
         FROM ${experiments}
        WHERE company_id = $1
        ORDER BY archived_at NULLS FIRST, started_at DESC NULLS LAST, updated_at DESC`,
      [companyId],
    );
    return rows.map(experimentFromRow);
  }

  async function getExperiment(
    companyId: string,
    experimentId: string,
  ): Promise<ExperimentDetail | null> {
    const experiment = await findExperiment(companyId, experimentId);
    if (experiment === null) return null;
    const params = [companyId, experimentId];
    const [variantRows, entryRows, snapshotRows, observationRows] = await Promise.all([
      database.query(
        `SELECT id, company_id, experiment_id, key, name, description,
                is_control, sort_order
           FROM ${variants}
          WHERE company_id = $1 AND experiment_id = $2
          ORDER BY sort_order, key`,
        params,
      ),
      database.query(
        `SELECT id, company_id, experiment_id, variant_id, lead_key_hash,
                outcome, utm_source, utm_medium, utm_campaign,
                entered_at::text AS entered_at, outcome_at::text AS outcome_at,
                version
           FROM ${entries}
          WHERE company_id = $1 AND experiment_id = $2
          ORDER BY entered_at, id`,
        params,
      ),
      database.query(
        `SELECT id, company_id, experiment_id, recorded_at::text AS recorded_at,
                variant_metrics_json, funnel_generated_at::text AS funnel_generated_at,
                funnel_data_through::text AS funnel_data_through,
                funnel_quality_status, source
           FROM ${snapshots}
          WHERE company_id = $1 AND experiment_id = $2
          ORDER BY recorded_at DESC`,
        params,
      ),
      database.query(
        `SELECT id, company_id, experiment_id, kind, summary, evidence_json,
                funnel_generated_at::text AS funnel_generated_at,
                funnel_report_hash, issue_comment_id, work_product_id,
                idempotency_key, created_at::text AS created_at
           FROM ${observations}
          WHERE company_id = $1 AND experiment_id = $2
          ORDER BY created_at DESC`,
        params,
      ),
    ]);
    return {
      experiment,
      variants: variantRows.map(variantFromRow),
      entries: entryRows.map(persistedEntryFromRow),
      snapshots: snapshotRows.map(snapshotFromRow),
      observations: observationRows.map(observationFromRow),
    };
  }

  return { findExperiment, listExperiments, getExperiment };
}
