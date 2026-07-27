import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDotDashed,
  Crosshair,
  FlaskConical,
  Gauge,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  SpacebogamFunnelQualityStatus,
  SpacebogamFunnelRangeDays,
  SpacebogamFunnelReport,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import { SpacebogamFunnelApiError, type SpacebogamFunnelApiErrorCode } from "@/api/spacebogam-funnel";
import {
  DailyMixedChart,
  FunnelBarChart,
  LossParetoChart,
  NaverCampaignPerformanceChart,
  UtmBubbleChart,
} from "@/components/spacebogam-funnel/SpacebogamFunnelCharts";
import { formatCount, formatRate, formatWon } from "@/components/spacebogam-funnel/chartData";
import {
  buildCampaignVerdict,
  buildFunnelDiagnosis,
  type FunnelDiagnosis,
  type FunnelInsightConfidence,
} from "@/components/spacebogam-funnel/insights";
import { InlineBanner } from "@/components/InlineBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useSpacebogamFunnel } from "@/hooks/useSpacebogamFunnel";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: SpacebogamFunnelRangeDays[] = [7, 28, 90];

const WARNING_COPY: Record<Exclude<SpacebogamFunnelQualityStatus, "ready">, string> = {
  empty: "아직 측정된 세션이 없어 개선안을 숨깁니다.",
  collecting: "측정 표본을 수집 중이라 개선안을 숨깁니다.",
  stale: "최근 이벤트가 오래되어 측정값을 확인해야 합니다.",
  invalid_sequence: "퍼널 단계 순서가 맞지 않아 측정값을 먼저 점검해야 합니다.",
};

const ERROR_COPY: Partial<Record<SpacebogamFunnelApiErrorCode, string>> = {
  disabled: "공간보감 퍼널 연동이 비활성화되어 있습니다.",
  invalid_response: "공간보감 응답 형식이 올바르지 않습니다.",
  not_configured: "공간보감 퍼널 연동 설정이 필요합니다.",
  timeout: "공간보감 응답 시간이 초과되었습니다.",
  upstream_error: "공간보감 원본 데이터 요청에 실패했습니다.",
};

const CONFIDENCE_COPY: Record<FunnelInsightConfidence, string> = {
  confirmed: "데이터로 확인",
  directional: "방향성 판단",
  needs_measurement: "추가 측정 필요",
};

function errorMessage(error: Error | null): string {
  if (error instanceof SpacebogamFunnelApiError) {
    return ERROR_COPY[error.code] ?? "공간보감 퍼널 데이터를 불러오지 못했습니다.";
  }
  return "공간보감 퍼널 데이터를 불러오지 못했습니다.";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "없음";
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  });
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function hasBlogSignal(campaign: SpacebogamFunnelReport["campaigns"][number]): boolean {
  const attributionSignals = [campaign.source, campaign.medium, campaign.campaign];
  return attributionSignals.some((value) => /naver|네이버/i.test(value))
    && attributionSignals.some((value) => /blog|블로그/i.test(value));
}

function isNaverSearchCampaign(campaign: SpacebogamFunnelReport["campaigns"][number]): boolean {
  return campaign.source.toLowerCase().includes("naver") && !hasBlogSignal(campaign);
}

function ConfidenceBadge({ confidence }: { confidence: FunnelInsightConfidence }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-current bg-transparent",
        confidence === "confirmed" && "text-funnel-critical",
        confidence === "directional" && "text-funnel-signal",
        confidence === "needs_measurement" && "text-funnel-warning",
      )}
    >
      {CONFIDENCE_COPY[confidence]}
    </Badge>
  );
}

