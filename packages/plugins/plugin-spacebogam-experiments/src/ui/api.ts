import type { Experiment, ExperimentDetail, OverviewData } from "./types.js";

export const SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS = 300_000;

export type BridgeQueryName = "overview" | "experiment";
export type OverviewQuery = {
  readonly key: readonly ["spacebogam-experiments", "overview", string];
  readonly name: "overview";
  readonly params: { readonly companyId: string };
  readonly refreshIntervalMs: number;
};
export type ExperimentQuery = {
  readonly key: readonly ["spacebogam-experiments", "experiment", string, string | null];
  readonly name: "experiment";
  readonly params: { readonly companyId: string; readonly experimentId?: string };
  readonly refreshIntervalMs: number;
};
export type FreshnessInput = {
  readonly loadedAtMs: number;
  readonly nowMs: number;
  readonly staleAfterMs?: number;
};
export type UiDataState<T> =
  | { readonly kind: "ready"; readonly data: T; readonly stale: false }
  | { readonly kind: "empty"; readonly data: OverviewData; readonly stale: false }
  | { readonly kind: "stale"; readonly data: T; readonly stale: true }
  | { readonly kind: "plugin-not-ready"; readonly data: OverviewData; readonly stale: false }
  | { readonly kind: "no-experiment"; readonly stale: false }
  | { readonly kind: "invalid-response"; readonly code: "invalid_response"; readonly message: string; readonly stale: boolean };
export type NormalizedBridgeError =
  | { readonly kind: "error"; readonly code: "worker_error"; readonly message: string }
  | { readonly kind: "conflict"; readonly code: "conflict"; readonly message: string };

export function buildOverviewQuery(companyId: string): OverviewQuery {
  return {
    key: ["spacebogam-experiments", "overview", companyId],
    name: "overview",
    params: { companyId },
    refreshIntervalMs: SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
  };
}

export function buildExperimentQuery(
  companyId: string,
  experimentId: string | null,
): ExperimentQuery {
  return {
    key: ["spacebogam-experiments", "experiment", companyId, experimentId],
    name: "experiment",
    params: experimentId === null ? { companyId } : { companyId, experimentId },
    refreshIntervalMs: SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
  };
}

export function isSpacebogamDataStale(
  loadedAtMs: number,
  nowMs: number,
  staleAfterMs = SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
): boolean {
  return nowMs - loadedAtMs >= staleAfterMs;
}

export function normalizeOverviewResponse(
  response: unknown,
  freshness: FreshnessInput,
): UiDataState<OverviewData> {
  const stale = freshnessFrom(freshness);
  if (!isOverviewData(response)) {
    return invalidResponse("Spacebogam experiments overview response is invalid.", stale);
  }
  if (stale) return { kind: "stale", data: response, stale: true };
  if (!response.configured) return { kind: "plugin-not-ready", data: response, stale: false };
  if (response.experiments.length === 0) return { kind: "empty", data: response, stale: false };
  return { kind: "ready", data: response, stale: false };
}

export function normalizeExperimentDetailResponse(
  response: unknown,
  freshness: FreshnessInput,
): UiDataState<ExperimentDetail> {
  const stale = freshnessFrom(freshness);
  if (response === null) return { kind: "no-experiment", stale: false };
  if (!isExperimentDetail(response)) {
    return invalidResponse("Spacebogam experiment detail response is invalid.", stale);
  }
  if (stale) return { kind: "stale", data: response, stale: true };
  return { kind: "ready", data: response, stale: false };
}

export function normalizeBridgeError(error: unknown): NormalizedBridgeError {
  const message = errorMessage(error);
  if (isRecord(error) && error["code"] === "conflict") {
    return { kind: "conflict", code: "conflict", message };
  }
  return { kind: "error", code: "worker_error", message };
}

function freshnessFrom(input: FreshnessInput): boolean {
  return isSpacebogamDataStale(
    input.loadedAtMs,
    input.nowMs,
    input.staleAfterMs ?? SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
  );
}

function invalidResponse(message: string, stale: boolean) {
  return { kind: "invalid-response", code: "invalid_response", message, stale } as const;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  if (isRecord(error) && typeof error["message"] === "string" && error["message"].trim() !== "") {
    return error["message"];
  }
  return "Spacebogam experiments data request failed.";
}

function isOverviewData(value: unknown): value is OverviewData {
  if (!isRecord(value)) return false;
  return (
    typeof value["pluginId"] === "string"
    && typeof value["companyId"] === "string"
    && typeof value["status"] === "string"
    && typeof value["configured"] === "boolean"
    && isExperimentArray(value["experiments"])
    && isOptionalLegacySource(value["legacySource"])
    && isOptionalLegacySourceStatus(value["legacySourceStatus"])
  );
}

function isOptionalLegacySource(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value["issueId"] === "string"
    && (value["identifier"] === null || typeof value["identifier"] === "string")
    && typeof value["href"] === "string"
  );
}

function isOptionalLegacySourceStatus(value: unknown): boolean {
  return (
    value === undefined
    || value === "not-configured"
    || value === "ready"
    || value === "invalid"
  );
}

function isExperimentDetail(value: unknown): value is ExperimentDetail {
  if (!isRecord(value)) return false;
  return (
    isExperiment(value["experiment"])
    && Array.isArray(value["variants"])
    && Array.isArray(value["variantMetrics"])
    && Array.isArray(value["snapshots"])
    && Array.isArray(value["recentObservations"])
  );
}

function isExperimentArray(value: unknown): value is Experiment[] {
  return Array.isArray(value) && value.every(isExperiment);
}

function isExperiment(value: unknown): value is Experiment {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string"
    && typeof value["companyId"] === "string"
    && typeof value["title"] === "string"
    && typeof value["hypothesis"] === "string"
    && isExperimentStatus(value["status"])
    && typeof value["minimumSamplePerVariant"] === "number"
    && Number.isInteger(value["minimumSamplePerVariant"])
    && typeof value["version"] === "number"
    && Number.isInteger(value["version"])
    && typeof value["updatedAt"] === "string"
  );
}

function isExperimentStatus(value: unknown): value is Experiment["status"] {
  return (
    value === "draft"
    || value === "running"
    || value === "paused"
    || value === "completed"
    || value === "cancelled"
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
