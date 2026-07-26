import {
  spacebogamFunnelReportSchema,
  type SpacebogamFunnelRangeDays,
  type SpacebogamFunnelReport,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import { api, ApiError } from "./client";

export type SpacebogamFunnelApiErrorCode =
  | "invalid_range_days"
  | "not_configured"
  | "upstream_error"
  | "disabled"
  | "timeout"
  | "invalid_response";

const SERVER_ERROR_CODES: Record<string, SpacebogamFunnelApiErrorCode> = {
  invalid_range_days: "invalid_range_days",
  spacebogam_funnel_not_configured: "not_configured",
  spacebogam_funnel_invalid_response: "invalid_response",
  spacebogam_funnel_upstream_error: "upstream_error",
  spacebogam_funnel_disabled: "disabled",
  spacebogam_funnel_timeout: "timeout",
};

export function spacebogamFunnelQueryKey(
  companyId: string,
  rangeDays: SpacebogamFunnelRangeDays,
): readonly ["spacebogam-funnel", string, SpacebogamFunnelRangeDays] {
  return ["spacebogam-funnel", companyId, rangeDays];
}

export class SpacebogamFunnelApiError extends Error {
  code: SpacebogamFunnelApiErrorCode;
  status: number;
  cause: unknown;

  constructor(code: SpacebogamFunnelApiErrorCode, status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "SpacebogamFunnelApiError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

function readServerErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = Reflect.get(body, "error");
  return typeof value === "string" ? value : null;
}

function normalizeSpacebogamError(error: ApiError): SpacebogamFunnelApiError {
  const serverCode = readServerErrorCode(error.body);
  const code = serverCode ? SERVER_ERROR_CODES[serverCode] : undefined;
  return new SpacebogamFunnelApiError(
    code ?? "upstream_error",
    error.status,
    serverCode ?? error.message,
    error,
  );
}

export async function fetchSpacebogamFunnel(
  companyId: string,
  rangeDays: SpacebogamFunnelRangeDays,
): Promise<SpacebogamFunnelReport> {
  try {
    const raw = await api.get<unknown>(
      `/companies/${companyId}/analytics/spacebogam-funnel?rangeDays=${rangeDays}`,
    );
    return spacebogamFunnelReportSchema.parse(raw);
  } catch (error) {
    if (error instanceof ApiError) {
      throw normalizeSpacebogamError(error);
    }
    throw new SpacebogamFunnelApiError(
      "invalid_response",
      502,
      "Invalid Spacebogam funnel response",
      error,
    );
  }
}

export const spacebogamFunnelApi = {
  get: fetchSpacebogamFunnel,
};