function QualitySummary({ report }: { report: SpacebogamFunnelReport }) {
  if (report.quality.status !== "ready") {
    return (
      <InlineBanner tone="warning" title="측정 경고" icon={AlertTriangle}>
        {[WARNING_COPY[report.quality.status], ...report.quality.warnings].filter(Boolean).join(" ")}
      </InlineBanner>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-y border-funnel-line py-4 text-sm text-funnel-ink sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-funnel-positive" aria-hidden="true" />
        <div>
          <p className="font-medium">판단 가능한 데이터입니다.</p>
          <p className="text-funnel-muted">
            표본 {formatCount(report.quality.sampleSessions)}세션, UTM 태깅률 {formatRate(report.quality.utmTaggedVisitRate)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono text-xs text-funnel-muted">
        <CircleDotDashed className="h-3.5 w-3.5" aria-hidden="true" />
        최신 이벤트 {report.quality.freshnessHours === null ? "확인 필요" : `${report.quality.freshnessHours.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간 전`}
      </div>
    </div>
  );
}

function MetricStrip({ report }: { report: SpacebogamFunnelReport }) {
  const metrics = [
    {
      label: "유입 세션",
      value: formatCount(report.counts.visits),
      context: `${report.rangeDays}일 표본`,
    },
    {
      label: "첫 10초 참여율",
      value: formatRate(ratio(report.counts.engagedVisits, report.counts.visits)),
      context: `${formatCount(report.counts.engagedVisits)}세션 유지`,
    },
    {
      label: "상담 의도율",
      value: formatRate(ratio(report.counts.consultationClicks, report.counts.engagedVisits)),
      context: `${formatCount(report.counts.consultationClicks)}회 CTA 클릭`,
    },
    {
      label: "문의 완료율",
      value: formatRate(ratio(report.counts.submittedLeads, report.counts.visits)),
      context: `${formatCount(report.counts.submittedLeads)}건 제출`,
    },
  ];

  return (
    <dl className="grid border-y border-funnel-line bg-funnel-panel/70 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(
            "flex items-end justify-between gap-3 border-b border-funnel-line px-4 py-4 sm:px-5",
            index % 2 === 0 && "sm:border-r",
            index >= 2 && "sm:border-b-0",
            index < 2 && "xl:border-b-0",
            index < 3 && "xl:border-r",
          )}
        >
          <div className="space-y-1">
            <dt className="text-xs font-medium text-funnel-muted">{metric.label}</dt>
            <dd className="text-xs text-funnel-muted">{metric.context}</dd>
          </div>
          <dd className="font-mono text-xl font-semibold tracking-tight text-funnel-ink">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IntegratedOverview({
  report,
  diagnosis,
}: {
  report: SpacebogamFunnelReport;
  diagnosis: FunnelDiagnosis | null;
}) {
  const campaignVerdict = buildCampaignVerdict(report);
  const naverSnapshot = report.naverSearchAds;
  const naverUtmLeads = report.campaigns
    .filter(isNaverSearchCampaign)
    .reduce((sum, campaign) => sum + campaign.submittedLeads, 0);
  const attributionNeedsCheck = naverSnapshot?.status === "ready"
    && naverSnapshot.totals.conversions === 0
    && naverUtmLeads > 0;
  const naverBlogCampaigns = report.campaigns.filter(hasBlogSignal);
  const naverBlogVisits = naverBlogCampaigns.reduce((sum, campaign) => sum + campaign.visits, 0);
  const naverBlogLeads = naverBlogCampaigns.reduce((sum, campaign) => sum + campaign.submittedLeads, 0);
  const utmVisits = report.campaigns.reduce((sum, campaign) => sum + campaign.visits, 0);
  const utmLeads = report.campaigns.reduce((sum, campaign) => sum + campaign.submittedLeads, 0);
  const unattributedVisits = Math.max(report.counts.visits - utmVisits, 0);
  const unattributedLeads = Math.max(report.counts.submittedLeads - utmLeads, 0);
  const visitOverAttribution = Math.max(utmVisits - report.counts.visits, 0);
  const leadOverAttribution = Math.max(utmLeads - report.counts.submittedLeads, 0);
  const hasOverAttribution = visitOverAttribution > 0 || leadOverAttribution > 0;
  const comparisonRows = [
    {
      key: "website-total",
      scope: "전체",
      label: "웹사이트 전체",
      detail: `${report.rangeDays}일 집계`,
      visits: report.counts.visits,
      leads: report.counts.submittedLeads,
      rate: ratio(report.counts.submittedLeads, report.counts.visits),
      confidence: "confirmed" as const,
    },
    {
      key: "naver-blog",
      scope: "채널",
      label: "네이버 블로그",
      detail: naverBlogCampaigns.length > 0
        ? `blog/블로그 신호 ${formatCount(naverBlogCampaigns.length)}개 UTM`
        : "blog/블로그 UTM 신호 없음",
      visits: naverBlogVisits,
      leads: naverBlogLeads,
      rate: ratio(naverBlogLeads, naverBlogVisits),
      confidence: naverBlogCampaigns.length > 0 ? "directional" as const : "needs_measurement" as const,
    },
    ...report.campaigns.map((campaign, index) => ({
      key: `campaign-${index}-${campaign.source}-${campaign.medium}-${campaign.campaign}`,
      scope: "UTM",
      label: campaign.campaign || "캠페인 값 없음",
      detail: `${campaign.source || "source 없음"} / ${campaign.medium || "medium 없음"}`,
      visits: campaign.visits,
      leads: campaign.submittedLeads,
      rate: campaign.visitToLeadRate,
      confidence: campaign.sampleStatus === "usable" ? "directional" as const : "needs_measurement" as const,
    })),
    {
      key: "unattributed",
      scope: "추정",
      label: "미분류",
      detail: "전체 − UTM 합계, 0 미만은 0으로 보정",
      visits: unattributedVisits,
      leads: unattributedLeads,
      rate: ratio(unattributedLeads, unattributedVisits),
      confidence: (unattributedVisits > 0 || unattributedLeads > 0 || hasOverAttribution)
        ? "needs_measurement" as const
        : "directional" as const,
    },
  ];

  const signals = [
    {
      eyebrow: "확정된 병목",
      title: diagnosis?.transition ?? "병목 판정 대기",
      body: diagnosis
        ? `${formatCount(diagnosis.lostSessions)}세션, ${formatRate(diagnosis.lossRate)}가 이 구간에서 이탈했습니다.`
        : "수집 품질이 준비 상태가 되면 가장 큰 단계 손실을 판정합니다.",
      confidence: diagnosis?.confidence ?? "needs_measurement" as const,
    },
    {
      eyebrow: "광고 귀속 상태",
      title: attributionNeedsCheck
        ? "네이버 전환 연결을 먼저 확인"
        : campaignVerdict.headline,
      body: attributionNeedsCheck
        ? `네이버 UTM 문의 ${formatCount(naverUtmLeads)}건과 광고 플랫폼 전환 0건이 일치하지 않습니다.`
        : campaignVerdict.summary,
      confidence: attributionNeedsCheck ? "needs_measurement" as const : campaignVerdict.confidence,
    },
    {
      eyebrow: "다음 확인",
      title: diagnosis?.experiment.metric ?? "데이터 수집 품질",
      body: diagnosis
        ? `${diagnosis.experiment.title}의 전후 결과를 같은 기간·표본 기준으로 비교합니다.`
        : "최신성, UTM 태깅률, 단계 순서를 먼저 정상화합니다.",
      confidence: diagnosis ? "directional" as const : "needs_measurement" as const,
    },
  ];

  return (
    <section aria-labelledby="integrated-overview-title" className="overflow-hidden rounded-xl border border-funnel-line bg-funnel-panel">
      <header className="grid gap-4 border-b border-funnel-line px-5 py-5 lg:grid-cols-3 lg:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-funnel-signal">Integrated readout</p>
          <h2 id="integrated-overview-title" className="mt-2 text-xl font-semibold text-funnel-ink">지금 한눈에 볼 결론</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-funnel-muted lg:col-span-2">
          사이트 퍼널, UTM 캠페인, 네이버 광고 데이터를 같은 판단 순서로 묶었습니다. 병목은 확정하고, 원인과 광고 기여는 근거 수준을 분리해 봅니다.
        </p>
      </header>
      <div className="grid lg:grid-cols-3">
        {signals.map((signal, index) => (
          <article
            key={signal.eyebrow}
            className={cn(
              "space-y-3 px-5 py-5 lg:px-6",
              index < signals.length - 1 && "border-b border-funnel-line lg:border-b-0 lg:border-r",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-funnel-muted">{signal.eyebrow}</p>
              <ConfidenceBadge confidence={signal.confidence} />
            </div>
            <h3 className="font-semibold text-funnel-ink">{signal.title}</h3>
            <p className="text-sm leading-6 text-funnel-muted">{signal.body}</p>
          </article>
        ))}
      </div>
      <div className="border-t border-funnel-line">
        <div className="flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-end lg:justify-between lg:px-6">
          <div>
            <h3 className="font-semibold text-funnel-ink">유입·문의 통합 비교</h3>
            <p className="mt-1 text-sm text-funnel-muted">
              전체 집계, 채널 소계, UTM 캠페인 상세, 미분류 추정치를 같은 기준으로 비교합니다.
            </p>
          </div>
          <p className="text-xs text-funnel-muted">채널 소계와 UTM 상세는 포함 관계이므로 서로 더하지 않습니다.</p>
        </div>
        <div className="overflow-x-auto" tabIndex={0} aria-label="유입 및 문의 통합 비교 표 스크롤 영역">
          <table className="w-full text-xs sm:text-sm" aria-label="유입 및 문의 통합 비교 표">
            <thead>
              <tr>
                <th className="border-y border-funnel-line px-5 py-2 text-left font-medium text-funnel-muted lg:px-6">구분</th>
                <th className="border-y border-funnel-line px-2 py-2 text-left font-medium text-funnel-muted">유입 경로</th>
                <th className="border-y border-funnel-line px-2 py-2 text-right font-medium text-funnel-muted">방문</th>
                <th className="border-y border-funnel-line px-2 py-2 text-right font-medium text-funnel-muted">문의</th>
                <th className="border-y border-funnel-line px-2 py-2 text-right font-medium text-funnel-muted">문의율</th>
                <th className="border-y border-funnel-line px-5 py-2 text-right font-medium text-funnel-muted lg:px-6">측정 상태</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.key}>
                  <td className="border-b border-funnel-line px-5 py-3 font-mono text-funnel-muted lg:px-6">{row.scope}</td>
                  <td className="border-b border-funnel-line px-2 py-3">
                    <p className="font-medium text-funnel-ink">{row.label}</p>
                    <p className="mt-1 text-xs text-funnel-muted">{row.detail}</p>
                  </td>
                  <td className="border-b border-funnel-line px-2 py-3 text-right font-mono text-funnel-ink">{formatCount(row.visits)}</td>
                  <td className="border-b border-funnel-line px-2 py-3 text-right font-mono text-funnel-ink">{formatCount(row.leads)}</td>
                  <td className="border-b border-funnel-line px-2 py-3 text-right font-mono text-funnel-ink">
                    {row.rate === null ? "측정 필요" : formatRate(row.rate)}
                  </td>
                  <td className="border-b border-funnel-line px-5 py-3 text-right lg:px-6">
                    <ConfidenceBadge confidence={row.confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={cn(
          "px-5 py-4 text-sm leading-6 lg:px-6",
          (hasOverAttribution || unattributedVisits > 0 || unattributedLeads > 0)
            ? "bg-funnel-critical-wash text-funnel-ink"
            : "text-funnel-muted",
        )}>
          {hasOverAttribution
            ? `UTM 합계가 전체보다 방문 ${formatCount(visitOverAttribution)}회, 문의 ${formatCount(leadOverAttribution)}건 많습니다. 중복 집계나 기간 불일치 가능성이 있어 미분류를 0으로 보정했으며 귀속 판단은 보류합니다.`
            : unattributedVisits > 0 || unattributedLeads > 0
              ? `미분류 방문 ${formatCount(unattributedVisits)}회와 문의 ${formatCount(unattributedLeads)}건은 전체에서 UTM 합계를 뺀 추정치입니다. UTM 누락 여부를 확인하기 전까지 채널 귀속은 불확실합니다.`
              : "전체와 UTM 합계가 일치합니다. UTM은 유입 경로를 보여주지만 문의의 인과를 확정하지는 않습니다."}
        </div>
      </div>
    </section>
  );
}

function DiagnosisPanel({ diagnosis }: { diagnosis: FunnelDiagnosis }) {
  return (
    <section
      aria-labelledby="current-diagnosis"
      className="overflow-hidden rounded-xl border border-funnel-ink bg-funnel-ink text-funnel-canvas"
    >
      <div className="grid lg:grid-cols-3">
        <div className="space-y-6 p-6 sm:p-8 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-funnel-critical text-funnel-canvas">우선순위 1</Badge>
            <span className="font-mono text-xs text-funnel-canvas/65">{diagnosis.transition}</span>
          </div>
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-funnel-canvas/60">현재 진단</p>
            <h2 id="current-diagnosis" className="text-2xl font-semibold leading-tight sm:text-3xl">
              {diagnosis.headline}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-funnel-canvas/72">{diagnosis.summary}</p>
          </div>
          <div className="grid gap-4 border-t border-funnel-canvas/20 pt-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-funnel-canvas/55">손실 세션</p>
              <p className="mt-1 font-mono text-lg font-semibold">{formatCount(diagnosis.lostSessions)}</p>
            </div>
            <div>
              <p className="text-xs text-funnel-canvas/55">이탈률</p>
              <p className="mt-1 font-mono text-lg font-semibold">{formatRate(diagnosis.lossRate)}</p>
            </div>
            <div>
              <p className="text-xs text-funnel-canvas/55">근거 수준</p>
              <p className="mt-1 text-sm font-semibold">단계 병목 확정</p>
            </div>
          </div>
        </div>

        <aside className="border-t border-funnel-canvas/20 bg-funnel-critical p-6 text-funnel-canvas lg:border-l lg:border-t-0 sm:p-8">
          <div className="flex h-full flex-col justify-between gap-8">
            <div className="space-y-3">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-widest text-funnel-canvas/70">이번 주 첫 실험</p>
              <h3 className="text-xl font-semibold leading-snug">{diagnosis.experiment.title}</h3>
              <p className="text-sm leading-6 text-funnel-canvas/82">{diagnosis.experiment.change}</p>
            </div>
            <div className="border-t border-funnel-canvas/25 pt-4">
              <p className="text-xs text-funnel-canvas/65">방향 확인선</p>
              <div className="mt-2 flex items-center gap-2 font-mono text-base font-semibold">
                <span>{formatRate(diagnosis.currentRate)}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                <span>{formatRate(diagnosis.targetRate)}</span>
              </div>
              <p className="mt-1 text-xs text-funnel-canvas/70">{diagnosis.experiment.metric}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function DistinctionGuide({ diagnosis }: { diagnosis: FunnelDiagnosis }) {
  return (
    <section aria-labelledby="distinction-title" className="border-y border-funnel-line bg-funnel-panel/80">
      <header className="grid gap-3 border-b border-funnel-line px-5 py-5 lg:grid-cols-3 lg:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-funnel-critical">원인 분리</p>
          <h2 id="distinction-title" className="mt-2 text-xl font-semibold text-funnel-ink">문제 구간과 원인은 다릅니다.</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-funnel-muted lg:col-span-2">
          현재 데이터는 어디에서 끊기는지는 확인합니다. 왜 끊기는지를 구분하려면 아래 신호를 추가로 비교해야 합니다.
        </p>
      </header>

      <div className="grid lg:grid-cols-3">
        <article className="space-y-4 border-b border-funnel-line px-5 py-6 lg:border-b-0 lg:border-r lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-funnel-muted">01 / 확정</p>
            <ConfidenceBadge confidence="confirmed" />
          </div>
          <h3 className="font-semibold text-funnel-ink">{diagnosis.transition}</h3>
          <p className="text-sm leading-6 text-funnel-muted">
            {formatCount(diagnosis.lostSessions)}세션이 이 구간에서 빠졌습니다. 이 구간을 먼저 고쳐야 전체 문의 가능성이 가장 크게 열립니다.
          </p>
        </article>

        <article className="space-y-4 border-b border-funnel-line px-5 py-6 lg:border-b-0 lg:border-r lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-funnel-muted">02 / 아직 모름</p>
            <ConfidenceBadge confidence="needs_measurement" />
          </div>
          <ul className="space-y-3">
            {diagnosis.possibleCauses.map((cause) => (
              <li key={cause} className="flex gap-2 text-sm leading-5 text-funnel-ink">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-funnel-warning" aria-hidden="true" />
                {cause}
              </li>
            ))}
          </ul>
        </article>

        <article className="space-y-4 px-5 py-6 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-funnel-muted">03 / 구분 방법</p>
            <ScanSearch className="h-4 w-4 text-funnel-signal" aria-hidden="true" />
          </div>
          <ol className="space-y-3">
            {diagnosis.distinction.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm leading-5 text-funnel-ink">
                <span className="font-mono text-xs text-funnel-signal">{String(index + 1).padStart(2, "0")}</span>
                {item}
              </li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}

function ActionBrief({ diagnosis }: { diagnosis: FunnelDiagnosis }) {
  const steps = [
    {
      icon: Target,
      label: "바꿀 것",
      title: diagnosis.experiment.title,
      body: diagnosis.experiment.change,
    },
    {
      icon: Gauge,
      label: "볼 것",
      title: diagnosis.experiment.metric,
      body: `${diagnosis.instrumentation.join(", ")} 신호를 함께 기록합니다.`,
    },
    {
      icon: ShieldCheck,
      label: "판정",
      title: "좋아졌을 때만 확대",
      body: diagnosis.experiment.decisionRule,
    },
  ];

  return (
    <section aria-labelledby="action-brief-title" className="rounded-xl border border-funnel-line bg-funnel-signal-wash">
      <header className="flex flex-col gap-3 border-b border-funnel-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-funnel-signal">Action brief</p>
          <h2 id="action-brief-title" className="mt-2 text-xl font-semibold text-funnel-ink">바꾸고, 측정하고, 판정하세요.</h2>
        </div>
        <p className="text-sm text-funnel-muted">한 번에 한 병목만 다룹니다.</p>
      </header>
      <ol className="grid lg:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.label}
              className={cn(
                "space-y-4 px-5 py-6 sm:px-6",
                index < steps.length - 1 && "border-b border-funnel-line lg:border-b-0 lg:border-r",
              )}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-funnel-signal" aria-hidden="true" />
                <span className="font-mono text-xs text-funnel-muted">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-funnel-muted">{step.label}</p>
                <h3 className="font-semibold text-funnel-ink">{step.title}</h3>
                <p className="text-sm leading-6 text-funnel-muted">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CampaignInsight({ report }: { report: SpacebogamFunnelReport }) {
  const verdict = buildCampaignVerdict(report);

  return (
    <section aria-labelledby="campaign-verdict-title" className="flex flex-col gap-4 border-y border-funnel-line py-5 md:flex-row md:items-start">
      <Crosshair className="h-5 w-5 text-funnel-signal" aria-hidden="true" />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="campaign-verdict-title" className="font-semibold text-funnel-ink">{verdict.headline}</h2>
          <ConfidenceBadge confidence={verdict.confidence} />
        </div>
        <p className="max-w-3xl text-sm leading-6 text-funnel-muted">{verdict.summary}</p>
      </div>
    </section>
  );
}

function FinalConclusion({
  report,
  diagnosis,
}: {
  report: SpacebogamFunnelReport;
  diagnosis: FunnelDiagnosis | null;
}) {
  const campaignVerdict = buildCampaignVerdict(report);
  const naverSnapshot = report.naverSearchAds;
  const trackingUncertain = naverSnapshot?.status !== "ready"
    || naverSnapshot.totals.conversions === 0;

  return (
    <section aria-labelledby="final-conclusion-title" className="overflow-hidden rounded-xl border border-funnel-ink bg-funnel-ink text-funnel-canvas">
      <div className="grid lg:grid-cols-3">
        <div className="space-y-4 p-6 sm:p-8 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-funnel-canvas/60">최종 결론</p>
          <h2 id="final-conclusion-title" className="text-2xl font-semibold leading-tight">
            {diagnosis
              ? `${diagnosis.transition} 병목을 먼저 검증하고, 광고 성과 판단은 귀속 확인 뒤에 내리세요.`
              : "성과 결론보다 측정 품질 복구가 먼저입니다."}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-funnel-canvas/72">
            {diagnosis
              ? `${diagnosis.transition}에서 ${formatCount(diagnosis.lostSessions)}세션이 빠진 것은 확인됐습니다. 다만 이탈 원인과 광고별 기여는 아직 분리 측정이 필요합니다.`
              : "현재 표본이나 이벤트 순서로는 개선 우선순위를 확정할 수 없습니다. 경고가 해소된 뒤 같은 화면에서 다시 판정합니다."}
          </p>
        </div>
        <aside className="border-t border-funnel-canvas/20 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-funnel-canvas/60">다음 결정 기준</p>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-funnel-canvas/55">퍼널</dt>
              <dd className="mt-1 font-medium">
                {diagnosis ? diagnosis.experiment.decisionRule : "준비 상태가 된 뒤 병목을 재판정"}
              </dd>
            </div>
            <div>
              <dt className="text-funnel-canvas/55">캠페인</dt>
              <dd className="mt-1 font-medium">{campaignVerdict.headline}</dd>
            </div>
            <div>
              <dt className="text-funnel-canvas/55">귀속 경고</dt>
              <dd className="mt-1 font-medium">
                {trackingUncertain ? "광고 플랫폼 전환과 UTM 문의를 연결하기 전까지 인과 판단 보류" : "플랫폼 전환과 사이트 문의 교차 확인 가능"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function NaverSearchAdsPanel({ report }: { report: SpacebogamFunnelReport }) {
  const snapshot = report.naverSearchAds;
  if (!snapshot) {
    return (
      <InlineBanner tone="warning" title="네이버 광고 연결 대기" icon={Megaphone}>
        네이버 검색광고 결과가 아직 이 리포트에 연결되지 않았습니다.
      </InlineBanner>
    );
  }
  if (snapshot.status === "error") {
    return (
      <InlineBanner tone="warning" title="네이버 광고 데이터 점검 필요" icon={Megaphone}>
        {snapshot.message} 퍼널 데이터는 계속 확인할 수 있습니다.
      </InlineBanner>
    );
  }

  const naverCampaigns = report.campaigns.filter((campaign) => (
    isNaverSearchCampaign(campaign)
  ));
  const naverUtmLeads = naverCampaigns.reduce((sum, campaign) => sum + campaign.submittedLeads, 0);
  const trackingMismatch = snapshot.totals.conversions === 0 && naverUtmLeads > 0;
  const metrics = [
    {
      icon: WalletCards,
      label: "광고비",
      value: formatWon(snapshot.totals.spendKrw),
      context: `${snapshot.campaignsWithSpend}개 캠페인 지출`,
    },
    {
      icon: Megaphone,
      label: "노출",
      value: formatCount(snapshot.totals.impressions),
      context: `활성 ${snapshot.activeCampaignCount}/${snapshot.campaignCount}`,
    },
    {
      icon: MousePointerClick,
      label: "클릭",
      value: formatCount(snapshot.totals.clicks),
      context: `CTR ${formatRate(snapshot.totals.ctr)}`,
    },
    {
      icon: Target,
      label: "네이버 전환",
      value: formatCount(snapshot.totals.conversions),
      context: snapshot.totals.costPerConversionKrw === null
        ? "전환 추적 확인 필요"
        : `CPA ${formatWon(snapshot.totals.costPerConversionKrw)}`,
    },
  ];

  return (
    <section aria-labelledby="naver-searchads-title" className="overflow-hidden rounded-xl border border-funnel-line bg-funnel-panel">
      <header className="grid gap-4 border-b border-funnel-line px-5 py-5 lg:grid-cols-3 lg:px-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-funnel-signal text-funnel-canvas">LIVE API</Badge>
            <Badge variant="outline" className="border-funnel-line text-funnel-muted">에이전트 조회 가능</Badge>
          </div>
          <h2 id="naver-searchads-title" className="text-xl font-semibold text-funnel-ink">네이버 검색광고</h2>
        </div>
        <div className="space-y-2 lg:col-span-2">
          <p className="font-semibold text-funnel-ink">
            {trackingMismatch
              ? "사이트 문의와 네이버 전환 집계가 연결되지 않았습니다."
              : snapshot.totals.conversions === 0
                ? "전환 0건이 실제 성과인지 추적 누락인지 먼저 구분하세요."
                : "광고 반응과 사이트 문의 흐름을 함께 비교할 수 있습니다."}
          </p>
          <p className="text-sm leading-6 text-funnel-muted">
            {trackingMismatch
              ? `네이버 UTM 유입에서 문의 ${formatCount(naverUtmLeads)}건이 보이지만 광고 플랫폼 전환은 0건입니다. 전환 태그와 UTM 연결을 먼저 점검하세요.`
              : `광고 데이터 ${snapshot.since}–${snapshot.until}. 퍼널과 날짜 범위는 같지만 공통 UTM이 없는 캠페인은 문의 인과로 단정하지 않습니다.`}
          </p>
        </div>
      </header>

      <dl className="grid border-b border-funnel-line sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={cn(
                "flex items-end justify-between gap-3 border-b border-funnel-line px-5 py-4",
                index % 2 === 0 && "sm:border-r",
                index >= 2 && "sm:border-b-0",
                index < 2 && "xl:border-b-0",
                index < 3 && "xl:border-r",
              )}
            >
              <div className="space-y-2">
                <Icon className="h-4 w-4 text-funnel-signal" aria-hidden="true" />
                <div>
                  <dt className="text-xs font-medium text-funnel-muted">{metric.label}</dt>
                  <dd className="text-xs text-funnel-muted">{metric.context}</dd>
                </div>
              </div>
              <dd className="font-mono text-xl font-semibold tracking-tight text-funnel-ink">{metric.value}</dd>
            </div>
          );
        })}
      </dl>

      <NaverCampaignPerformanceChart snapshot={snapshot} />
    </section>
  );
}

function canRenderLossPareto(report: SpacebogamFunnelReport) {
  return report.quality.status === "ready"
    && report.quality.isMonotonic
    && report.stages.every((stage) => stage.dropOffCount === null || stage.dropOffCount >= 0);
}

function LossParetoQualityWarning() {
  return (
    <section className="min-w-0 border-t border-funnel-line bg-funnel-critical-wash px-5 py-6">
      <h3 className="text-base font-semibold text-funnel-ink">손실 파레토 데이터 점검 필요</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-funnel-muted">
        단계별 손실이 음수이거나 측정 품질과 순서가 해석에 적합하지 않아 차트와 표를 표시하지 않습니다. 이벤트 순서와 수집 품질을 먼저 확인하세요.
      </p>
    </section>
  );
}

function Dashboard({ report }: { report: SpacebogamFunnelReport }) {
  const diagnosis = buildFunnelDiagnosis(report);

  return (
    <div className="space-y-8">
      <MetricStrip report={report} />
      <QualitySummary report={report} />
      <IntegratedOverview report={report} diagnosis={diagnosis} />
      <NaverSearchAdsPanel report={report} />
      {diagnosis && (
        <>
          <DiagnosisPanel diagnosis={diagnosis} />
          <DistinctionGuide diagnosis={diagnosis} />
          <ActionBrief diagnosis={diagnosis} />
          <CampaignInsight report={report} />
        </>
      )}

      <section aria-labelledby="evidence-title" className="space-y-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-funnel-muted">Evidence</p>
            <h2 id="evidence-title" className="mt-2 text-2xl font-semibold text-funnel-ink">판단 근거</h2>
          </div>
          <p className="max-w-lg text-sm leading-6 text-funnel-muted">차트는 결론을 장식하지 않습니다. 위 진단을 직접 확인하는 근거입니다.</p>
        </header>
        <div className="grid min-w-0 overflow-hidden rounded-xl border border-funnel-line bg-funnel-panel lg:grid-cols-2">
          <FunnelBarChart report={report} />
          <DailyMixedChart report={report} />
          <UtmBubbleChart report={report} />
          {canRenderLossPareto(report) ? <LossParetoChart report={report} /> : <LossParetoQualityWarning />}
        </div>
      </section>
      <FinalConclusion report={report} diagnosis={diagnosis} />
    </div>
  );
}

export function SpacebogamFunnelAnalytics() {
  const { selectedCompanyId } = useCompany();
  const [rangeDays, setRangeDays] = useState<SpacebogamFunnelRangeDays>(28);
  const query = useSpacebogamFunnel(selectedCompanyId, rangeDays);
  const hasError = query.isError;
  const report = hasError ? undefined : query.data;
  const pageMeta = useMemo(() => report ? [
    `데이터 기준 ${formatTimestamp(report.dataThrough)}`,
    `수집 시작 ${formatTimestamp(report.collectionStartedAt)}`,
  ] : [], [report]);

  return (
    <main className="spacebogam-funnel-surface min-h-screen min-w-0 p-4 text-funnel-ink sm:p-6 lg:p-8">
      <div className="mx-auto min-w-0 max-w-7xl space-y-8">
        <header className="space-y-6 border-b border-funnel-line pb-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-funnel-muted">
                <span>Spacebogam</span>
                <span aria-hidden="true">/</span>
                <span>Conversion control</span>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-funnel-ink">공간보감 퍼널·광고 분석</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-funnel-muted">
                  유입부터 문의까지의 병목과 광고 반응을 한 화면에서 구분합니다.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-1 rounded-lg border border-funnel-line bg-funnel-panel p-1" role="group" aria-label="분석 기간">
                {RANGE_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={rangeDays === option}
                    onClick={() => setRangeDays(option)}
                    className={cn(
                      "min-w-16 text-funnel-muted hover:bg-funnel-signal-wash hover:text-funnel-ink",
                      rangeDays === option && "bg-funnel-ink text-funnel-canvas hover:bg-funnel-ink hover:text-funnel-canvas",
                      query.isFetching && rangeDays === option && "opacity-70",
                    )}
                  >
                    {option}일
                  </Button>
                ))}
              </div>
              {pageMeta.length > 0 && (
                <div className="space-y-1 text-right font-mono text-xs text-funnel-muted">
                  {pageMeta.map((item) => <p key={item}>{item}</p>)}
                </div>
              )}
            </div>
          </div>
        </header>

        {!selectedCompanyId && (
          <InlineBanner tone="warning" title="회사를 선택하세요">회사 선택 후 퍼널 데이터를 불러옵니다.</InlineBanner>
        )}
        {query.isLoading && (
          <InlineBanner title="불러오는 중">공간보감 퍼널 리포트를 가져오고 있습니다.</InlineBanner>
        )}
        {hasError && (
          <InlineBanner
            tone="danger"
            title={errorMessage(query.error)}
            actions={(
              <Button variant="outline" onClick={() => void query.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                다시 시도
              </Button>
            )}
          >
            이전 리포트는 오류 상태에서 표시하지 않습니다.
          </InlineBanner>
        )}
        {report && <Dashboard report={report} />}
      </div>
    </main>
  );
}
