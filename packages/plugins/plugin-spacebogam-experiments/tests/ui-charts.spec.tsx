// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildVariantResultRows } from "../src/ui/chart-data.js";
import { ExperimentCharts } from "../src/ui/charts.js";
import type {
  ExperimentDetail,
  Snapshot,
  Variant,
  VariantMetric,
} from "../src/ui/types.js";
import { VariantResultsTable } from "../src/ui/variant-results-table.js";

type Dataset = {
  id?: string;
  label?: string;
  data: Array<number | null>;
};

type ChartCall = {
  data: {
    labels: readonly string[];
    datasets: Dataset[];
  };
  options: {
    animation?: false;
    indexAxis?: "x" | "y";
    scales?: unknown;
    plugins?: {
      legend?: {
        position?: string;
      };
    };
  };
};

const chartCalls = vi.hoisted(() => ({
  bar: [] as ChartCall[],
  line: [] as ChartCall[],
  doughnut: [] as ChartCall[],
}));

vi.mock("react-chartjs-2", () => ({
  Bar: (props: ChartCall) => {
    chartCalls.bar.push(props);
    return <canvas data-chart="bar" />;
  },
  Line: (props: ChartCall) => {
    chartCalls.line.push(props);
    return <canvas data-chart="line" />;
  },
  Doughnut: (props: ChartCall) => {
    chartCalls.doughnut.push(props);
    return <canvas data-chart="doughnut" />;
  },
}));

function fixedVariantMetrics(): [Variant[], VariantMetric[]] {
  const variants: Variant[] = [
    {
      id: "variant-control",
      key: "control",
      name: "기존 문구",
      description: "",
      isControl: true,
      sortOrder: 0,
    },
    {
      id: "variant-clean",
      key: "clean",
      name: "개선 문구",
      description: "",
      isControl: false,
      sortOrder: 1,
    },
  ];

  const metrics: VariantMetric[] = [
    {
      variantId: "variant-control",
      key: "control",
      isControl: true,
      sample: 15,
      won: 2,
      lost: 5,
      pending: 2,
      disqualified: 1,
      resolved: 7,
      wonRate: 0.2857,
      absoluteDeltaFromControl: 0,
      relativeLiftFromControl: 0,
    },
    {
      variantId: "variant-clean",
      key: "clean",
      isControl: false,
      sample: 30,
      won: 10,
      lost: 8,
      pending: 12,
      disqualified: 0,
      resolved: 18,
      wonRate: 0.5556,
      absoluteDeltaFromControl: 0.27,
      relativeLiftFromControl: 0.94,
    },
  ];

  return [variants, metrics];
}

function detail(overrides: Partial<ExperimentDetail> = {}): ExperimentDetail {
  const [variants, variantMetrics] = fixedVariantMetrics();

  return {
    experiment: {
      id: "experiment-1",
      companyId: "company-1",
      title: "문구 테스트",
      hypothesis: "문구 변경으로 계약률이 올라간다",
      status: "running",
      minimumSamplePerVariant: 30,
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    variants,
    variantMetrics,
    snapshots: [],
    recentObservations: [],
    ...overrides,
  };
}

function snapshotForTrend(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: "snap-1",
    recordedAt: "2026-07-27T12:00:00.000Z",
    variantMetrics: [
      {
        variantId: "variant-control",
        key: "control",
        isControl: true,
        sample: 20,
        won: 3,
        lost: 8,
        pending: 5,
        disqualified: 0,
        resolved: 11,
        wonRate: 0.2727,
        absoluteDeltaFromControl: 0,
        relativeLiftFromControl: 0,
      },
      {
        variantId: "variant-clean",
        key: "clean",
        isControl: false,
        sample: 25,
        won: 9,
        lost: 10,
        pending: 6,
        disqualified: 2,
        resolved: 19,
        wonRate: 0.45,
        absoluteDeltaFromControl: 0.17,
        relativeLiftFromControl: 0.57,
      },
    ],
    funnelDataThrough: null,
    funnelQuality: null,
    source: "manual",
    ...overrides,
  };
}

