import { AlertTriangle, RefreshCw, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  SpacebogamFunnelQualityStatus,
  SpacebogamFunnelRangeDays,
  SpacebogamFunnelReport,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineBanner } from "@/components/InlineBanner";
import { useCompany } from "@/context/CompanyContext";
import { useSpacebogamFunnel } from "@/hooks/useSpacebogamFunnel";
import { cn } from "@/lib/utils";
import { SpacebogamFunnelApiError, type SpacebogamFunnelApiErrorCode } from "@/api/spacebogam-funnel";
import {
  DailyMixedChart,
  FunnelBarChart,
  LossParetoChart,
  UtmBubbleChart,
} from "@/components/spacebogam-funnel/SpacebogamFunnelCharts";
import { formatCount, formatRate } from "@/components/spacebogam-funnel/chartData";

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

function KpiCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="gap-1 px-5">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );
}

function QualityBanner({ report }: { report: SpacebogamFunnelReport }) {
  if (report.quality.status === "ready") {
    return (
      <InlineBanner tone="info" title="측정 상태 양호">
        표본 {formatCount(report.quality.sampleSessions)}개, UTM 태깅률 {formatRate(report.quality.utmTaggedVisitRate)} 기준으로 개선 액션을 표시합니다.
      </InlineBanner>
    );
  }

  return (
    <InlineBanner tone="warning" title="측정 경고" icon={AlertTriangle}>
      {[WARNING_COPY[report.quality.status], ...report.quality.warnings].filter(Boolean).join(" ")}
    </InlineBanner>
  );
}

function BottleneckAction({ report }: { report: SpacebogamFunnelReport }) {
  if (report.quality.status !== "ready" || !report.bottleneck || report.recommendations.length === 0) return null;
  const recommendation = report.recommendations[0];

  return (
    <Card className="min-w-0 border-primary/40 py-5">
      <CardHeader className="gap-2 px-5">
        <CardDescription className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4" aria-hidden="true" />
          가장 큰 병목
        </CardDescription>
        <CardTitle className="text-lg">{recommendation.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 text-sm">
        <p className="text-muted-foreground">
          {report.bottleneck.fromStage}에서 {report.bottleneck.toStage}까지 {formatCount(report.bottleneck.lostSessions)}세션 손실, 이탈률 {formatRate(report.bottleneck.lossRate)}입니다.
        </p>
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 font-medium text-primary">
          {recommendation.action}
        </div>
      </CardContent>
    </Card>
  );
}

function canRenderLossPareto(report: SpacebogamFunnelReport) {
  return report.quality.status === "ready"
    && report.quality.isMonotonic
    && report.stages.every((stage) => stage.dropOffCount === null || stage.dropOffCount >= 0);
}

function LossParetoQualityWarning() {
  return (
    <Card className="min-w-0 gap-4 border-amber-500/40 py-5">
      <CardHeader className="gap-1 px-5">
        <CardTitle className="text-base">손실 파레토 데이터 점검 필요</CardTitle>
        <CardDescription>단계별 손실 해석을 중단했습니다.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        단계별 손실이 음수이거나 측정 품질/순서가 손실 해석에 적합하지 않아 손실 파레토 차트와 표를 표시하지 않습니다. 공간보감 이벤트 순서와 수집 품질을 먼저 확인하세요.
      </CardContent>
    </Card>
  );
}

function Dashboard({ report }: { report: SpacebogamFunnelReport }) {
  const visitToLeadRate = report.counts.visits > 0 ? report.counts.submittedLeads / report.counts.visits : null;
  const kpis = useMemo(() => [
    { title: "방문", value: formatCount(report.counts.visits), description: `${report.rangeDays}일 기준 유입 세션` },
    { title: "문의", value: formatCount(report.counts.submittedLeads), description: "제출 완료된 상담 문의" },
    { title: "방문 대비 문의율", value: formatRate(visitToLeadRate), description: "방문 세션 중 문의 제출 비율" },
    { title: "데이터 최신성", value: report.quality.freshnessHours === null ? "확인 필요" : `${report.quality.freshnessHours.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`, description: "마지막 이벤트 이후 경과 시간" },
  ], [report, visitToLeadRate]);

  return (
    <>
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
      </div>
      <QualityBanner report={report} />
      <BottleneckAction report={report} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <FunnelBarChart report={report} />
        <DailyMixedChart report={report} />
        <UtmBubbleChart report={report} />
        {canRenderLossPareto(report) ? <LossParetoChart report={report} /> : <LossParetoQualityWarning />}
      </div>
    </>
  );
}

export function SpacebogamFunnelAnalytics() {
  const { selectedCompanyId } = useCompany();
  const [rangeDays, setRangeDays] = useState<SpacebogamFunnelRangeDays>(28);
  const query = useSpacebogamFunnel(selectedCompanyId, rangeDays);
  const hasError = query.isError;
  const report = hasError ? undefined : query.data;

  return (
    <main className="min-h-screen min-w-0 bg-background p-6 text-foreground">
      <div className="mx-auto min-w-0 max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">공간보감 퍼널 분석</h1>
            <p className="text-sm text-muted-foreground">회사별 공간보감 유입, 상담 행동, 문의 전환 흐름을 봅니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                variant={rangeDays === option ? "default" : "outline"}
                onClick={() => setRangeDays(option)}
                className={cn(query.isFetching && rangeDays === option && "opacity-80")}
              >
                {option}일
              </Button>
            ))}
          </div>
        </header>

        {!selectedCompanyId && <InlineBanner tone="warning" title="회사를 선택하세요">회사 선택 후 퍼널 데이터를 불러옵니다.</InlineBanner>}
        {query.isLoading && <InlineBanner title="불러오는 중">공간보감 퍼널 리포트를 가져오고 있습니다.</InlineBanner>}
        {hasError && (
          <InlineBanner
            tone="danger"
            title={errorMessage(query.error)}
            actions={<Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" aria-hidden="true" />다시 시도</Button>}
          >
            이전 리포트는 오류 상태에서 표시하지 않습니다.
          </InlineBanner>
        )}
        {report && (
          <section className="min-w-0 space-y-6">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>생성: {formatTimestamp(report.generatedAt)}</span>
              <span>데이터 기준: {formatTimestamp(report.dataThrough)}</span>
              <span>수집 시작: {formatTimestamp(report.collectionStartedAt)}</span>
            </div>
            <Dashboard report={report} />
          </section>
        )}
      </div>
    </main>
  );
}
