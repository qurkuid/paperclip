import {
  observationSchema,
  snapshotSchema,
  type Observation,
  type Snapshot,
} from "../contracts/index.js";
import { repositoryTable, type ExperimentDatabase } from "./database.js";
import { ExperimentRepositoryError } from "./types.js";
import { createRepositoryWriter } from "./write.js";

export function createAppendOperations(database: ExperimentDatabase) {
  const snapshots = repositoryTable(database, "experiment_snapshots");
  const observations = repositoryTable(database, "experiment_observations");
  const writer = createRepositoryWriter(database);

  async function appendSnapshot(input: Snapshot): Promise<void> {
    const value = snapshotSchema.parse(input);
    const rows = await database.query(
      `SELECT id FROM ${snapshots}
        WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [value.companyId, value.id],
    );
    if (rows.length > 0) {
      throw new ExperimentRepositoryError("immutable_snapshot", "Snapshot already exists");
    }
    await writer.appendSnapshot(value);
  }

  async function appendObservation(input: Observation): Promise<void> {
    const value = observationSchema.parse(input);
    if (value.idempotencyKey !== null) {
      const rows = await database.query(
        `SELECT id FROM ${observations}
          WHERE company_id = $1 AND experiment_id = $2 AND idempotency_key = $3
          LIMIT 1`,
        [value.companyId, value.experimentId, value.idempotencyKey],
      );
      if (rows.length > 0) {
        throw new ExperimentRepositoryError(
          "idempotency_conflict",
          "Observation already exists",
        );
      }
    }
    await writer.appendObservation(value);
  }

  return { appendSnapshot, appendObservation };
}
