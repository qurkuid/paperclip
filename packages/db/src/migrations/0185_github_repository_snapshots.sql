CREATE TABLE IF NOT EXISTS "github_repository_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "source_url" text NOT NULL,
  "source_evidence_url" text NOT NULL,
  "owner" text NOT NULL,
  "repository" text NOT NULL,
  "default_branch" text,
  "head_commit" text,
  "status" text NOT NULL,
  "license" text,
  "recommendation" text NOT NULL,
  "exclusion_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "collected_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "github_repository_snapshots_company_collected_at_idx"
  ON "github_repository_snapshots" USING btree ("company_id", "collected_at");
