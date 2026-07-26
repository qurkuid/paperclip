import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";
import type { ChartData, ChartOptions } from "chart.js";
import { Chart } from "react-chartjs-2";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSpacebogamChartBasics } from "./chartRegistry";
import {
  buildCampaignRows,
  buildDailyRows,
  buildFunnelRows,
  buildLossParetoRows,
  formatCount,
  formatRate,
} from "./chartData";
import { resolveSpacebogamChartTheme } from "./chartTheme";

registerSpacebogamChartBasics();

interface Props {
  report: SpacebogamFunnelReport;
}

function baseOptions(title: string): ChartOptions {
  const theme = resolveSpacebogamChartTheme();
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: theme.text } },
      title: { display: true, text: title, color: theme.text },
    },
    scales: {
      x: { ticks: { color: theme.axis }, grid: { color: theme.grid } },
      y: { ticks: { color: theme.axis }, grid: { color: theme.grid } },
    },
  };
}

function ChartShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 gap-4 py-5">
      <CardHeader className="gap-1 px-5">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 px-5">{children}</CardContent>
    </Card>
  );
}

function TableScroll({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="max-h-52 min-w-0 overflow-auto" tabIndex={0} aria-label={label}>
      {children}
    </div>
  );
}

const tableClass = "w-full table-fixed text-xs sm:text-sm";
const labelCellClass = "break-words py-2 pr-2 text-left";
const valueCellClass = "break-words px-1 text-right";

export function FunnelBarChart({ report }: Props) {
  const rows = buildFunnelRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar", number[], string> = {
    labels: rows.map((row) => row.stage),
    datasets: [{ label: "세션 수", stack: "funnel-counts", data: rows.map((row) => row.count), backgroundColor: theme.series[1], borderColor: theme.border }],
  };

  return (
    <ChartShell title="단계별 퍼널" description="방문부터 문의 제출까지의 단계별 세션입니다.">
      <div className="h-72 min-w-0">
        <Chart type="bar" aria-label="공간보감 단계별 퍼널 막대 차트" data={data} options={{ ...baseOptions("단계별 퍼널"), indexAxis: "y" }} />
      </div>
      <TableScroll label="단계별 퍼널 표 스크롤 영역">
        <table className={tableClass} aria-label="단계별 퍼널 표">
          <thead><tr className="border-b"><th className={labelCellClass}>단계</th><th className={valueCellClass}>세션</th><th className={valueCellClass}>전환율</th><th className={valueCellClass}>이탈률</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className={labelCellClass}>{row.stage}</td><td className={valueCellClass}>{formatCount(row.count)}</td><td className={valueCellClass}>{formatRate(row.conversion)}</td><td className={valueCellClass}>{formatRate(row.dropOffRate)}</td></tr>)}</tbody>
        </table>
      </TableScroll>
    </ChartShell>
  );
}

export function DailyMixedChart({ report }: Props) {
  const rows = buildDailyRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar" | "line", number[], string> = {
    labels: rows.map((row) => row.date),
    datasets: [
      { type: "bar", label: "방문", stack: "daily-visits", data: rows.map((row) => row.visits), backgroundColor: theme.series[0], borderColor: theme.border },
      { type: "line", label: "문의율", data: rows.map((row) => (row.leadRate ?? 0) * 100), borderColor: theme.success, backgroundColor: theme.success, yAxisID: "rate" },
    ],
  };

  return (
    <ChartShell title="일별 방문과 문의율" description="방문량과 방문 대비 문의율의 같은 기간 흐름입니다.">
      <div className="h-72 min-w-0">
        <Chart type="bar" aria-label="공간보감 일별 방문 및 문의율 혼합 차트" data={data} options={{ ...baseOptions("일별 방문과 문의율"), scales: { x: baseOptions("").scales?.x, y: baseOptions("").scales?.y, rate: { position: "right", ticks: { color: theme.axis } } } }} />
      </div>
      <TableScroll label="일별 방문 및 문의율 표 스크롤 영역">
        <table className={tableClass} aria-label="일별 방문 및 문의율 표">
          <thead><tr className="border-b"><th className={labelCellClass}>날짜</th><th className={valueCellClass}>방문</th><th className={valueCellClass}>문의</th><th className={valueCellClass}>문의율</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className={labelCellClass}>{row.date}</td><td className={valueCellClass}>{formatCount(row.visits)}</td><td className={valueCellClass}>{formatCount(row.leads)}</td><td className={valueCellClass}>{formatRate(row.leadRate)}</td></tr>)}</tbody>
        </table>
      </TableScroll>
    </ChartShell>
  );
}

