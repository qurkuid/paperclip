import { describe, expect, it } from "vitest";
import {
  createExperimentRepository,
  type ExperimentDatabase,
} from "../src/repository.js";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const EXPERIMENT_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-27T03:00:00.000Z";

const experimentRow = {
  id: EXPERIMENT_ID,
  company_id: COMPANY_A,
  title: "상담 CTA 실험",
  hypothesis: "짧은 CTA가 상담 전환을 높인다.",
  status: "draft",
  primary_metric: "won_rate",
  guardrail_metric: null,
  minimum_sample_per_variant: 30,
  target_lift: null,
  planned_start_at: null,
  started_at: null,
  ended_at: null,
  linked_issue_id: null,
  responsible_agent_id: null,
  version: 2,
  archived_at: null,
  updated_at: NOW,
};

class RecordingDatabase implements ExperimentDatabase {
  readonly namespace = "plugin_spacebogam_experiments_1504d837a1";
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  constructor(
    private readonly queryResult: (sql: string, params: readonly unknown[]) => readonly unknown[],
    private readonly executeResult: (sql: string, params: readonly unknown[]) => number = () => 1,
  ) {}

  async query(sql: string, params: readonly unknown[] = []): Promise<unknown[]> {
    this.calls.push({ sql, params });
    return [...this.queryResult(sql, params)];
  }

  async execute(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rowCount: number }> {
    this.calls.push({ sql, params });
    return { rowCount: this.executeResult(sql, params) };
  }
}

describe("Spacebogam experiment repository", () => {
  it("scopes list and detail reads by company", async () => {
    const database = new RecordingDatabase((sql, params) => {
      if (!sql.includes("FROM") || params[0] !== COMPANY_A) return [];
      return sql.includes("experiments") ? [experimentRow] : [];
    });
    const repository = createExperimentRepository(database);

    const companyA = await repository.listExperiments(COMPANY_A);
    const companyB = await repository.getExperiment(COMPANY_B, EXPERIMENT_ID);

    expect(companyA).toHaveLength(1);
    expect(companyA[0]?.companyId).toBe(COMPANY_A);
    expect(companyB).toBeNull();
    expect(database.calls.every((call) => call.sql.includes("company_id"))).toBe(true);
  });

  it("normalizes PostgreSQL timestamptz text returned by namespaced queries", async () => {
    const database = new RecordingDatabase((sql) =>
      sql.includes("experiments")
        ? [{ ...experimentRow, updated_at: "2026-07-27 03:00:00+00" }]
        : []);
    const repository = createExperimentRepository(database);

    await expect(repository.listExperiments(COMPANY_A)).resolves.toEqual([
      expect.objectContaining({ updatedAt: NOW }),
    ]);
  });

  it("uses company and expected version in lifecycle updates", async () => {
    const database = new RecordingDatabase(
      (sql, params) =>
        sql.includes(".experiments") && params[0] === COMPANY_A
          ? [experimentRow]
          : [],
      () => 0,
    );
    const repository = createExperimentRepository(database);

    await expect(
      repository.startExperiment({
        companyId: COMPANY_A,
        experimentId: EXPERIMENT_ID,
        expectedVersion: 1,
        startedAt: NOW,
      }),
    ).rejects.toMatchObject({
      code: "invalid_version",
    });

    const update = database.calls.find((call) => call.sql.includes("UPDATE"));
    expect(update?.sql).toContain("company_id = $1");
    expect(update?.sql).toContain("version = $3");
    expect(update?.sql).toContain("$5::timestamptz");
    expect(update?.params).toEqual([
      COMPANY_A,
      EXPERIMENT_ID,
      1,
      "running",
      NOW,
    ]);
  });

  it("returns not found instead of leaking another company's record", async () => {
    const database = new RecordingDatabase(
      (_sql, params) => params[0] === COMPANY_A ? [experimentRow] : [],
      () => 0,
    );
    const repository = createExperimentRepository(database);

    await expect(
      repository.startExperiment({
        companyId: COMPANY_B,
        experimentId: EXPERIMENT_ID,
        expectedVersion: 2,
        startedAt: NOW,
      }),
    ).rejects.toMatchObject({
      code: "experiment_not_found",
    });
  });

  it("exposes append-only snapshot and observation operations", () => {
    const database = new RecordingDatabase(() => []);
    const repository = createExperimentRepository(database);

    expect(repository.appendSnapshot).toBeTypeOf("function");
    expect(repository.appendObservation).toBeTypeOf("function");
    expect("updateSnapshot" in repository).toBe(false);
    expect("deleteSnapshot" in repository).toBe(false);
    expect("updateObservation" in repository).toBe(false);
    expect("deleteObservation" in repository).toBe(false);
  });
});
