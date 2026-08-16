import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/001_spacebogam_experiments.sql", import.meta.url),
  "utf8",
);

describe("Spacebogam experiment database migration", () => {
  it("uses the host-derived namespace and company-scoped foreign keys", () => {
    expect(migration).not.toContain("CREATE SCHEMA");
    expect(migration).toContain("plugin_spacebogam_experiments_1504d837a1");
    expect(migration).toMatch(
      /FOREIGN KEY \(company_id, experiment_id\)[\s\S]+REFERENCES plugin_spacebogam_experiments_1504d837a1\.experiments \(company_id, id\)/u,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(company_id, experiment_id, variant_id\)[\s\S]+REFERENCES plugin_spacebogam_experiments_1504d837a1\.experiment_variants \(company_id, experiment_id, id\)/u,
    );
  });

  it("enforces one running experiment and idempotent append records", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX experiments_running_unique[\s\S]+WHERE status = 'running' AND archived_at IS NULL/u,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX experiment_observations_idempotency_unique[\s\S]+WHERE idempotency_key IS NOT NULL/u,
    );
    expect(migration).toContain(
      "UNIQUE (company_id, experiment_id, lead_key_hash)",
    );
  });

  it("keeps snapshots immutable at the repository boundary", () => {
    expect(migration).toContain("CREATE TABLE plugin_spacebogam_experiments_1504d837a1.experiment_snapshots");
    expect(migration).not.toMatch(/UPDATE\s+plugin_spacebogam_experiments_1504d837a1\.experiment_snapshots/iu);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+plugin_spacebogam_experiments_1504d837a1\.experiment_snapshots/iu);
  });

  it("references only core tables supported by the plugin database contract", () => {
    expect(migration).not.toContain("public.work_products");
    expect(migration).not.toContain("public.issue_work_products");
    expect(migration).toContain("issue_comment_id uuid REFERENCES public.issue_comments(id)");
    expect(migration).toContain("work_product_id uuid");
  });

  it("contains no raw lead or direct contact fields", () => {
    const entryTable = migration.match(
      /CREATE TABLE [\s\S]+?\.experiment_entries \(([\s\S]+?)\n\);/u,
    )?.[1] ?? "";

    expect(migration).toContain("lead_key_hash");
    expect(entryTable).not.toMatch(/\blead_key\b/iu);
    expect(entryTable).not.toMatch(/\b(phone|email|name|address|ip)\b/iu);
  });
});
