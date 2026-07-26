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

import type { ExperimentDetail, VariantMetric } from "./types.js";

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
  animation: { duration: 240 },
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

function total(metrics: VariantMetric[], key: keyof VariantMetric) {
  return metrics.reduce((sum, metric) => {
    const value = metric[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

export function ExperimentCharts({ detail }: { detail: ExperimentDetail }) {
  const { variantMetrics, snapshots, variants } = detail;
  const outcomeData = useMemo(() => ({
    labels: variantMetrics.map((metric) => metric.key),
    datasets: [
      {
        label: "계약",
        data: variantMetrics.map((metric) => metric.won),
        backgroundColor: "#176b4d",
        stack: "outcomes",
      },
      {
        label: "실패",
        data: variantMetrics.map((metric) => metric.lost),
        backgroundColor: "#bf655d",
        stack: "outcomes",
      },
      {
        label: "진행 중",
        data: variantMetrics.map((metric) => metric.pending),
        backgroundColor: "#d7b96f",
        stack: "outcomes",
      },
    ],
  }), [variantMetrics]);
  const mixData = useMemo(() => ({
    labels: ["계약", "실패", "진행 중", "제외"],
    datasets: [{
      label: "상담 결과",
      data: [
        total(variantMetrics, "won"),
        total(variantMetrics, "lost"),
        total(variantMetrics, "pending"),
        total(variantMetrics, "disqualified"),
      ],
      backgroundColor: ["#176b4d", "#bf655d", "#d7b96f", "#aeb8b0"],
      borderWidth: 0,
    }],
  }), [variantMetrics]);
  const trendData = useMemo(() => {
    const recent = [...snapshots]
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
      .slice(-12);
    return {
      labels: recent.map((snapshot) =>
        new Intl.DateTimeFormat("ko-KR", {
          month: "numeric",
          day: "numeric",
        }).format(new Date(snapshot.recordedAt)),
      ),
      datasets: variants.map((variant, index) => ({
        label: variant.name,
        data: recent.map((snapshot) => {
          const metric = snapshot.variantMetrics.find(
            (candidate) => candidate.variantId === variant.id,
          );
          return metric?.wonRate === null || metric?.wonRate === undefined
            ? null
            : Number((metric.wonRate * 100).toFixed(1));
        }),
        borderColor: COLORS[index % COLORS.length],
        backgroundColor: COLORS[index % COLORS.length],
        tension: 0.28,
        pointRadius: 3,
      })),
    };
  }, [snapshots, variants]);

  if (variantMetrics.length === 0) return null;
  return (
    <section className="sbe-charts" aria-label="실험 성과 차트">
      <article className="sbe-chart">
        <h3>변형별 상담 결과</h3>
        <p>표본의 계약·실패·진행 중 구성을 비교합니다.</p>
        <div className="sbe-canvas" role="img" aria-label="변형별 상담 결과 누적 막대 차트">
          <Bar data={outcomeData} options={chartOptions} />
        </div>
      </article>
      <article className="sbe-chart">
        <h3>전체 결과 구성</h3>
        <p>결과 미확정 비중이 높으면 해석이 지연됩니다.</p>
        <div className="sbe-canvas" role="img" aria-label="전체 상담 결과 도넛 차트">
          <Doughnut
            data={mixData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "66%",
              plugins: chartOptions.plugins,
            }}
          />
        </div>
      </article>
      {snapshots.length > 0 ? (
        <article className="sbe-chart full">
          <h3>계약 전환율 추세</h3>
          <p>최근 12회 관찰 스냅샷의 변화를 봅니다.</p>
          <div className="sbe-canvas" role="img" aria-label="변형별 계약 전환율 추세선">
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
          </div>
        </article>
      ) : null}
    </section>
  );
}
