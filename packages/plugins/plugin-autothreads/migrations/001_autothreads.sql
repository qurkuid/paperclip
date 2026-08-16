CREATE TABLE plugin_autothreads_4a225c6698.contents (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  body text NOT NULL,
  source_url text,
  scheduled_at_utc timestamptz,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  status text NOT NULL DEFAULT 'DRAFT',
  approval_status text NOT NULL DEFAULT 'NONE',
  approval_revision integer,
  idempotency_key text NOT NULL,
  external_media_id text,
  permalink text,
  published_at timestamptz,
  last_error_code text,
  last_error_safe_message text,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);
CREATE INDEX contents_due_idx ON plugin_autothreads_4a225c6698.contents (company_id, status, scheduled_at_utc);
CREATE UNIQUE INDEX contents_external_media_id_uq ON plugin_autothreads_4a225c6698.contents (company_id, external_media_id) WHERE external_media_id IS NOT NULL;
CREATE TABLE plugin_autothreads_4a225c6698.content_revisions (
  id uuid PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES plugin_autothreads_4a225c6698.contents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  revision integer NOT NULL,
  body text NOT NULL,
  scheduled_at_utc timestamptz,
  changed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, revision)
);
CREATE TABLE plugin_autothreads_4a225c6698.publish_attempts (
  id uuid PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES plugin_autothreads_4a225c6698.contents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  outcome text NOT NULL,
  provider_code text,
  safe_message text,
  external_media_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (content_id, attempt_number)
);
