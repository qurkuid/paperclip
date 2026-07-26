import type {
  SpacebogamFunnelReport,
  SpacebogamNaverSearchAdsSnapshot,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import type { ChartData, ChartOptions } from "chart.js";
import { ChevronDown, TableProperties } from "lucide-react";
import { Chart } from "react-chartjs-2";
import { registerSpacebogamChartBasics } from "./chartRegistry";
import {
  buildCampaignRows,
  buildDailyRows,
  buildFunnelRows,
  buildLossParetoRows,
  formatCount,
  formatRate,
  formatWon,
} from "./chartData";
import { resolveSpacebogamChartTheme } from "./chartTheme";

registerSpacebogamChartBasics();

interface Props {
  report: SpacebogamFunnelReport;
}

type ReadyNaverSearchAdsSnapshot = Extract<SpacebogamNaverSearchAdsSnapshot, { status: "ready" }>;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function baseOptions(): ChartOptions {
  const theme = resolveSpacebogamChartTheme();
  return {
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 180, easing: "easeOutQuart" },
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: {
        labels: {
          boxHeight: 8,
          boxWidth: 8,
          color: theme.text,
          font: { size: 11 },
          usePointStyle: true,
        },
      },
      title: { display: false },
      tooltip: {
        backgroundColor: theme.text,
        bodyColor: theme.border,
        borderColor: theme.border,
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: false,
        titleColor: theme.border,
      },
    },
    scales: {
      x: {
        ticks: { color: theme.axis, font: { size: 11 } },
        grid: { color: theme.grid },
        border: { color: theme.border },
      },
      y: {
        beginAtZero: true,
        ticks: { color: theme.axis, font: { size: 11 } },
        grid: { color: theme.grid },
        border: { color: theme.border },
      },
    },
  };
}

function ChartShell({
  title,
  description,
  finding,
  children,
}: {
  title: string;
  description: string;
  finding: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-funnel-chart-shell
      className="min-w-0 border-t border-funnel-line bg-funnel-panel/80 pt-5"
    >
      <header className="flex flex-col gap-2 px-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-funnel-ink">{title}</h3>
          <p className="max-w-2xl text-sm text-funnel-muted">{description}</p>
        </div>
        <div className="max-w-sm border-l border-funnel-signal pl-3 sm:text-right">
          <p className="text-xs font-medium text-funnel-signal">테이블 인사이트</p>
          <p className="mt-1 text-sm font-medium text-funnel-ink">{finding}</p>
        </div>
      </header>
      <div className="min-w-0 pb-3 pt-5">{children}</div>
    </section>
  );
}

function EvidenceTable({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-funnel-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-xs font-medium text-funnel-muted transition-colors hover:text-funnel-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <TableProperties className="h-3.5 w-3.5" aria-hidden="true" />
          원본 표 보기
        </span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="max-h-64 min-w-0 overflow-auto px-5 pb-4" tabIndex={0} aria-label={label}>
        {children}
      </div>
    </details>
  );
}

const tableClass = "w-full table-fixed text-xs sm:text-sm";
const labelCellClass = "break-words border-b border-funnel-line py-2 pr-2 text-left text-funnel-ink";
const valueCellClass = "break-words border-b border-funnel-line px-1 text-right font-mono text-funnel-ink";
const headerClass = "border-b border-funnel-line py-2 text-xs font-medium text-funnel-muted";

function observedDailyRows(report: SpacebogamFunnelReport) {
  const rows = buildDailyRows(report);
  const collectionDate = report.collectionStartedAt?.slice(0, 10);
  const dataThroughDate = report.dataThrough?.slice(0, 10);
  const observed = rows.filter((row) => (
    (!collectionDate || row.date >= collectionDate)
    && (!dataThroughDate || row.date <= dataThroughDate)
  ));
  return observed.length > 0 ? observed : rows;
}

