import { describe, expect, it } from "vitest";
import { spacebogamFunnelReportSchema } from "./spacebogam-funnel.js";

const completeReport = {
  schemaVersion: 1,
  timezone: "Asia/Seoul",
  rangeDays: 7,
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
    {
      key: "visit",
      label: "방문",
      count: 120,
      previousCount: null,
      conversionFromPrevious: null,
      dropOffCount: null,
      dropOffRate: null,
    },
    {
      key: "engaged",
      label: "10초 이상 참여",
      count: 90,
      previousCount: 120,
      conversionFromPrevious: 0.75,
      dropOffCount: 30,
      dropOffRate: 0.25,
    },
    {
      key: "consultation",
      label: "상담 CTA 클릭",
      count: 36,
      previousCount: 90,
      conversionFromPrevious: 0.4,
      dropOffCount: 54,
      dropOffRate: 0.6,
    },
    {
      key: "form_start",
      label: "상담 작성 시작",
      count: 20,
      previousCount: 36,
      conversionFromPrevious: 0.5556,
      dropOffCount: 16,
      dropOffRate: 0.4444,
    },
    {
      key: "lead",
      label: "상담 제출 완료",
      count: 8,
      previousCount: 20,
      conversionFromPrevious: 0.4,
      dropOffCount: 12,
      dropOffRate: 0.6,
    },
  ],
  daily: [
    { date: "2026-07-19", visits: 12, submittedLeads: 1, visitToLeadRate: 0.0833 },
    { date: "2026-07-20", visits: 14, submittedLeads: 1, visitToLeadRate: 0.0714 },
    { date: "2026-07-21", visits: 16, submittedLeads: 1, visitToLeadRate: 0.0625 },
    { date: "2026-07-22", visits: 18, submittedLeads: 1, visitToLeadRate: 0.0556 },
    { date: "2026-07-23", visits: 20, submittedLeads: 1, visitToLeadRate: 0.05 },
    { date: "2026-07-24", visits: 19, submittedLeads: 1, visitToLeadRate: 0.0526 },
    { date: "2026-07-25", visits: 21, submittedLeads: 2, visitToLeadRate: 0.0952 },
  ],
  campaigns: [
    {
      source: "naver",
      medium: "cpc",
      campaign: "apartment",
      visits: 64,
      submittedLeads: 6,
      visitToLeadRate: 0.0938,
      sampleStatus: "usable",
    },
    {
      source: "instagram",
      medium: "paid_social",
      campaign: "portfolio",
      visits: 18,
      submittedLeads: 1,
      visitToLeadRate: 0.0556,
      sampleStatus: "insufficient",
    },
  ],
  quality: {
    status: "ready",
    sampleSessions: 120,
    minimumReadySessions: 50,
    newestEventAt: "2026-07-25T11:30:00.000+09:00",
    freshnessHours: 0.5,
    utmTaggedVisitRate: 0.68,
    missingDataDays: ["2026-07-20"],
    isMonotonic: true,
    warnings: ["UTM 부족"],
  },
  bottleneck: {
    fromStage: "engaged",
    toStage: "consultation",
    lostSessions: 54,
    lossRate: 0.6,
  },
  recommendations: [
    {
      code: "improve_cta",
      title: "상담 CTA 실험",
      reason: "참여 후 상담 CTA 클릭 손실이 가장 큽니다.",
      action: "포트폴리오 근처 CTA 위치와 문구를 한 가지씩 실험합니다.",
      confidence: "directional",
    },
    {
      code: "keep_measuring",
      title: "계측 유지",
      reason: "표본과 최신성이 판단 가능한 수준입니다.",
      action: "동일 정의로 다음 7일을 비교합니다.",
      confidence: "measurement_only",
    },
  ],
  legacyBaseline: {
    source: "ga4",
    note: "reference only",
  },
};

const readyNaverSearchAds = {
  status: "ready",
  since: "2026-07-19",
  until: "2026-07-25",
  generatedAt: "2026-07-25T12:00:00.000+09:00",
  campaignCount: 1,
  activeCampaignCount: 1,
  campaignsWithSpend: 1,
  totals: {
    impressions: 1_000,
    clicks: 40,
    spendKrw: 80_000,
    conversions: 4,
    ctr: 0.04,
    cpcKrw: 2_000,
    conversionRate: 0.1,
    costPerConversionKrw: 20_000,
  },
  campaigns: [{
    name: "아파트 인테리어",
    type: "WEB_SITE",
    status: "ELIGIBLE",
    userLocked: false,
    dailyBudgetKrw: 30_000,
    impressions: 1_000,
    clicks: 40,
    spendKrw: 80_000,
    conversions: 4,
    ctr: 0.04,
    cpcKrw: 2_000,
    conversionRate: 0.1,
    costPerConversionKrw: 20_000,
  }],
} as const;

