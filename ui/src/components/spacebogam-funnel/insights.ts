import type {
  SpacebogamFunnelReport,
  SpacebogamFunnelStageKey,
} from "@paperclipai/shared/validators/spacebogam-funnel";

export type FunnelInsightConfidence = "confirmed" | "directional" | "needs_measurement";
export type FunnelInsightPriority = "critical" | "watch" | "healthy";

export interface FunnelDiagnosis {
  stageKey: SpacebogamFunnelStageKey;
  headline: string;
  summary: string;
  priority: FunnelInsightPriority;
  confidence: FunnelInsightConfidence;
  transition: string;
  lostSessions: number;
  lossRate: number;
  currentRate: number | null;
  targetRate: number | null;
  possibleCauses: string[];
  distinction: string[];
  experiment: {
    title: string;
    change: string;
    metric: string;
    decisionRule: string;
  };
  instrumentation: string[];
}

export interface CampaignVerdict {
  headline: string;
  summary: string;
  confidence: FunnelInsightConfidence;
  leadingCampaign: string | null;
}

interface StagePlaybook {
  headline: string;
  summary: string;
  possibleCauses: string[];
  distinction: string[];
  experimentTitle: string;
  experimentChange: string;
  metric: string;
  instrumentation: string[];
}

const PLAYBOOKS: Record<SpacebogamFunnelStageKey, StagePlaybook> = {
  visit: {
    headline: "유입량보다 측정 범위를 먼저 확인해야 합니다.",
    summary: "첫 단계는 비교 대상이 없어 병목으로 판정하지 않습니다.",
    possibleCauses: ["수집 기간이 짧음", "UTM 누락", "캠페인 집행량 부족"],
    distinction: ["수집 시작일과 캠페인 집행일을 맞춰 봅니다.", "UTM 태깅률과 누락 캠페인을 먼저 확인합니다."],
    experimentTitle: "측정 기반 정리",
    experimentChange: "모든 유입 링크의 UTM 규칙과 수집 기간을 통일합니다.",
    metric: "UTM 태깅률",
    instrumentation: ["캠페인별 방문", "UTM 누락 방문"],
  },
  engaged: {
    headline: "유입은 오지만 첫 10초 안에 설득하지 못하고 있습니다.",
    summary: "광고의 약속과 첫 화면의 메시지, 속도, 신뢰 근거 중 하나가 방문자의 기대를 놓치고 있습니다.",
    possibleCauses: ["광고 문구와 랜딩 첫 문장의 불일치", "첫 화면에서 시공 강점과 신뢰 근거가 늦게 보임", "모바일 로딩 또는 가독성 문제"],
    distinction: [
      "캠페인별 10초 참여율이 모두 낮으면 랜딩 첫 화면 문제일 가능성이 큽니다.",
      "특정 광고나 소스만 낮으면 타깃 또는 광고 메시지 불일치에 가깝습니다.",
      "로딩이 느린 기기에서만 낮으면 성능 문제로 분리할 수 있습니다.",
    ],
    experimentTitle: "첫 화면 메시지 일치 실험",
    experimentChange: "광고 헤드라인과 랜딩 첫 문장을 통일하고, 완공 사례 한 장과 상담 행동을 첫 화면에 함께 배치합니다.",
    metric: "10초 이상 참여율",
    instrumentation: ["UTM별 10초 참여", "첫 화면 CTA 노출", "모바일 LCP"],
  },
  consultation: {
    headline: "관심은 만들었지만 상담 행동으로 연결하지 못하고 있습니다.",
    summary: "CTA가 잘 보이지 않거나, 상담을 시작할 만큼 제안과 신뢰가 충분하지 않습니다.",
    possibleCauses: ["CTA 위치가 콘텐츠 흐름에서 멀리 떨어짐", "상담으로 얻는 결과가 불명확함", "가격과 과정에 대한 불안이 해소되지 않음"],
    distinction: [
      "CTA 노출은 충분한데 클릭이 낮으면 문구, 제안, 신뢰 문제입니다.",
      "CTA 노출 자체가 낮으면 위치와 반복 배치 문제입니다.",
      "포트폴리오를 본 세션만 클릭이 높으면 사례 인접 배치가 우선입니다.",
    ],
    experimentTitle: "상담 CTA 위치와 약속 실험",
    experimentChange: "완공 사례 직후에 상담 결과를 구체적으로 설명한 CTA를 배치하고 모바일 하단에도 같은 행동을 유지합니다.",
    metric: "참여 대비 상담 CTA 클릭률",
    instrumentation: ["CTA 노출", "CTA 위치", "포트폴리오 열람 후 CTA 클릭"],
  },
  form_start: {
    headline: "상담 의도는 있지만 입력 화면 진입에서 끊기고 있습니다.",
    summary: "CTA 이후 이동, 모달, 로딩 또는 첫 입력 요구가 상담 시작을 막고 있습니다.",
    possibleCauses: ["CTA 링크 또는 모달 동작 오류", "첫 화면의 입력 요구가 과도함", "개인정보와 상담 과정 설명 부족"],
    distinction: [
      "CTA 클릭 후 폼 노출이 없으면 기술적 이동 문제입니다.",
      "폼 노출은 있지만 입력 시작이 없으면 첫 질문과 신뢰 문제입니다.",
      "특정 기기에서만 낮으면 모바일 폼 동작을 우선 점검합니다.",
    ],
    experimentTitle: "상담 시작 마찰 제거",
    experimentChange: "첫 단계는 연락 방법과 공간 유형만 묻고, 나머지 질문은 다음 단계로 넘깁니다.",
    metric: "CTA 클릭 대비 상담 작성 시작률",
    instrumentation: ["폼 노출", "첫 입력", "기기별 폼 진입"],
  },
  lead: {
    headline: "상담을 쓰기 시작하지만 제출까지 완료하지 못하고 있습니다.",
    summary: "질문 수, 필수 항목, 오류 처리 또는 개인정보 불안이 마지막 전환을 막고 있습니다.",
    possibleCauses: ["질문 수와 필수 항목이 많음", "오류 메시지 또는 입력 형식이 불명확함", "제출 후 절차와 응답 시간이 보이지 않음"],
    distinction: [
      "특정 질문 직후 이탈이 몰리면 해당 항목을 줄이거나 선택형으로 바꿉니다.",
      "오류 발생 세션의 제출률이 낮으면 입력 검증과 복구가 우선입니다.",
      "마지막 단계 이탈이 높으면 제출 후 안내와 개인정보 신뢰를 보강합니다.",
    ],
    experimentTitle: "문의 제출 단계 축소",
    experimentChange: "필수 질문을 최소화하고 예상 응답 시간과 상담 절차를 제출 버튼 바로 위에 표시합니다.",
    metric: "상담 작성 시작 대비 제출 완료율",
    instrumentation: ["질문별 이탈", "필드 오류", "제출 버튼 노출"],
  },
};