export function FunnelBarChart({ report }: Props) {
  const rows = buildFunnelRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar", number[], string> = {
    labels: rows.map((row) => row.stage),
    datasets: [{
      label: "세션 수",
      stack: "funnel-counts",
      data: rows.map((row) => row.count),
      backgroundColor: rows.map((_, index) => theme.series[index % theme.series.length]),
      borderColor: theme.border,
      borderRadius: 5,
      borderSkipped: false,
      borderWidth: 1,
    }],
  };
  const bottleneck = report.bottleneck;

  return (
    <ChartShell
      title="단계별 전환"
      description="단계가 좁아지는 위치가 문제 구간입니다. 비율과 절대 손실을 함께 봅니다."
      finding={bottleneck ? `${bottleneck.fromStage} → ${bottleneck.toStage}에서 ${formatCount(bottleneck.lostSessions)}세션 손실` : "현재 확정할 수 있는 병목이 없습니다."}
    >
      <div className="mx-5 h-80 min-w-0">
        <Chart
          type="bar"
          aria-label="공간보감 단계별 퍼널 막대 차트"
          data={data}
          options={{
            ...baseOptions(),
            indexAxis: "y",
            plugins: { ...baseOptions().plugins, legend: { display: false } },
          }}
        />
      </div>
      <EvidenceTable label="단계별 퍼널 표 스크롤 영역">
        <table className={tableClass} aria-label="단계별 퍼널 표">
          <thead>
            <tr>
              <th className={`${headerClass} text-left`}>단계</th>
              <th className={`${headerClass} text-right`}>세션</th>
              <th className={`${headerClass} text-right`}>전환율</th>
              <th className={`${headerClass} text-right`}>이탈률</th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td className={labelCellClass}>{row.stage}</td>
              <td className={valueCellClass}>{formatCount(row.count)}</td>
              <td className={valueCellClass}>{formatRate(row.conversion)}</td>
              <td className={valueCellClass}>{formatRate(row.dropOffRate)}</td>
            </tr>
          ))}</tbody>
        </table>
      </EvidenceTable>
    </ChartShell>
  );
}

export function DailyMixedChart({ report }: Props) {
  const rows = observedDailyRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar" | "line", number[], string> = {
    labels: rows.map((row) => row.date),
    datasets: [
      {
        type: "bar",
        label: "방문",
        stack: "daily-visits",
        data: rows.map((row) => row.visits),
        backgroundColor: theme.series[3],
        borderColor: theme.border,
        borderRadius: 4,
        borderWidth: 1,
      },
      {
        type: "line",
        label: "문의율",
        data: rows.map((row) => (row.leadRate ?? 0) * 100),
        borderColor: theme.success,
        backgroundColor: theme.success,
        borderWidth: 2,
        pointRadius: rows.length <= 14 ? 3 : 0,
        tension: 0.28,
        yAxisID: "rate",
      },
    ],
  };
  const totalVisits = rows.reduce((sum, row) => sum + row.visits, 0);

  return (
    <ChartShell
      title="수집 이후 흐름"
      description="수집 시작 전의 빈 날짜는 제외합니다. 방문량과 문의율이 함께 움직이는지 확인합니다."
      finding={`${rows.length}일 동안 방문 ${formatCount(totalVisits)}회`}
    >
      <div className="mx-5 h-80 min-w-0">
        <Chart
          type="bar"
          aria-label="공간보감 일별 방문 및 문의율 혼합 차트"
          data={data}
          options={{
            ...baseOptions(),
            scales: {
              x: baseOptions().scales?.x,
              y: baseOptions().scales?.y,
              rate: {
                beginAtZero: true,
                position: "right",
                ticks: { color: theme.axis, callback: (value) => `${value}%` },
                grid: { drawOnChartArea: false },
                border: { color: theme.border },
              },
            },
          }}
        />
      </div>
      <EvidenceTable label="일별 방문 및 문의율 표 스크롤 영역">
        <table className={tableClass} aria-label="일별 방문 및 문의율 표">
          <thead>
            <tr>
              <th className={`${headerClass} text-left`}>날짜</th>
              <th className={`${headerClass} text-right`}>방문</th>
              <th className={`${headerClass} text-right`}>문의</th>
              <th className={`${headerClass} text-right`}>문의율</th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td className={labelCellClass}>{row.date}</td>
              <td className={valueCellClass}>{formatCount(row.visits)}</td>
              <td className={valueCellClass}>{formatCount(row.leads)}</td>
              <td className={valueCellClass}>{formatRate(row.leadRate)}</td>
            </tr>
          ))}</tbody>
        </table>
      </EvidenceTable>
    </ChartShell>
  );
}

