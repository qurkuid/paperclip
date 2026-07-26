import { z } from "zod";

import {
  errorResponseSchema,
  type ApiErrorCode,
  type ErrorResponse,
} from "../contracts/index.js";
import type { RepositoryErrorCode } from "./types.js";

export class ServiceError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) {
    super(message);
    this.name = "SpacebogamExperimentServiceError";
  }
}

export function normalizeError(error: unknown, requestId: string): ErrorResponse {
  if (error instanceof ServiceError) return errorResponse(error.code, error.message, requestId);
  const issueError = issueIntegrationErrorFromUnknown(error);
  if (issueError !== null) {
    const code = issueError.code === "issue_company_mismatch"
      ? "company_isolation_violation"
      : issueError.code === "unsafe_strategy_content"
        ? "pii_payload_rejected"
        : "unknown_action";
    return errorResponse(code, issueError.message, requestId);
  }
  const repositoryError = repositoryErrorFromUnknown(error);
  if (repositoryError !== null) return errorResponse(repositoryCode(repositoryError.code), repositoryError.message, requestId);
  if (error instanceof z.ZodError) return errorResponse("unknown_action", "Invalid Spacebogam experiment action", requestId);
  if (error instanceof Error && isRepositoryCode(error.message)) return errorResponse(error.message, "Experiment mutation conflict", requestId);
  return errorResponse("unknown_action", "Spacebogam experiment action failed", requestId);
}

function issueIntegrationErrorFromUnknown(error: unknown): {
  readonly code:
    | "issue_company_mismatch"
    | "issue_document_invalid"
    | "unsafe_strategy_content";
  readonly message: string;
} | null {
  const result = z.object({
    code: z.enum([
      "issue_company_mismatch",
      "issue_document_invalid",
      "unsafe_strategy_content",
    ]),
    message: z.string().min(1),
  }).passthrough().safeParse(error);
  return result.success ? result.data : null;
}

function repositoryErrorFromUnknown(error: unknown): { readonly code: RepositoryErrorCode; readonly message: string } | null {
  const result = z.object({
    code: z.enum(["experiment_not_found", "idempotency_conflict", "immutable_snapshot", "running_experiment_exists", "invalid_version", "variant_conflict"]),
    message: z.string().min(1),
  }).passthrough().safeParse(error);
  return result.success ? { code: result.data.code, message: result.data.message } : null;
}

function repositoryCode(code: RepositoryErrorCode): ApiErrorCode {
  switch (code) {
    case "experiment_not_found":
    case "idempotency_conflict":
    case "immutable_snapshot":
    case "invalid_version":
    case "variant_conflict":
      return code;
    case "running_experiment_exists":
      return "invalid_status_transition";
  }
}

function isRepositoryCode(value: string): value is ApiErrorCode {
  return value === "experiment_not_found" || value === "idempotency_conflict" || value === "immutable_snapshot" || value === "invalid_version";
}

function errorResponse(code: ApiErrorCode, message: string, requestId: string): ErrorResponse {
  return errorResponseSchema.parse({ ok: false, code, message, requestId });
}