function diagnosisPriority(lossRate: number): FunnelInsightPriority {
  if (lossRate >= 0.6) return "critical";
  if (lossRate >= 0.35) return "watch";
  return "healthy";
}

function targetRate(currentRate: number | null): number | null {
  if (currentRate === null) return null;
  return Math.min(1, currentRate * 1.2);
}

function findBottleneckStage(report: SpacebogamFunnelReport) {
  if (!report.bottleneck) return null;
  return report.stages.find((stage) => stage.label === report.bottleneck?.toStage)
    ?? report.stages
      .filter((stage) => stage.dropOffCount !== null && stage.dropOffCount >= 0)
      .sort((left, right) => (right.dropOffCount ?? 0) - (left.dropOffCount ?? 0))[0]
    ?? null;
}

export function buildFunnelDiagnosis(report: SpacebogamFunnelReport): FunnelDiagnosis | null {
  if (report.quality.status !== "ready" || !report.bottleneck) return null;
  const stage = findBottleneckStage(report);
  if (!stage) return null;
  const playbook = PLAYBOOKS[stage.key];
  const previousLabel = report.stages[report.stages.findIndex((candidate) => candidate.key === stage.key) - 1]?.label ?? "이전 단계";
  const currentRate = stage.conversionFromPrevious;
  const directionSample = report.quality.minimumReadySessions;

  return {
    stageKey: stage.key,
    headline: playbook.headline,
    summary: playbook.summary,
    priority: diagnosisPriority(report.bottleneck.lossRate),
    confidence: "confirmed",
    transition: `${previousLabel} → ${stage.label}`,
    lostSessions: report.bottleneck.lostSessions,
    lossRate: report.bottleneck.lossRate,
    currentRate,
    targetRate: targetRate(currentRate),
    possibleCauses: playbook.possibleCauses,
    distinction: playbook.distinction,
    experiment: {
      title: playbook.experimentTitle,
      change: playbook.experimentChange,
      metric: playbook.metric,
      decisionRule: `현재 전환율보다 20% 이상 상대 개선되고 각 안에서 최소 ${directionSample.toLocaleString("ko-KR")}세션이 모이면 확대합니다.`,
    },
    instrumentation: playbook.instrumentation,
  };
}

export function buildCampaignVerdict(report: SpacebogamFunnelReport): CampaignVerdict {
  const usable = report.campaigns
    .filter((campaign) => campaign.sampleStatus === "usable")
    .sort((left, right) => right.visits - left.visits);
  const converted = usable.filter((campaign) => campaign.submittedLeads > 0);
  const leading = [...converted].sort((left, right) => (right.visitToLeadRate ?? 0) - (left.visitToLeadRate ?? 0))[0] ?? null;

  if (usable.length === 0) {
    return {
      headline: "캠페인별 우열을 판단할 표본이 아직 없습니다.",
      summary: "방문량이 아니라 충분한 표본과 문의 전환이 함께 쌓인 뒤 예산을 비교하세요.",
      confidence: "needs_measurement",
      leadingCampaign: null,
    };
  }

  if (converted.length === 0) {
    return {
      headline: "지금은 어떤 캠페인도 문의를 만들지 못했습니다.",
      summary: "방문량만 보고 예산을 이동하면 안 됩니다. 먼저 공통 랜딩 병목을 줄인 뒤 캠페인별 문의율을 다시 비교하세요.",
      confidence: "confirmed",
      leadingCampaign: null,
    };
  }

  return {
    headline: `${leading?.campaign || "캠페인 없음"}이 현재 가장 높은 문의율을 보입니다.`,
    summary: "표본 상태가 사용 가능한 캠페인끼리만 비교한 방향성 판단입니다. 다음 기간에도 같은 순위가 유지되는지 확인하세요.",
    confidence: "directional",
    leadingCampaign: leading?.campaign || null,
  };
}
