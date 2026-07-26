import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";

export const spacebogamCompanyId = "company-spacebogam";
export const otherCompanyId = "company-other";
export const secretToken = "do-not-leak-token";
export const upstreamUrl = "https://intm.example.test/api/paperclip/spacebogam-funnel";

export function boardActor(companyId = spacebogamCompanyId): Express.Request["actor"] {
  return {
    type: "board",
    userId: "user-1",
    source: "session",
    companyIds: [companyId],
    memberships: [{ companyId, membershipRole: "operator", status: "active" }],
    isInstanceAdmin: false,
  };
}

export function agentActor(companyId = spacebogamCompanyId): Express.Request["actor"] {
  return {
    type: "agent",
    agentId: "agent-1",
    companyId,
    source: "agent_key",
  };
}

export function validSpacebogamReport(rangeDays: 7 | 28 | 90 = 28): SpacebogamFunnelReport {
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
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      visits: index + 1,
      submittedLeads: index % 3 === 0 ? 1 : 0,
      visitToLeadRate: index % 3 === 0 ? 0.1 : null,
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

function stage(
  key: SpacebogamFunnelReport["stages"][number]["key"],
  label: string,
  count: number,
  previousCount: number | null,
): SpacebogamFunnelReport["stages"][number] {
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
