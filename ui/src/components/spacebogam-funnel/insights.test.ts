import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";
import { describe, expect, it } from "vitest";
import { buildCampaignVerdict, buildFunnelDiagnosis } from "./insights";

function report(overrides: Partial<SpacebogamFunnelReport> = {}): SpacebogamFunnelReport {
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays: 28,
    generatedAt: "2026-07-26T02:50:00.000Z",
    dataThrough: "2026-07-26T02:40:00.000Z",
    collectionStartedAt: "2026-07-25T02:38:00.000Z",
    counts: {
      visits: 105,
      engagedVisits: 22,
      consultationClicks: 1,
      formStarts: 0,
      submittedLeads: 0,
    },
    stages: [
      { key: "visit", label: "방문", count: 105, previousCount: null, conversionFromPrevious: null, dropOffCount: null, dropOffRate: null },
      { key: "engaged", label: "10초 이상 참여", count: 22, previousCount: 105, conversionFromPrevious: 22 / 105, dropOffCount: 83, dropOffRate: 83 / 105 },
      { key: "consultation", label: "상담 CTA 클릭", count: 1, previousCount: 22, conversionFromPrevious: 1 / 22, dropOffCount: 21, dropOffRate: 21 / 22 },
      { key: "form_start", label: "상담 작성 시작", count: 0, previousCount: 1, conversionFromPrevious: 0, dropOffCount: 1, dropOffRate: 1 },
      { key: "lead", label: "상담 제출 완료", count: 0, previousCount: 0, conversionFromPrevious: null, dropOffCount: 0, dropOffRate: null },
    ],
    daily: Array.from({ length: 28 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      visits: index === 27 ? 105 : 0,
      submittedLeads: 0,
      visitToLeadRate: index === 27 ? 0 : null,
    })),
    campaigns: [
      { source: "meta", medium: "paid_social", campaign: "ai_ad_test", visits: 48, submittedLeads: 0, visitToLeadRate: 0, sampleStatus: "usable" },
      { source: "meta", medium: "paid_social", campaign: "home_landing", visits: 21, submittedLeads: 0, visitToLeadRate: 0, sampleStatus: "usable" },
    ],
    quality: {
      status: "ready",
      sampleSessions: 105,
      minimumReadySessions: 50,
      newestEventAt: "2026-07-26T02:40:00.000Z",
      freshnessHours: 0.2,
      utmTaggedVisitRate: 0.914,
      missingDataDays: [],
      isMonotonic: true,
      warnings: [],
    },
    bottleneck: {
      fromStage: "방문",
      toStage: "10초 이상 참여",
      lostSessions: 83,
      lossRate: 83 / 105,
    },
    recommendations: [],
    legacyBaseline: null,
    ...overrides,
  };
}

describe("buildFunnelDiagnosis", () => {
  it("turns the current first-ten-seconds bottleneck into a diagnosis and measurable experiment", () => {
    const diagnosis = buildFunnelDiagnosis(report());

    expect(diagnosis).toMatchObject({
      stageKey: "engaged",
      priority: "critical",
      confidence: "confirmed",
      transition: "방문 → 10초 이상 참여",
      lostSessions: 83,
      experiment: {
        title: "첫 화면 메시지 일치 실험",
        metric: "10초 이상 참여율",
      },
    });
    expect(diagnosis?.headline).toContain("첫 10초");
    expect(diagnosis?.distinction).toHaveLength(3);
    expect(diagnosis?.instrumentation).toEqual(["UTM별 10초 참여", "첫 화면 CTA 노출", "모바일 LCP"]);
    expect(diagnosis?.targetRate).toBeCloseTo((22 / 105) * 1.2);
    expect(diagnosis?.experiment.decisionRule).toContain("50세션");
  });

  it("does not invent a diagnosis while data quality is not ready", () => {
    const current = report();
    expect(buildFunnelDiagnosis(report({
      quality: { ...current.quality, status: "collecting" },
      bottleneck: null,
    }))).toBeNull();
  });
});

describe("buildCampaignVerdict", () => {
  it("prevents budget reallocation when usable campaigns have no inquiries", () => {
    expect(buildCampaignVerdict(report())).toEqual({
      headline: "지금은 어떤 캠페인도 문의를 만들지 못했습니다.",
      summary: "방문량만 보고 예산을 이동하면 안 됩니다. 먼저 공통 랜딩 병목을 줄인 뒤 캠페인별 문의율을 다시 비교하세요.",
      confidence: "confirmed",
      leadingCampaign: null,
    });
  });

  it("names the highest converting usable campaign as directional evidence", () => {
    const current = report();
    const verdict = buildCampaignVerdict(report({
      campaigns: [
        { ...current.campaigns[0], submittedLeads: 2, visitToLeadRate: 2 / 48 },
        { ...current.campaigns[1], submittedLeads: 3, visitToLeadRate: 3 / 21 },
      ],
    }));

    expect(verdict.leadingCampaign).toBe("home_landing");
    expect(verdict.confidence).toBe("directional");
  });
});
