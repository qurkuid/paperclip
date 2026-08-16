import { describe, expect, it } from "vitest";
import type {
  SpacebogamFunnelRangeDays,
  SpacebogamFunnelReport,
} from "./validators/spacebogam-funnel.js";
import {
  inspectSpacebogamFunnelContract,
  SPACEBOGAM_FUNNEL_MONITOR_RANGES,
} from "./spacebogam-funnel-monitor.js";

const deploymentSha = "8a7b6c5d4e3f";

describe("Spacebogam funnel contract monitor", () => {
  it("passes valid 7, 28, and 90 day aggregate reports", () => {
    const result = inspectSpacebogamFunnelContract({
      deploymentSha,
      samples: SPACEBOGAM_FUNNEL_MONITOR_RANGES.map((rangeDays) => ({
        rangeDays,
        report: validReport(rangeDays),
      })),
    });

    expect(result).toEqual({ ok: true, violations: [] });
  });

  it("fails synthetic contract violations without copying source values", () => {
    const sevenDay = validReport(7);
    sevenDay.quality.isMonotonic = false;

    const twentyEightDay = validReport(28);
    const formStart = twentyEightDay.stages.find((stage) => stage.key === "form_start");
    if (!formStart || !twentyEightDay.quality.leadReconciliation) {
      throw new Error("invalid test fixture");
    }
    formStart.previousCount = 16;
    formStart.conversionFromPrevious = 0.5;
    formStart.dropOffCount = 8;
    formStart.dropOffRate = 0.5;
    twentyEightDay.quality.leadReconciliation.sourceLeads = 1;
    twentyEightDay.quality.leadReconciliation.missingInFunnel = 1;
    twentyEightDay.daily[0]!.visitToLeadRate = 0;

    const ninetyDay = validReport(90);
    ninetyDay.campaigns[0]!.visitToLeadRate = 0;
    ninetyDay.campaigns[0]!.campaign = "private-campaign-value";

    const result = inspectSpacebogamFunnelContract({
      deploymentSha,
      samples: [
        { rangeDays: 7, report: sevenDay },
        { rangeDays: 28, report: twentyEightDay },
        { rangeDays: 90, report: ninetyDay },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([
      { rangeDays: 7, field: "quality.isMonotonic", deploymentSha },
      {
        rangeDays: 28,
        field: "quality.leadReconciliation.testExclusionAlignment",
        deploymentSha,
      },
      {
        rangeDays: 28,
        field: "quality.leadReconciliation.missingInFunnel",
        deploymentSha,
      },
      { rangeDays: 28, field: "stages.form_start.previousCount", deploymentSha },
      { rangeDays: 28, field: "stages.form_start.conversionFromPrevious", deploymentSha },
      { rangeDays: 28, field: "stages.form_start.dropOffCount", deploymentSha },
      { rangeDays: 28, field: "stages.form_start.dropOffRate", deploymentSha },
      {
        rangeDays: 28,
        field: "daily.visitToLeadRate.whenSubmittedLeadsZero",
        deploymentSha,
      },
      {
        rangeDays: 90,
        field: "campaigns.visitToLeadRate.whenSubmittedLeadsZero",
        deploymentSha,
      },
    ]));
    expect(JSON.stringify(result)).not.toContain("private-campaign-value");
  });

  it("requires each supported range exactly once and rejects unsafe SHA values", () => {
    expect(inspectSpacebogamFunnelContract({
      deploymentSha,
      samples: [
        { rangeDays: 7, report: validReport(7) },
        { rangeDays: 7, report: validReport(7) },
      ],
    })).toEqual({
      ok: false,
      violations: [
        { rangeDays: 7, field: "report.duplicateRange", deploymentSha },
        { rangeDays: 28, field: "report.missingRange", deploymentSha },
        { rangeDays: 90, field: "report.missingRange", deploymentSha },
      ],
    });

    expect(() => inspectSpacebogamFunnelContract({
      deploymentSha: "token-that-must-not-be-logged",
      samples: [],
    })).toThrow("deploymentSha must be a 7-64 character hexadecimal git SHA");
  });
});

function validReport(rangeDays: SpacebogamFunnelRangeDays): SpacebogamFunnelReport {
  const visits = 120;
  const engaged = 90;
  const consultation = 36;
  const formStarts = 20;
  const leads = 8;

  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays,
    generatedAt: "2026-07-30T12:00:00.000Z",
    dataThrough: "2026-07-30T11:30:00.000Z",
    collectionStartedAt: "2026-07-25T02:38:23.332Z",
    counts: {
      visits,
      engagedVisits: engaged,
      consultationClicks: consultation,
      formStarts,
      submittedLeads: leads,
    },
    stages: [
      stage("visit", visits, null),
      stage("engaged", engaged, visits),
      stage("consultation", consultation, engaged),
      stage("form_start", formStarts, null),
      stage("lead", leads, formStarts),
    ],
    daily: Array.from({ length: rangeDays }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 1 + index)).toISOString().slice(0, 10),
      visits: index + 1,
      submittedLeads: 0,
      visitToLeadRate: null,
    })),
    campaigns: [{
      source: "meta",
      medium: "paid_social",
      campaign: "portfolio",
      visits: 40,
      submittedLeads: 0,
      visitToLeadRate: null,
      sampleStatus: "usable",
    }],
    quality: {
      status: "ready",
      sampleSessions: visits,
      minimumReadySessions: 50,
      newestEventAt: "2026-07-30T11:30:00.000Z",
      freshnessHours: 0.5,
      utmTaggedVisitRate: 0.75,
      missingDataDays: [],
      isMonotonic: true,
      leadReconciliation: {
        funnelLeads: leads,
        sourceLeads: leads,
        sourceTestExcluded: 1,
        missingInFunnel: 0,
        comparedFrom: "2026-07-25T02:38:23.332Z",
      },
      warnings: [],
    },
    bottleneck: {
      fromStage: "engaged",
      toStage: "consultation",
      lostSessions: engaged - consultation,
      lossRate: (engaged - consultation) / engaged,
    },
    recommendations: [],
    legacyBaseline: null,
  };
}

function stage(
  key: SpacebogamFunnelReport["stages"][number]["key"],
  count: number,
  previousCount: number | null,
): SpacebogamFunnelReport["stages"][number] {
  return {
    key,
    label: key,
    count,
    previousCount,
    conversionFromPrevious: previousCount === null ? null : count / previousCount,
    dropOffCount: previousCount === null ? null : previousCount - count,
    dropOffRate: previousCount === null ? null : (previousCount - count) / previousCount,
  };
}