describe("experiment charts and accessible table parity", () => {
  beforeEach(() => {
    chartCalls.bar = [];
    chartCalls.line = [];
    chartCalls.doughnut = [];
  });

  it("characterizes current variant rows used by charts and the table", () => {
    const rows = buildVariantResultRows(detail());
    const markup = renderToStaticMarkup(<VariantResultsTable detail={detail()} />);

    expect(rows.map((row) => row.name)).toEqual(["기존 문구", "개선 문구"]);
    expect(rows.map((row) => row.sample)).toEqual([15, 30]);
    expect(rows.map((row) => row.progressPercent)).toEqual([50, 100]);
    expect(markup).toContain("변형별 수치 비교");
    expect(markup).toContain("<strong>15</strong> / 30");
    expect(markup).toContain("55.6%");
  });

  it("renders comparison, cumulative trend, and sample guardrail charts with accessible summaries", () => {
    const [, metricRows] = fixedVariantMetrics();
    const detailWithTrend = detail({
      snapshots: [
        snapshotForTrend({
          id: "snap-early",
          recordedAt: "2026-07-26T12:00:00.000Z",
        }),
        snapshotForTrend({
          id: "snap-late",
          recordedAt: "2026-07-27T12:00:00.000Z",
          variantMetrics: [
            {
              ...metricRows[0]!,
            },
            {
              ...metricRows[1],
              sample: 24,
              won: 4,
              lost: 8,
              resolved: 12,
              wonRate: 0.3333,
            },
          ],
        }),
      ],
    });

    const markup = renderToStaticMarkup(<ExperimentCharts detail={detailWithTrend} />);

    expect(markup).toContain("그룹 계약 전환 비교");
    expect(markup).toContain("표본·guardrail 진행");
    expect(markup).toContain("누적 전환 추세");
    expect(markup).toContain('aria-label="그룹 계약 전환 비교 막대 차트"');
    expect(markup).toContain('aria-label="표본 및 guardrail 진행 막대 차트"');
    expect(markup).toContain('aria-label="누적 전환 추세 선 차트"');
    expect(chartCalls.bar[0].data.labels).toEqual(["기존 문구", "개선 문구"]);
    expect(chartCalls.bar[1].data.labels).toEqual(["기존 문구", "개선 문구"]);

    expect(chartCalls.bar).toHaveLength(2);
    expect(chartCalls.bar[0].data.datasets.map((dataset) => dataset.id)).toEqual([
      "outcome-converted",
      "outcome-lost",
      "outcome-pending",
      "outcome-disqualified",
    ]);
    expect(chartCalls.bar[1].data.datasets.map((dataset) => dataset.id)).toEqual([
      "progress-earned",
      "progress-remaining",
      "guardrail-disqualified",
    ]);
    expect(chartCalls.line).toHaveLength(1);
    expect(chartCalls.line[0].data.datasets.map((dataset) => dataset.id).sort()).toEqual([
      "trend-clean",
      "trend-control",
    ]);
    expect(chartCalls.bar.every((call) => call.options.animation === false)).toBe(true);
    expect(chartCalls.line.every((call) => call.options.animation === false)).toBe(true);
    expect(chartCalls.bar[1].options.indexAxis).toBe("y");
    expect(chartCalls.bar[1].options.scales).toBeTruthy();
    expect(chartCalls.line[0].options.scales).toBeTruthy();
  });

  it("keeps the accessible table in parity with chart rows and renders injected names as inert text", () => {
    const unsafeName = '<script>alert("x")</script> 개선안';
    const [variants, variantMetrics] = fixedVariantMetrics();
    const unsafeDetail = detail({
      variants: [
        variants[0],
        {
          ...variants[1],
          name: unsafeName,
        },
      ],
      variantMetrics,
    });

    const tableMarkup = renderToStaticMarkup(<VariantResultsTable detail={unsafeDetail} />);
    const chartMarkup = renderToStaticMarkup(<ExperimentCharts detail={unsafeDetail} />);

    expect(tableMarkup).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; 개선안");
    expect(tableMarkup).not.toContain("<script>");
    expect(chartMarkup).not.toContain("<script>");
    expect(tableMarkup).toContain("계약");
  });

  it("renders no-data chart and table states without mounting Chart.js", () => {
    const empty = detail({
      variants: [],
      variantMetrics: [],
      snapshots: [],
    });

    const chartMarkup = renderToStaticMarkup(<ExperimentCharts detail={empty} />);
    const tableMarkup = renderToStaticMarkup(<VariantResultsTable detail={empty} />);

    expect(chartCalls.bar).toHaveLength(0);
    expect(chartCalls.line).toHaveLength(0);
    expect(chartMarkup).toContain("비교 가능한 표본이 아직 없습니다");
    expect(chartMarkup).toContain('role="img"');
    expect(chartMarkup).toContain("데이터가 없습니다");
    expect(tableMarkup).toContain("아직 비교할 변형 수치가 없습니다.");
  });
});
