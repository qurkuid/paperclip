import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** Immutable, metadata-only GitHub analysis inputs. */
export const githubRepositorySnapshots = pgTable(
  "github_repository_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    sourceEvidenceUrl: text("source_evidence_url").notNull(),
    owner: text("owner").notNull(),
    repository: text("repository").notNull(),
    defaultBranch: text("default_branch"),
    headCommit: text("head_commit"),
    status: text("status").notNull(),
    license: text("license"),
    recommendation: text("recommendation").notNull(),
    exclusionScope: jsonb("exclusion_scope").$type<string[]>().notNull().default([]),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCollectedAtIdx: index("github_repository_snapshots_company_collected_at_idx").on(
      table.companyId,
      table.collectedAt,
    ),
  }),
);