export function UtmBubbleChart({ report }: Props) {
  const rows = buildCampaignRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data = {
    datasets: [{
      label: "UTM 캠페인",
      data: rows.map((row) => ({ x: row.visits, y: (row.leadRate ?? 0) * 100, r: Math.max(4, Math.sqrt(row.leads) * 2) })),
      backgroundColor: theme.series[2],
      borderColor: theme.border,
    }],
  };

  return (
    <ChartShell title="UTM 볼륨과 전환" description="원 크기는 문의 수, 세로축은 방문 대비 문의율입니다.">
      <div className="h-72 min-w-0">
        <Chart type="bubble" aria-label="공간보감 UTM 캠페인 볼륨 전환 산점도" data={data} options={baseOptions("UTM 볼륨과 전환")} />
      </div>
      <TableScroll label="UTM 캠페인 볼륨 전환 표 스크롤 영역">
        <table className={tableClass} aria-label="UTM 캠페인 볼륨 전환 표">
          <thead><tr className="border-b"><th className={labelCellClass}>캠페인</th><th className={labelCellClass}>소스</th><th className={valueCellClass}>방문</th><th className={valueCellClass}>문의율</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className={labelCellClass}>{row.campaign}</td><td className={labelCellClass}>{row.sourceMedium}</td><td className={valueCellClass}>{formatCount(row.visits)}</td><td className={valueCellClass}>{formatRate(row.leadRate)}</td></tr>)}</tbody>
        </table>
      </TableScroll>
    </ChartShell>
  );
}

export function LossParetoChart({ report }: Props) {
  const rows = buildLossParetoRows(report);
  const theme = resolveSpacebogamChartTheme();
  const data: ChartData<"bar" | "line", number[], string> = {
    labels: rows.map((row) => row.transition),
    datasets: [
      { type: "bar", label: "손실 세션", stack: "stage-losses", data: rows.map((row) => row.losses), backgroundColor: theme.series[3], borderColor: theme.border },
      { type: "line", label: "누적 손실 비중", data: rows.map((row) => row.cumulativeLossShare * 100), borderColor: theme.warning, backgroundColor: theme.warning, yAxisID: "share" },
    ],
  };

  return (
    <ChartShell title="손실 파레토" description="단계 전환 중 손실 세션이 큰 구간부터 누적 비중을 보여줍니다.">
      <div className="h-72 min-w-0">
        <Chart type="bar" aria-label="공간보감 손실 파레토 혼합 차트" data={data} options={{ ...baseOptions("손실 파레토"), scales: { x: baseOptions("").scales?.x, y: baseOptions("").scales?.y, share: { position: "right", ticks: { color: theme.axis } } } }} />
      </div>
      <TableScroll label="손실 파레토 표 스크롤 영역">
        <table className={tableClass} aria-label="손실 파레토 표">
          <thead><tr className="border-b"><th className={labelCellClass}>전환</th><th className={valueCellClass}>손실</th><th className={valueCellClass}>손실률</th><th className={valueCellClass}>누적 손실 비중</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className={labelCellClass}>{row.transition}</td><td className={valueCellClass}>{formatCount(row.losses)}</td><td className={valueCellClass}>{formatRate(row.lossRate)}</td><td className={valueCellClass}>{formatRate(row.cumulativeLossShare)}</td></tr>)}</tbody>
        </table>
      </TableScroll>
    </ChartShell>
  );
}
