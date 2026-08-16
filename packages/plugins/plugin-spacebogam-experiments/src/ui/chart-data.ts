import type { ExperimentDetail } from "./types.js";

export type VariantResultRow = {
  variantId: string;
  key: string;
  name: string;
  isControl: boolean;
  target: number;
  sample: number;
  won: number;
  lost: number;
  pending: number;
  disqualified: number;
  resolved: number;
  wonRate: number | null;
  progressPercent: number;
};

export type ComparisonBarData = {
  id: string;
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: number[];
  }>;
};

export type SampleProgressData = {
  id: string;
  target: number;
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: number[];
  }>;
  samples: Array<{ variantId: string; sample: number; target: number }>;
};

export type TrendChartData = {
  id: string;
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: (number | null)[];
  }>;
};

export type OverallMixData = {
  id: string;
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: number[];
  }>;
};

export type NoDataSummary = {
  id: string;
  hasVariantMetrics: boolean;
  hasSnapshots: boolean;
  message: string;
};

export type ChartDataOptions = {
  id: "chart-data-options";
  reducedMotion: boolean;
  animation: false | "default";
};

function resolveTarget(detail: ExperimentDetail): number {
  return Math.max(detail.experiment.minimumSamplePerVariant, 0);
}

function variantName(
  detail: ExperimentDetail,
  metric: VariantResultRow | { variantId: string; key: string },
): string {
  const name = detail.variants.find((variant) => (
    variant.id === metric.variantId
  ))?.name;
  return name === undefined || name.trim() === "" ? metric.key : name;
}

export function buildVariantResultRows(
  detail: ExperimentDetail,
): readonly VariantResultRow[] {
  const target = resolveTarget(detail);

  return detail.variantMetrics.map((metric) => ({
    variantId: metric.variantId,
    key: metric.key,
    name: variantName(detail, metric),
    isControl: metric.isControl,
    target,
    sample: metric.sample,
    won: metric.won,
    lost: metric.lost,
    pending: metric.pending,
    disqualified: metric.disqualified,
    resolved: metric.resolved,
    wonRate: metric.wonRate,
    progressPercent:
      target > 0 ? Math.min((metric.sample * 100) / target, 100) : 0,
  }));
}

export function buildComparisonBarData(rows: readonly VariantResultRow[]): ComparisonBarData {
  return {
    id: "variant-outcome-comparison",
    labels: rows.map((row) => row.name),
    datasets: [
      {
        id: "outcome-converted",
        label: "계약",
        data: rows.map((row) => row.won),
      },
      {
        id: "outcome-lost",
        label: "실패",
        data: rows.map((row) => row.lost),
      },
      {
        id: "outcome-pending",
        label: "진행 중",
        data: rows.map((row) => row.pending),
      },
      {
        id: "outcome-disqualified",
        label: "제외",
        data: rows.map((row) => row.disqualified),
      },
    ],
  };
}

export function buildSampleProgressData(
  detail: ExperimentDetail,
): SampleProgressData {
  const rows = buildVariantResultRows(detail);
  const target = resolveTarget(detail);

  return {
    id: "sample-guardrail-progress",
    target,
    labels: rows.map((row) => row.name),
    datasets: [
      {
        id: "progress-earned",
        label: "확보",
        data: rows.map((row) => row.progressPercent),
      },
      {
        id: "progress-remaining",
        label: "남음",
        data: rows.map((row) => Math.max(100 - row.progressPercent, 0)),
      },
    ],
    samples: rows.map((row) => ({
      variantId: row.variantId,
      sample: row.sample,
      target,
    })),
  };
}

export function buildCumulativeTrendData(detail: ExperimentDetail): TrendChartData {
  const rows = buildVariantResultRows(detail);
  const snapshots = [...detail.snapshots].sort((left, right) =>
    left.recordedAt.localeCompare(right.recordedAt),
  );
  const labels = snapshots.map((snapshot) => snapshot.recordedAt.slice(0, 10));

  return {
    id: "cumulative-won-rate-trend",
    labels,
    datasets: rows.map((row) => ({
      id: `trend-${row.key}`,
      label: row.name,
      data: snapshots.map((snapshot) => {
        const metric = snapshot.variantMetrics.find(
          (candidate) => candidate.variantId === row.variantId,
        );

        if (metric?.wonRate === null || metric?.wonRate === undefined) {
          return null;
        }

        return Number((metric.wonRate * 100).toFixed(1));
      }),
    })),
  };
}

export function buildOverallMixData(detail: ExperimentDetail): OverallMixData {
  const totals = [
    detail.variantMetrics.reduce((acc, metric) => acc + metric.won, 0),
    detail.variantMetrics.reduce((acc, metric) => acc + metric.lost, 0),
    detail.variantMetrics.reduce((acc, metric) => acc + metric.pending, 0),
    detail.variantMetrics.reduce((acc, metric) => acc + metric.disqualified, 0),
  ];

  return {
    id: "overall-mix",
    labels: ["계약", "실패", "진행 중", "제외"],
    datasets: [{
      id: "overall-mix",
      label: "상담 결과",
      data: totals,
    }],
  };
}

export function buildNoDataSummary(detail: ExperimentDetail): NoDataSummary {
  return {
    id: "experiment-chart-no-data",
    hasVariantMetrics: detail.variantMetrics.length > 0,
    hasSnapshots: detail.snapshots.length > 0,
    message: "No variant metrics are available for chart rendering.",
  };
}

export function buildChartDataOptions({
  reducedMotion,
}: {
  reducedMotion: boolean;
}): ChartDataOptions {
  return {
    id: "chart-data-options",
    reducedMotion,
    animation: reducedMotion ? false : "default",
  };
}