export function UtmBubbleChart({ report }: Props) {
  const rows = buildCampaignRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data = {
    datasets: rows.map((row, index) => ({
      label: row.campaign,
      data: [{
        x: row.visits,
        y: (row.leadRate ?? 0) * 100,
        r: Math.max(5, Math.min(15, Math.sqrt(row.visits))),
      }],
      backgroundColor: theme.series[index % theme.series.length],
      borderColor: theme.border,
      borderWidth: 1,
    })),
  };
  const converted = rows.filter((row) => row.leads > 0);

  return (
    <ChartShell
      title="캠페인 볼륨과 문의율"
      description="오른쪽일수록 유입이 많고 위쪽일수록 문의율이 높습니다. 원 크기는 방문 표본입니다."
      finding={converted.length > 0 ? `${converted.length}개 캠페인에서 문의 발생` : "문의가 발생한 캠페인이 아직 없습니다."}
    >
      <div className="mx-5 h-80 min-w-0">
        <Chart
          type="bubble"
          aria-label="공간보감 UTM 캠페인 볼륨 전환 산점도"
          data={data}
          options={{
            ...baseOptions(),
            plugins: {
              ...baseOptions().plugins,
              legend: { display: false },
            },
            scales: {
              x: {
                ...baseOptions().scales?.x,
                beginAtZero: true,
                title: { display: true, text: "방문", color: theme.axis },
              },
              y: {
                ...baseOptions().scales?.y,
                beginAtZero: true,
                title: { display: true, text: "문의율", color: theme.axis },
                ticks: { color: theme.axis, callback: (value) => `${value}%` },
              },
            },
          }}
        />
      </div>
      <EvidenceTable label="UTM 캠페인 볼륨 전환 표 스크롤 영역">
        <table className={tableClass} aria-label="UTM 캠페인 볼륨 전환 표">
          <thead>
            <tr>
              <th className={`${headerClass} text-left`}>캠페인</th>
              <th className={`${headerClass} text-left`}>소스</th>
              <th className={`${headerClass} text-right`}>방문</th>
              <th className={`${headerClass} text-right`}>문의율</th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td className={labelCellClass}>{row.campaign}</td>
              <td className={labelCellClass}>{row.sourceMedium}</td>
              <td className={valueCellClass}>{formatCount(row.visits)}</td>
              <td className={valueCellClass}>{formatRate(row.leadRate)}</td>
            </tr>
          ))}</tbody>
        </table>
      </EvidenceTable>
    </ChartShell>
  );
}

