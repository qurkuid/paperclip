import type { ExperimentDetail, VariantMetric } from "./types.js";

export type Insight = {
  tone: "critical" | "warning" | "positive" | "neutral";
  label: string;
  title: string;
  detail: string;
  action: string;
};

function formatRate(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function bestChallenger(metrics: VariantMetric[]) {
  return metrics
    .filter((metric) => !metric.isControl && metric.wonRate !== null)
    .sort((left, right) => (right.wonRate ?? 0) - (left.wonRate ?? 0))[0];
}

export function deriveInsights(detail: ExperimentDetail): Insight[] {
  const { experiment, variantMetrics } = detail;
  const insights: Insight[] = [];
  const sampleGap = variantMetrics.find(
    (metric) => metric.sample < experiment.minimumSamplePerVariant,
  );
  const totalSample = variantMetrics.reduce(
    (sum, metric) => sum + metric.sample,
    0,
  );
  const totalPending = variantMetrics.reduce(
    (sum, metric) => sum + metric.pending,
    0,
  );

  if (detail.variants.length < 2) {
    insights.push({
      tone: "critical",
      label: "설계 필요",
      title: "비교안이 없어 실험을 시작할 수 없습니다",
      detail: "기준안과 비교안 두 개를 먼저 확정해야 결과 차이를 해석할 수 있습니다.",
      action: "아래 실험 설계에서 기준안과 비교안을 저장하세요.",
    });
  } else if (sampleGap !== undefined) {
    insights.push({
      tone: "warning",
      label: "표본 수집",
      title: `${sampleGap.key} 표본이 ${sampleGap.sample}/${experiment.minimumSamplePerVariant}입니다`,
      detail: "현재 전환율 차이는 방향성만 보여주며 의사결정 근거로는 부족합니다.",
      action: "채널과 기간을 유지하고 변형별 최소 표본까지 수집하세요.",
    });
  } else {
    const challenger = bestChallenger(variantMetrics);
    const lift = challenger?.relativeLiftFromControl ?? null;
    insights.push({
      tone: lift !== null && lift > 0 ? "positive" : "critical",
      label: "핵심 결과",
      title: challenger === undefined
        ? "해석 가능한 비교안 결과가 없습니다"
        : `${challenger.key} 전환율 ${formatRate(challenger.wonRate)}`,
      detail: lift === null
        ? "기준안 대비 상대 개선율을 아직 계산할 수 없습니다."
        : `기준안 대비 ${lift >= 0 ? "+" : ""}${(lift * 100).toFixed(1)}%의 상대 변화입니다.`,
      action: lift !== null && lift > 0
        ? "담당 에이전트에게 후속 전략을 요청하고 승인 후 다음 실험으로 확장하세요."
        : "오퍼, 신뢰요소, 상담 CTA 중 한 요소만 바꾼 후속 실험을 설계하세요.",
    });
  }

  if (totalSample > 0 && totalPending / totalSample >= 0.4) {
    insights.push({
      tone: "critical",
      label: "데이터 병목",
      title: `전체 표본의 ${Math.round((totalPending / totalSample) * 100)}%가 결과 미확정입니다`,
      detail: "상담 결과가 늦게 반영되면 좋은 유입과 나쁜 유입을 구분할 수 없습니다.",
      action: "CRM 리드 ID 기준으로 상담 결과를 매일 won/lost로 갱신하세요.",
    });
  }
  if (!experiment.responsibleAgentId) {
    insights.push({
      tone: "neutral",
      label: "운영 연결",
      title: "담당 에이전트가 지정되지 않았습니다",
      detail: "자동 검토와 전략 제안은 책임 에이전트를 지정한 뒤에만 실행됩니다.",
      action: "운영 설정에서 담당 에이전트를 지정하세요.",
    });
  }
  if (!experiment.linkedIssueId) {
    insights.push({
      tone: "neutral",
      label: "의사결정 연결",
      title: "검토 결과를 남길 Paperclip 이슈가 없습니다",
      detail: "전략 근거와 승인 요청은 연결된 이슈 문서에 누적됩니다.",
      action: "기존 이슈를 연결하면 의사결정 페이지에서 전체 근거를 검토할 수 있습니다.",
    });
  }
  return insights.slice(0, 4);
}
