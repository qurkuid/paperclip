ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "provider_failover_config" jsonb NOT NULL DEFAULT '{}'::jsonb;
