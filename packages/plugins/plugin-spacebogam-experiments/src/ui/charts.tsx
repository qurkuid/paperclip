import { useMemo } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import {
  buildCumulativeTrendData,
  buildComparisonBarData,
  buildOverallMixData,
  buildSampleProgressData,
  buildVariantResultRows,
} from "./chart-data.js";
import type { ExperimentDetail } from "./types.js";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

const COLORS = ["#176b4d", "#bf8a2f", "#5570a1", "#a95652"];
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, grid: { color: "#edf1ed" } },
  },
};
const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: chartOptions.plugins,
};

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function ExperimentCharts({ detail }: { detail: ExperimentDetail }) {
  const { variantMetrics, snapshots } = detail;
  const rows = useMemo(() => buildVariantResultRows(detail), [detail]);
  const outcomeData = useMemo(() => {
    const result = buildComparisonBarData(rows);

    return {
      labels: [...result.labels],
      datasets: result.datasets.map((dataset) => ({
        ...dataset,
        data: [...dataset.data],
        backgroundColor:
          dataset.id === "outcome-converted"
            ? "#176b4d"
            : dataset.id === "outcome-lost"
              ? "#bf655d"
              : dataset.id === "outcome-disqualified"
                ? "#aeb8b0"
                : "#d7b96f",
        stack: "outcomes",
      })),
    };
  }, [rows]);
  const mixData = useMemo(() => {
    const result = buildOverallMixData(detail);

    return {
      labels: [...result.labels],
      datasets: result.datasets.map((dataset) => ({
        ...dataset,
        data: [...dataset.data],
        backgroundColor: ["#176b4d", "#bf655d", "#d7b96f", "#aeb8b0"],
        borderWidth: 0,
      })),
    };
  }, [detail]);
  const sampleData = useMemo(() => {
    const result = buildSampleProgressData(detail);

    return {
      labels: [...result.labels],
      datasets: [
        ...result.datasets.map((dataset, index) => ({
          ...dataset,
          data: [...dataset.data],
          backgroundColor: index === 0 ? "#176b4d" : "#dce4dd",
          stack: "sample",
        })),
        {
          id: "guardrail-disqualified",
          label: "제외율",
          data: rows.map((row) =>
            row.sample === 0
              ? 0
              : Number(((row.disqualified / row.sample) * 100).toFixed(1)),
          ),
          backgroundColor: "#bf655d",
          stack: "guardrail",
        },
      ],
    };
  }, [detail, rows]);
  const trendData = useMemo(() => {
    const result = buildCumulativeTrendData({
      ...detail,
      snapshots: [...detail.snapshots]
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
        .slice(-12),
    });

    return {
      labels: [...result.labels],
      datasets: result.datasets.map((dataset, index) => ({
        ...dataset,
        data: [...dataset.data],
        borderColor: COLORS[index % COLORS.length],
        backgroundColor: COLORS[index % COLORS.length],
        tension: 0.28,
        pointRadius: 3,
      })),
    };
  }, [detail]);
  const rowSummary = rows
    .map((row) => `${row.name}: 표본 ${row.sample}명, 계약률 ${formatPercent(row.wonRate)}`)
    .join(" · ");
  const totalDisqualified = rows.reduce((sum, row) => sum + row.disqualified, 0);
  const totalSample = rows.reduce((sum, row) => sum + row.sample, 0);
  const guardrailSummary = `제외 ${totalDisqualified}명, 제외율 ${
    totalSample === 0 ? "0.0%" : `${((totalDisqualified / totalSample) * 100).toFixed(1)}%`
  }`;

  if (variantMetrics.length === 0) {
    return (
      <section className="sbe-charts" aria-label="실험 성과 차트">
        <article className="sbe-chart">
          <h3>그룹 계약 전환 비교</h3>
          <p>비교 가능한 표본이 아직 없습니다.</p>
          <div
            className="sbe-canvas"
            role="img"
            aria-label="표본이 없는 실험 결과"
          >
            <div>데이터가 없습니다</div>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="sbe-charts" aria-label="실험 성과 차트">
      <article className="sbe-chart">
        <h3>그룹 계약 전환 비교</h3>
        <p>{rowSummary}</p>
        <div className="sbe-canvas" role="img" aria-label="그룹 계약 전환 비교 막대 차트">
          <Bar data={outcomeData} options={chartOptions} />
        </div>
      </article>
      <article className="sbe-chart">
        <h3>전체 결과 구성</h3>
        <p>계약, 실패, 진행 중, 제외 상담의 전체 구성을 비교합니다.</p>
        <div className="sbe-canvas compact" role="img" aria-label="전체 상담 결과 구성 도넛 차트">
          <Doughnut data={mixData} options={doughnutOptions} />
        </div>
      </article>
      <article className="sbe-chart">
        <h3>표본·guardrail 진행</h3>
        <p>
          변형마다 최소 {detail.experiment.minimumSamplePerVariant}명의 표본을
          확보해야 비교를 시작할 수 있습니다. {guardrailSummary}
        </p>
        <div
          className="sbe-canvas compact"
          role="img"
          aria-label="표본 및 guardrail 진행 막대 차트"
        >
          <Bar
            data={sampleData}
            options={{
              ...chartOptions,
              indexAxis: "y",
              scales: {
                x: {
                  stacked: true,
                  max: 100,
                  grid: { display: false },
                  ticks: { callback: (value) => `${String(value)}%` },
                },
                y: { stacked: true, grid: { display: false } },
              },
            }}
          />
        </div>
      </article>
      <article className="sbe-chart full">
        <h3>누적 전환 추세</h3>
        <p>
          {snapshots.length > 0
            ? `최근 ${Math.min(snapshots.length, 12)}회 스냅샷의 계약률 변화를 봅니다.`
            : "누적 추세를 그릴 스냅샷이 아직 없습니다."}
        </p>
        <div className="sbe-canvas" role="img" aria-label="누적 전환 추세 선 차트">
          {snapshots.length > 0 ? (
            <Line
              data={trendData}
              options={{
                ...chartOptions,
                scales: {
                  ...chartOptions.scales,
                  y: {
                    ...chartOptions.scales.y,
                    max: 100,
                    ticks: { callback: (value) => `${String(value)}%` },
                  },
                },
              }}
            />
          ) : (
            <div>데이터가 없습니다</div>
          )}
        </div>
      </article>
    </section>
  );
}
