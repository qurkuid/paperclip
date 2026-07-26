import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("./client", () => ({
  api: mockApi,
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;

    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

import { ApiError } from "./client";
import {
  fetchSpacebogamFunnel,
  spacebogamFunnelQueryKey,
  type SpacebogamFunnelApiErrorCode,
} from "./spacebogam-funnel";

function sampleReport(rangeDays: SpacebogamFunnelReport["rangeDays"]): SpacebogamFunnelReport {
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays,
    generatedAt: "2026-07-25T12:00:00.000+09:00",
    dataThrough: "2026-07-25T11:30:00.000+09:00",
    collectionStartedAt: "2026-07-01T00:00:00.000+09:00",
    counts: {
      visits: 12,
      engagedVisits: 8,
      consultationClicks: 4,
      formStarts: 2,
      submittedLeads: 1,
    },
    stages: [],
    daily: Array.from({ length: rangeDays }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      visits: index,
      submittedLeads: 0,
      visitToLeadRate: null,
    })),
    campaigns: [],
    quality: {
      status: "collecting",
      sampleSessions: 12,
      minimumReadySessions: 50,
      newestEventAt: "2026-07-25T11:30:00.000+09:00",
      freshnessHours: 0.5,
      utmTaggedVisitRate: null,
      missingDataDays: [],
      isMonotonic: true,
      warnings: [],
    },
    bottleneck: null,
    recommendations: [],
    legacyBaseline: null,
  };
}

describe("fetchSpacebogamFunnel", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
  });

  it("exports the typed company and range scoped query key factory", () => {
    expect(spacebogamFunnelQueryKey("company-1", 28)).toEqual([
      "spacebogam-funnel",
      "company-1",
      28,
    ]);
  });

  it.each([7, 28, 90] satisfies SpacebogamFunnelReport["rangeDays"][])(
    "fetches and validates a %s day company-scoped report",
    async (rangeDays) => {
      const report = sampleReport(rangeDays);
      mockApi.get.mockResolvedValueOnce(report);

      await expect(fetchSpacebogamFunnel("company-1", rangeDays)).resolves.toEqual(report);
      expect(mockApi.get).toHaveBeenCalledWith(
        `/companies/company-1/analytics/spacebogam-funnel?rangeDays=${rangeDays}`,
      );
    },
  );

  it("rejects responses that fail the shared direct validator", async () => {
    mockApi.get.mockResolvedValueOnce({ ...sampleReport(7), daily: [] });

    await expect(fetchSpacebogamFunnel("company-1", 7)).rejects.toMatchObject({
      code: "invalid_response",
      status: 502,
    });
  });

  it.each([
    [400, "invalid_range_days", "invalid_range_days"],
    [404, "spacebogam_funnel_not_configured", "not_configured"],
    [502, "spacebogam_funnel_invalid_response", "invalid_response"],
    [502, "spacebogam_funnel_upstream_error", "upstream_error"],
    [503, "spacebogam_funnel_disabled", "disabled"],
    [504, "spacebogam_funnel_timeout", "timeout"],
  ] satisfies Array<[number, string, SpacebogamFunnelApiErrorCode]>)(
    "maps %s %s to %s",
    async (status, serverCode, clientCode) => {
      mockApi.get.mockRejectedValueOnce(new ApiError(serverCode, status, { error: serverCode }));

      await expect(fetchSpacebogamFunnel("company-1", 28)).rejects.toMatchObject({
        code: clientCode,
        status,
        message: serverCode,
      });
    },
  );
});