const buildDailyRows = (length: number) => Array.from({ length }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 1 + index));

  return {
    date: date.toISOString().slice(0, 10),
    visits: index,
    submittedLeads: 0,
    visitToLeadRate: null,
  };
});

describe("spacebogam funnel report validator", () => {
  it("parses a complete schema v1 report", () => {
    expect(spacebogamFunnelReportSchema.parse(completeReport)).toEqual(completeReport);
  });

  it("accepts only schema version 1", () => {
    expect(spacebogamFunnelReportSchema.safeParse({ ...completeReport, schemaVersion: 1 }).success).toBe(true);
    expect(spacebogamFunnelReportSchema.safeParse({ ...completeReport, schemaVersion: 2 }).success).toBe(false);
  });

  it("accepts ready and error Naver snapshots while rejecting impossible negative metrics", () => {
    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      naverSearchAds: readyNaverSearchAds,
    }).success).toBe(true);
    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      naverSearchAds: {
        status: "error",
        since: "2026-07-19",
        until: "2026-07-25",
        generatedAt: "2026-07-25T12:00:00.000+09:00",
        message: "네이버 검색광고 데이터를 불러오지 못했습니다.",
      },
    }).success).toBe(true);
    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      naverSearchAds: {
        ...readyNaverSearchAds,
        totals: { ...readyNaverSearchAds.totals, spendKrw: -1 },
      },
    }).success).toBe(false);
  });

  it("accepts the supported status variants and rejects unknown status", () => {
    for (const status of ["empty", "collecting", "ready", "stale", "invalid_sequence"]) {
      expect(spacebogamFunnelReportSchema.safeParse({
        ...completeReport,
        quality: { ...completeReport.quality, status },
      }).success).toBe(true);
    }

    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      quality: { ...completeReport.quality, status: "healthy" },
    }).success).toBe(false);
  });

  it("requires daily rows to exactly match the supported 7, 28, and 90 day ranges", () => {
    for (const rangeDays of [7, 28, 90]) {
      const daily = buildDailyRows(rangeDays);

      expect(spacebogamFunnelReportSchema.safeParse({
        ...completeReport,
        rangeDays,
        daily,
      }).success).toBe(true);

      expect(spacebogamFunnelReportSchema.safeParse({
        ...completeReport,
        rangeDays,
        daily: daily.slice(1),
      }).success).toBe(false);
    }

    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      rangeDays: 14,
    }).success).toBe(false);
  });

  it("rejects percent-unit rate values in schema v1 reports", () => {
    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      stages: completeReport.stages.map((stage) => (
        stage.key === "engaged" ? { ...stage, conversionFromPrevious: 75 } : stage
      )),
    }).success).toBe(false);

    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      daily: completeReport.daily.map((day, index) => (
        index === 0 ? { ...day, visitToLeadRate: 8.33 } : day
      )),
    }).success).toBe(false);

    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      quality: { ...completeReport.quality, utmTaggedVisitRate: 68 },
    }).success).toBe(false);

    expect(spacebogamFunnelReportSchema.safeParse({
      ...completeReport,
      bottleneck: { ...completeReport.bottleneck, lossRate: 60 },
    }).success).toBe(false);
  });

  it("accepts truthful invalid-sequence stage rates without recommendations", () => {
    const report = spacebogamFunnelReportSchema.parse({
      ...completeReport,
      counts: { ...completeReport.counts, visits: 50, engagedVisits: 60 },
      stages: completeReport.stages.map((stage) => {
        if (stage.key === "visit") return { ...stage, count: 50 };
        if (stage.key === "engaged") {
          return {
            ...stage,
            count: 60,
            previousCount: 50,
            conversionFromPrevious: 1.2,
            dropOffCount: -10,
            dropOffRate: -0.2,
          };
        }
        return stage;
      }),
      quality: {
        ...completeReport.quality,
        status: "invalid_sequence",
        sampleSessions: 50,
        isMonotonic: false,
        warnings: ["spacebogam_funnel_invalid_sequence"],
      },
      bottleneck: null,
      recommendations: [],
    });

    expect(report.quality.status).toBe("invalid_sequence");
    expect(report.quality.isMonotonic).toBe(false);
    expect(report.stages[1]?.conversionFromPrevious).toBe(1.2);
    expect(report.stages[1]?.dropOffCount).toBe(-10);
    expect(report.stages[1]?.dropOffRate).toBe(-0.2);
    expect(report.recommendations).toEqual([]);
  });
});