export function NaverCampaignPerformanceChart({
  snapshot,
}: {
  snapshot: ReadyNaverSearchAdsSnapshot;
}) {
  const rows = snapshot.campaigns;
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar" | "line", number[], string> = {
    labels: rows.map((row) => row.name ?? "이름 없는 캠페인"),
    datasets: [
      {
        type: "bar",
        label: "광고비",
        data: rows.map((row) => row.spendKrw),
        backgroundColor: theme.series[3],
        borderColor: theme.border,
        borderRadius: 4,
        borderWidth: 1,
        yAxisID: "spend",
      },
      {
        type: "line",
        label: "클릭",
        data: rows.map((row) => row.clicks),
        borderColor: theme.warning,
        backgroundColor: theme.warning,
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.22,
        yAxisID: "clicks",
      },
    ],
  };

  return (
    <ChartShell
      title="네이버 캠페인 지출과 반응"
      description="캠페인별 광고비와 클릭을 같은 순서로 비교합니다. 지출은 있는데 클릭이 약한 캠페인이 우선 점검 대상입니다."
      finding={`${snapshot.campaignsWithSpend}개 캠페인에서 광고비가 발생했습니다.`}
    >
      <div className="mx-5 h-80 min-w-0">
        <Chart
          type="bar"
          aria-label="네이버 캠페인 광고비 및 클릭 혼합 차트"
          data={data}
          options={{
            ...baseOptions(),
            scales: {
              x: {
                ticks: {
                  color: theme.axis,
                  font: { size: 11 },
                  maxRotation: 0,
                  minRotation: 0,
                },
                grid: { color: theme.grid },
                border: { color: theme.border },
              },
              spend: {
                ...baseOptions().scales?.y,
                position: "left",
                ticks: {
                  color: theme.axis,
                  callback: (value) => `${Number(value).toLocaleString("ko-KR")}원`,
                },
              },
              clicks: {
                beginAtZero: true,
                position: "right",
                ticks: { color: theme.axis },
                grid: { drawOnChartArea: false },
                border: { color: theme.border },
              },
            },
          }}
        />
      </div>
      <EvidenceTable label="네이버 캠페인 성과 표 스크롤 영역">
        <table className={tableClass} aria-label="네이버 캠페인 성과 표">
          <thead>
            <tr>
              <th className={`${headerClass} text-left`}>캠페인</th>
              <th className={`${headerClass} text-right`}>광고비</th>
              <th className={`${headerClass} text-right`}>클릭</th>
              <th className={`${headerClass} text-right`}>CTR</th>
              <th className={`${headerClass} text-right`}>전환</th>
            </tr>
          </thead>
          <tbody>{rows.map((row, index) => (
            <tr key={`${row.name ?? "campaign"}-${index}`}>
              <td className={labelCellClass}>{row.name ?? "이름 없는 캠페인"}</td>
              <td className={valueCellClass}>{formatWon(row.spendKrw)}</td>
              <td className={valueCellClass}>{formatCount(row.clicks)}</td>
              <td className={valueCellClass}>{formatRate(row.ctr)}</td>
              <td className={valueCellClass}>{formatCount(row.conversions)}</td>
            </tr>
          ))}</tbody>
        </table>
      </EvidenceTable>
    </ChartShell>
  );
}

export function LossParetoChart({ report }: Props) {
  const rows = buildLossParetoRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar" | "line", number[], string> = {
    labels: rows.map((row) => row.transition),
    datasets: [
      {
        type: "bar",
        label: "손실 세션",
        stack: "stage-losses",
        data: rows.map((row) => row.losses),
        backgroundColor: theme.danger,
        borderColor: theme.border,
        borderRadius: 4,
        borderWidth: 1,
      },
      {
        type: "line",
        label: "누적 손실 비중",
        data: rows.map((row) => row.cumulativeLossShare * 100),
        borderColor: theme.warning,
        backgroundColor: theme.warning,
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.22,
        yAxisID: "share",
      },
    ],
  };
  const topLoss = rows[0];

  return (
    <ChartShell
      title="손실 파레토"
      description="어떤 구간부터 고치면 전체 손실을 가장 크게 줄일 수 있는지 보여줍니다."
      finding={topLoss ? `첫 병목이 전체 관측 손실의 ${formatRate(topLoss.cumulativeLossShare)}를 차지합니다.` : "관측된 손실이 없습니다."}
    >
      <div className="mx-5 h-80 min-w-0">
        <Chart
          type="bar"
          aria-label="공간보감 손실 파레토 혼합 차트"
          data={data}
          options={{
            ...baseOptions(),
            scales: {
              x: baseOptions().scales?.x,
              y: baseOptions().scales?.y,
              share: {
                beginAtZero: true,
                max: 100,
                position: "right",
                ticks: { color: theme.axis, callback: (value) => `${value}%` },
                grid: { drawOnChartArea: false },
                border: { color: theme.border },
              },
            },
          }}
        />
      </div>
      <EvidenceTable label="손실 파레토 표 스크롤 영역">
        <table className={tableClass} aria-label="손실 파레토 표">
          <thead>
            <tr>
              <th className={`${headerClass} text-left`}>전환</th>
              <th className={`${headerClass} text-right`}>손실</th>
              <th className={`${headerClass} text-right`}>손실률</th>
              <th className={`${headerClass} text-right`}>누적 비중</th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td className={labelCellClass}>{row.transition}</td>
              <td className={valueCellClass}>{formatCount(row.losses)}</td>
              <td className={valueCellClass}>{formatRate(row.lossRate)}</td>
              <td className={valueCellClass}>{formatRate(row.cumulativeLossShare)}</td>
            </tr>
          ))}</tbody>
        </table>
      </EvidenceTable>
    </ChartShell>
  );
}
