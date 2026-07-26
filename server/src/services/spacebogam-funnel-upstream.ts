import {
  spacebogamFunnelReportSchema,
  type SpacebogamFunnelReport,
} from "@paperclipai/shared/validators/spacebogam-funnel";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export type SpacebogamFunnelUpstreamFetch = (url: string, init: RequestInit) => Promise<Response>;

export type SpacebogamFunnelUpstreamClientConfig = {
  upstreamUrl?: string | null;
  upstreamToken?: string | null;
  paperclipCompanyId?: string | null;
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetchImpl?: SpacebogamFunnelUpstreamFetch;
};

export type SpacebogamFunnelUpstreamError =
  | { kind: "disabled"; message: string }
  | { kind: "not_configured"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "redirect"; status: number; message: string }
  | { kind: "body_too_large"; message: string }
  | { kind: "invalid_json"; message: string }
  | { kind: "invalid_schema"; message: string }
  | { kind: "auth_failed"; status: number; message: string }
  | { kind: "upstream_error"; status?: number; message: string };

export type SpacebogamFunnelFetchResult =
  | { ok: true; report: SpacebogamFunnelReport }
  | { ok: false; error: SpacebogamFunnelUpstreamError };

export type SpacebogamFunnelUpstreamClient = {
  fetchReport(input: {
    companyId: string;
    rangeDays: 7 | 28 | 90;
  }): Promise<SpacebogamFunnelFetchResult>;
};

type ResolvedConfig = {
  upstreamUrl: string;
  upstreamToken: string;
  paperclipCompanyId: string;
  timeoutMs: number;
  maxBodyBytes: number;
  fetchImpl: SpacebogamFunnelUpstreamFetch;
};

type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; error: Extract<SpacebogamFunnelUpstreamError, { kind: "body_too_large" }> };

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveConfig(config: SpacebogamFunnelUpstreamClientConfig): ResolvedConfig | null {
  const upstreamUrl = clean(config.upstreamUrl);
  const upstreamToken = clean(config.upstreamToken);
  const paperclipCompanyId = clean(config.paperclipCompanyId);

  if (!upstreamUrl || !upstreamToken || !paperclipCompanyId) {
    return null;
  }

  return {
    upstreamUrl,
    upstreamToken,
    paperclipCompanyId,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBodyBytes: config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    fetchImpl: config.fetchImpl ?? fetch,
  };
}

function buildReportUrl(upstreamUrl: string, rangeDays: 7 | 28 | 90) {
  const url = new URL(upstreamUrl);
  url.searchParams.set("rangeDays", String(rangeDays));
  return url.toString();
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

function isAuthStatus(status: number) {
  return status === 401 || status === 403;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function reportCandidate(json: unknown): unknown {
  if (typeof json === "object" && json !== null && "data" in json) {
    return json.data;
  }
  return json;
}

async function readBoundedBody(response: Response, maxBodyBytes: number): Promise<BodyReadResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
      return { ok: false, error: { kind: "body_too_large", message: "Upstream response body exceeded 1 MiB" } };
    }
    return { ok: true, text };
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      totalBytes += read.value.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel();
        return { ok: false, error: { kind: "body_too_large", message: "Upstream response body exceeded 1 MiB" } };
      }
      text += decoder.decode(read.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } finally {
    reader.releaseLock();
  }
}

export function createSpacebogamFunnelUpstreamClient(
  config: SpacebogamFunnelUpstreamClientConfig,
): SpacebogamFunnelUpstreamClient {
  return {
    fetchReport(input) {
      return fetchSpacebogamFunnelReport({ ...input, config });
    },
  };
}

export async function fetchSpacebogamFunnelReport(input: {
  companyId: string;
  rangeDays: 7 | 28 | 90;
  config: SpacebogamFunnelUpstreamClientConfig;
}): Promise<SpacebogamFunnelFetchResult> {
  const resolved = resolveConfig(input.config);
  if (!resolved) {
    return { ok: false, error: { kind: "disabled", message: "Spacebogam funnel upstream is disabled" } };
  }
  if (input.companyId !== resolved.paperclipCompanyId) {
    return { ok: false, error: { kind: "not_configured", message: "Spacebogam funnel is not configured for this company" } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolved.timeoutMs);

  let response: Response;
  try {
    response = await resolved.fetchImpl(buildReportUrl(resolved.upstreamUrl, input.rangeDays), {
      method: "GET",
      headers: {
        authorization: `Bearer ${resolved.upstreamToken}`,
        "x-paperclip-company-id": resolved.paperclipCompanyId,
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      return { ok: false, error: { kind: "timeout", message: `Spacebogam funnel upstream timed out after ${resolved.timeoutMs}ms` } };
    }
    return { ok: false, error: { kind: "upstream_error", message: "Spacebogam funnel upstream request failed" } };
  } finally {
    clearTimeout(timeout);
  }

  if (isRedirectStatus(response.status)) {
    return { ok: false, error: { kind: "redirect", status: response.status, message: "Spacebogam funnel upstream redirect was rejected" } };
  }

  const body = await readBoundedBody(response, resolved.maxBodyBytes);
  if (!body.ok) return { ok: false, error: body.error };

  if (!response.ok) {
    if (isAuthStatus(response.status)) {
      return { ok: false, error: { kind: "auth_failed", status: response.status, message: "Spacebogam funnel upstream authentication failed" } };
    }
    return { ok: false, error: { kind: "upstream_error", status: response.status, message: "Spacebogam funnel upstream returned an error" } };
  }

  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return { ok: false, error: { kind: "invalid_json", message: "Spacebogam funnel upstream returned malformed JSON" } };
  }

  const parsed = spacebogamFunnelReportSchema.safeParse(reportCandidate(json));
  if (!parsed.success) {
    return { ok: false, error: { kind: "invalid_schema", message: "Spacebogam funnel upstream returned an invalid report schema" } };
  }

  return { ok: true, report: parsed.data };
}
