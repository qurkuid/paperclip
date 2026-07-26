import { describe, expect, it, vi } from "vitest";
import {
  createSpacebogamFunnelUpstreamClient,
  fetchSpacebogamFunnelReport,
  type SpacebogamFunnelFetchResult,
  type SpacebogamFunnelUpstreamError,
  type SpacebogamFunnelUpstreamClientConfig,
  type SpacebogamFunnelUpstreamFetch,
} from "../services/spacebogam-funnel-upstream.js";

const token = "secret-dashboard-token";
const companyId = "company-paperclip";
const upstreamUrl = "https://intm.example.test/api/paperclip/spacebogam-funnel";

function validReport(rangeDays = 7) {
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays,
    generatedAt: "2026-07-25T12:00:00.000+09:00",
    dataThrough: "2026-07-25T11:30:00.000+09:00",
    collectionStartedAt: "2026-07-01T00:00:00.000+09:00",
    counts: {
      visits: 120,
      engagedVisits: 90,
      consultationClicks: 36,
      formStarts: 20,
      submittedLeads: 8,
    },
    stages: [
      stage("visit", "방문", 120, null),
      stage("engaged", "10초 이상 참여", 90, 120),
      stage("consultation", "상담 CTA 클릭", 36, 90),
      stage("form_start", "상담 작성 시작", 20, 36),
      stage("lead", "상담 제출 완료", 8, 20),
    ],
    daily: Array.from({ length: rangeDays }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 19 + index)).toISOString().slice(0, 10),
      visits: index + 1,
      submittedLeads: 0,
      visitToLeadRate: null,
    })),
    campaigns: [{
      source: "naver",
      medium: "cpc",
      campaign: "apartment",
      visits: 64,
      submittedLeads: 6,
      visitToLeadRate: 0.0938,
      sampleStatus: "usable",
    }],
    quality: {
      status: "ready",
      sampleSessions: 120,
      minimumReadySessions: 50,
      newestEventAt: "2026-07-25T11:30:00.000+09:00",
      freshnessHours: 0.5,
      utmTaggedVisitRate: 0.68,
      missingDataDays: [],
      isMonotonic: true,
      warnings: [],
    },
    bottleneck: { fromStage: "engaged", toStage: "consultation", lostSessions: 54, lossRate: 0.6 },
    recommendations: [{
      code: "improve_cta",
      title: "상담 CTA 실험",
      reason: "참여 후 상담 CTA 클릭 손실이 가장 큽니다.",
      action: "포트폴리오 근처 CTA 위치와 문구를 한 가지씩 실험합니다.",
      confidence: "directional",
    }],
    legacyBaseline: { source: "ga4" },
  };
}

function stage(key: string, label: string, count: number, previousCount: number | null) {
  return {
    key,
    label,
    count,
    previousCount,
    conversionFromPrevious: previousCount === null ? null : count / previousCount,
    dropOffCount: previousCount === null ? null : previousCount - count,
    dropOffRate: previousCount === null ? null : (previousCount - count) / previousCount,
  };
}

function config(fetchImpl: SpacebogamFunnelUpstreamFetch): SpacebogamFunnelUpstreamClientConfig {
  return {
    upstreamUrl,
    upstreamToken: token,
    paperclipCompanyId: companyId,
    timeoutMs: 50,
    fetchImpl,
  };
}

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function expectError(result: SpacebogamFunnelFetchResult, kind: SpacebogamFunnelUpstreamError["kind"]) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected error result");
  expect(result.error.kind).toBe(kind);
  expect(JSON.stringify(result)).not.toContain(token);
}

describe("spacebogam funnel upstream client", () => {
  it("parses a strict schema v1 response and sends only the fixed env URL, token, and company header", async () => {
    const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>(async () => jsonResponse(validReport(7)));

    const client = createSpacebogamFunnelUpstreamClient(config(fetchImpl));
    const result = await client.fetchReport({ companyId, rangeDays: 7 });

    expect(result).toEqual({ ok: true, report: validReport(7) });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe(`${upstreamUrl}?rangeDays=7`);
    expect(call?.[1]?.method).toBe("GET");
    expect(call?.[1]?.redirect).toBe("manual");
    expect(call?.[1]?.headers).toEqual({
      authorization: `Bearer ${token}`,
      "x-paperclip-company-id": companyId,
    });
  });

  it("parses the authenticated INTM data envelope", async () => {
    const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>(async () => jsonResponse({
      data: validReport(28),
    }));

    const result = await fetchSpacebogamFunnelReport({
      companyId,
      rangeDays: 28,
      config: config(fetchImpl),
    });

    expect(result).toEqual({ ok: true, report: validReport(28) });
  });

  it("uses disabled and hidden-not-configured errors before calling upstream", async () => {
    const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>(async () => jsonResponse(validReport()));

    expectError(await fetchSpacebogamFunnelReport({
      companyId,
      rangeDays: 7,
      config: { upstreamUrl, upstreamToken: "", paperclipCompanyId: companyId, fetchImpl },
    }), "disabled");
    expectError(await fetchSpacebogamFunnelReport({
      companyId: "other-company",
      rangeDays: 7,
      config: config(fetchImpl),
    }), "not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("aborts with a timeout error", async () => {
    const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));

    const result = await fetchSpacebogamFunnelReport({
      companyId,
      rangeDays: 7,
      config: { ...config(fetchImpl), timeoutMs: 1 },
    });

    expectError(result, "timeout");
  });

  it("does not follow redirects", async () => {
    const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>(async () => new Response("redirect", {
      status: 302,
      headers: { location: "https://evil.example.test/funnel" },
    }));

    expectError(await fetchSpacebogamFunnelReport({ companyId, rangeDays: 7, config: config(fetchImpl) }), "redirect");
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("rejects bodies larger than 1 MiB while streaming", async () => {
    const chunk = new Uint8Array(1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>(async () => new Response(stream));

    const result = await fetchSpacebogamFunnelReport({
      companyId,
      rangeDays: 7,
      config: { ...config(fetchImpl), maxBodyBytes: 1024 * 1024 },
    });

    expectError(result, "body_too_large");
  });

  it("returns sanitized errors for malformed JSON, schema, auth, and upstream failures", async () => {
    const cases: Array<[Response, SpacebogamFunnelUpstreamError["kind"]]> = [
      [new Response("{ nope", { status: 200 }), "invalid_json"],
      [jsonResponse({ ...validReport(7), schemaVersion: 2 }), "invalid_schema"],
      [jsonResponse({ message: token }, { status: 401 }), "auth_failed"],
      [jsonResponse({ message: token }, { status: 500 }), "upstream_error"],
    ];

    for (const [response, kind] of cases) {
      const fetchImpl = vi.fn<SpacebogamFunnelUpstreamFetch>(async () => response.clone());
      expectError(await fetchSpacebogamFunnelReport({ companyId, rangeDays: 7, config: config(fetchImpl) }), kind);
    }
  });
});
