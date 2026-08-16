CREATE TABLE plugin_spacebogam_experiments_1504d837a1.experiments (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  hypothesis text NOT NULL CHECK (char_length(hypothesis) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  primary_metric text NOT NULL DEFAULT 'won_rate'
    CHECK (primary_metric = 'won_rate'),
  guardrail_metric text
    CHECK (guardrail_metric IS NULL OR guardrail_metric IN ('disqualification_rate', 'pending_staleness')),
  minimum_sample_per_variant integer NOT NULL DEFAULT 30
    CHECK (minimum_sample_per_variant BETWEEN 1 AND 100000),
  target_lift numeric,
  planned_start_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  linked_issue_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  responsible_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_type text,
  created_by_id uuid,
  updated_by_type text,
  updated_by_id uuid,
  UNIQUE (company_id, id),
  CHECK (
    (status IN ('completed', 'cancelled') AND ended_at IS NOT NULL)
    OR (status NOT IN ('completed', 'cancelled') AND ended_at IS NULL)
  )
);

CREATE TABLE plugin_spacebogam_experiments_1504d837a1.experiment_variants (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL,
  key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]*$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  is_control boolean NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, experiment_id, key),
  UNIQUE (company_id, experiment_id, id),
  FOREIGN KEY (company_id, experiment_id)
    REFERENCES plugin_spacebogam_experiments_1504d837a1.experiments (company_id, id)
    ON DELETE CASCADE
);

CREATE TABLE plugin_spacebogam_experiments_1504d837a1.experiment_entries (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  lead_key_hash text NOT NULL CHECK (char_length(lead_key_hash) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK (outcome IN ('pending', 'won', 'lost', 'disqualified')),
  utm_source text CHECK (utm_source IS NULL OR char_length(utm_source) <= 120),
  utm_medium text CHECK (utm_medium IS NULL OR char_length(utm_medium) <= 120),
  utm_campaign text CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 200),
  entered_at timestamptz NOT NULL,
  outcome_at timestamptz,
  idempotency_key text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_type text,
  created_by_id uuid,
  updated_by_type text,
  updated_by_id uuid,
  UNIQUE (company_id, experiment_id, lead_key_hash),
  UNIQUE (company_id, experiment_id, idempotency_key),
  FOREIGN KEY (company_id, experiment_id)
    REFERENCES plugin_spacebogam_experiments_1504d837a1.experiments (company_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (company_id, experiment_id, variant_id)
    REFERENCES plugin_spacebogam_experiments_1504d837a1.experiment_variants (company_id, experiment_id, id)
    ON DELETE CASCADE,
  CHECK (
    (outcome = 'pending' AND outcome_at IS NULL)
    OR (outcome <> 'pending' AND outcome_at IS NOT NULL)
  )
);

CREATE TABLE plugin_spacebogam_experiments_1504d837a1.experiment_snapshots (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  variant_metrics_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  delta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  guardrail_json jsonb,
  funnel_generated_at timestamptz,
  funnel_data_through timestamptz,
  funnel_quality_status text,
  funnel_report_hash text,
  source text NOT NULL
    CHECK (source IN ('manual', 'board_refresh', 'agent_observation', 'lifecycle')),
  actor_type text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, experiment_id)
    REFERENCES plugin_spacebogam_experiments_1504d837a1.experiments (company_id, id)
    ON DELETE CASCADE
);

CREATE TABLE plugin_spacebogam_experiments_1504d837a1.experiment_observations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('note', 'measurement', 'strategy_proposal', 'decision_result')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  funnel_generated_at timestamptz,
  funnel_report_hash text,
  issue_comment_id uuid REFERENCES public.issue_comments(id) ON DELETE SET NULL,
  work_product_id uuid,
  idempotency_key text,
  actor_type text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, experiment_id)
    REFERENCES plugin_spacebogam_experiments_1504d837a1.experiments (company_id, id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX experiments_running_unique
  ON plugin_spacebogam_experiments_1504d837a1.experiments (company_id)
  WHERE status = 'running' AND archived_at IS NULL;

CREATE UNIQUE INDEX experiment_variants_control_unique
  ON plugin_spacebogam_experiments_1504d837a1.experiment_variants (company_id, experiment_id)
  WHERE is_control IS TRUE;

CREATE UNIQUE INDEX experiment_observations_idempotency_unique
  ON plugin_spacebogam_experiments_1504d837a1.experiment_observations
    (company_id, experiment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX experiments_company_status_started_at_idx
  ON plugin_spacebogam_experiments_1504d837a1.experiments
    (company_id, status, started_at DESC);

CREATE INDEX experiments_company_linked_issue_id_idx
  ON plugin_spacebogam_experiments_1504d837a1.experiments
    (company_id, linked_issue_id);
