export const EXPERIMENT_STATUSES = ["draft", "running", "paused", "completed", "cancelled"] as const;
export const EXPERIMENT_OUTCOMES = ["pending", "won", "lost", "disqualified"] as const;
export const READINESS_STATES = [
  "collecting",
  "measurement_attention",
  "record_stale",
  "directional_review",
  "recorded",
] as const;
export const GUARDRAIL_METRICS = ["disqualification_rate", "pending_staleness"] as const;
export const FUNNEL_QUALITIES = ["ready", "collecting", "empty", "stale", "invalid_sequence", "error"] as const;
export const OBSERVATION_KINDS = ["note", "measurement", "strategy_proposal", "decision_result"] as const;
export const SNAPSHOT_SOURCES = ["manual", "board_refresh", "agent_observation", "lifecycle"] as const;
export const ALLOWED_LIFECYCLE_TRANSITIONS = [
  "draft:running",
  "running:paused",
  "paused:running",
  "running:completed",
  "paused:completed",
  "draft:cancelled",
  "running:cancelled",
  "paused:cancelled",
] as const;
export const ENTRY_PII_FIELD_KEYS = ["phone", "email", "name", "address", "ip"] as const;
export const BOARD_ACTIONS = [
  "create-experiment",
  "update-experiment",
  "replace-draft-variants",
  "start-experiment",
  "pause-experiment",
  "complete-experiment",
  "cancel-experiment",
  "archive-experiment",
  "create-entry",
  "update-entry",
  "delete-entry",
  "link-issue",
  "link-legacy-source",
  "select-responsible-agent",
  "request-strategy",
  "reconcile-managed-routine",
] as const;

export const TOOL_ACTIONS = [
  "spacebogam_experiments_overview",
  "spacebogam_experiment_get",
  "spacebogam_experiment_record_observation",
  "spacebogam_experiment_propose_strategy",
] as const;
export const API_ERROR_CODES = [
  "experiment_not_found",
  "invalid_version",
  "invalid_status_transition",
  "variant_conflict",
  "pii_payload_rejected",
  "idempotency_conflict",
  "immutable_snapshot",
  "company_isolation_violation",
  "unknown_action",
] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export type ExperimentOutcome = (typeof EXPERIMENT_OUTCOMES)[number];
export type AllowedLifecycleTransition = (typeof ALLOWED_LIFECYCLE_TRANSITIONS)[number];
export type EntryPiiFieldKey = (typeof ENTRY_PII_FIELD_KEYS)[number];
export type ReadinessState = (typeof READINESS_STATES)[number];
export type FunnelQuality = (typeof FUNNEL_QUALITIES)[number];
export type BoardAction = (typeof BOARD_ACTIONS)[number];
export type ToolAction = (typeof TOOL_ACTIONS)[number];
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
