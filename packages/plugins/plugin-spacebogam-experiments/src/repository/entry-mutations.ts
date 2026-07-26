import { z } from "zod";
import { persistedEntrySchema } from "../contracts/index.js";
import { repositoryTable, type ExperimentDatabase } from "./database.js";
import {
  ExperimentRepositoryError,
  type EntryWrite,
  type ExperimentDetail,
  type RepositoryReader,
} from "./types.js";

const idempotencyKeySchema = z.string().min(1).max(200).nullable().optional();

function mutableExperiment(status: string, archivedAt: string | null | undefined): boolean {
  return archivedAt == null && status !== "completed" && status !== "cancelled";
}

async function requiredDetail(
  reader: RepositoryReader,
  companyId: string,
  experimentId: string,
): Promise<ExperimentDetail> {
  const detail = await reader.getExperiment(companyId, experimentId);
  if (detail === null) {
    throw new ExperimentRepositoryError("experiment_not_found", "Experiment not found");
  }
  if (!mutableExperiment(detail.experiment.status, detail.experiment.archivedAt)) {
    throw new ExperimentRepositoryError("variant_conflict", "Experiment entries are locked");
  }
  return detail;
}

export function createEntryMutations(
  database: ExperimentDatabase,
  reader: RepositoryReader,
) {
  const variants = repositoryTable(database, "experiment_variants");
  const entries = repositoryTable(database, "experiment_entries");

  async function createEntry(input: EntryWrite): Promise<ExperimentDetail> {
    const value = persistedEntrySchema.parse(input);
    const idempotencyKey = idempotencyKeySchema.parse(input.idempotencyKey);
    await requiredDetail(reader, value.companyId, value.experimentId);
    const [variantRows, duplicateRows] = await Promise.all([
      database.query(
        `SELECT id FROM ${variants}
          WHERE company_id = $1 AND experiment_id = $2 AND id = $3 LIMIT 1`,
        [value.companyId, value.experimentId, value.variantId],
      ),
      database.query(
        `SELECT id FROM ${entries}
          WHERE company_id = $1 AND experiment_id = $2
            AND (lead_key_hash = $3 OR ($4::text IS NOT NULL AND idempotency_key = $4))
          LIMIT 1`,
        [value.companyId, value.experimentId, value.leadKeyHash, idempotencyKey ?? null],
      ),
    ]);
    if (variantRows.length === 0) {
      throw new ExperimentRepositoryError("experiment_not_found", "Experiment variant not found");
    }
    if (duplicateRows.length > 0) {
      throw new ExperimentRepositoryError("idempotency_conflict", "Entry already exists");
    }
    await database.execute(
      `INSERT INTO ${entries}
        (id, company_id, experiment_id, variant_id, lead_key_hash, outcome,
         utm_source, utm_medium, utm_campaign, entered_at, outcome_at,
         idempotency_key, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        value.id, value.companyId, value.experimentId, value.variantId,
        value.leadKeyHash, value.outcome, value.utmSource ?? null,
        value.utmMedium ?? null, value.utmCampaign ?? null, value.enteredAt,
        value.outcomeAt, idempotencyKey ?? null, value.version,
      ],
    );
    return requiredDetail(reader, value.companyId, value.experimentId);
  }

  async function updateEntry(input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly entryId: string;
    readonly expectedVersion: number;
    readonly patch: EntryWrite;
  }): Promise<ExperimentDetail> {
    const value = persistedEntrySchema.parse(input.patch);
    await requiredDetail(reader, input.companyId, input.experimentId);
    const variantRows = await database.query(
      `SELECT id FROM ${variants}
        WHERE company_id = $1 AND experiment_id = $2 AND id = $3 LIMIT 1`,
      [input.companyId, input.experimentId, value.variantId],
    );
    if (variantRows.length === 0) {
      throw new ExperimentRepositoryError("experiment_not_found", "Experiment variant not found");
    }
    const result = await database.execute(
      `UPDATE ${entries}
          SET variant_id = $5, lead_key_hash = $6, outcome = $7,
              utm_source = $8, utm_medium = $9, utm_campaign = $10,
              entered_at = $11, outcome_at = $12,
              version = version + 1, updated_at = $13
        WHERE company_id = $1 AND experiment_id = $2 AND id = $3 AND version = $4`,
      [
        input.companyId, input.experimentId, input.entryId, input.expectedVersion,
        value.variantId, value.leadKeyHash, value.outcome,
        value.utmSource ?? null, value.utmMedium ?? null,
        value.utmCampaign ?? null, value.enteredAt, value.outcomeAt,
        new Date().toISOString(),
      ],
    );
    if (result.rowCount === 0) {
      throw new ExperimentRepositoryError("invalid_version", "Entry version changed");
    }
    return requiredDetail(reader, input.companyId, input.experimentId);
  }

  async function deleteEntry(input: {
    readonly companyId: string;
    readonly experimentId: string;
    readonly entryId: string;
    readonly variantId: string;
    readonly expectedVersion: number;
  }): Promise<ExperimentDetail> {
    await requiredDetail(reader, input.companyId, input.experimentId);
    const result = await database.execute(
      `DELETE FROM ${entries}
        WHERE company_id = $1 AND experiment_id = $2 AND id = $3
          AND variant_id = $4 AND version = $5`,
      [
        input.companyId, input.experimentId, input.entryId,
        input.variantId, input.expectedVersion,
      ],
    );
    if (result.rowCount === 0) {
      throw new ExperimentRepositoryError("invalid_version", "Entry version changed");
    }
    return requiredDetail(reader, input.companyId, input.experimentId);
  }

  return { createEntry, updateEntry, deleteEntry };
}
