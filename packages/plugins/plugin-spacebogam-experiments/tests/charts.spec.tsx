import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ExperimentCharts } from "../src/ui/charts.js";
import { VariantResultsTable } from "../src/ui/variant-results-table.js";
import { buildVariantResultRows } from "../src/ui/chart-data.js";
import type { ExperimentDetail, Snapshot, Variant, VariantMetric } from "../src/ui/types.js";

type ChartCall = {
  data: {
    labels: readonly string[];
    datasets: Array<{
      id?: string;
      data: Array<number | null>;
      label?: string;
    }>;
  };
  options?: {
    animation?: boolean | object;
  };
};

const chartCalls = {
  bar: [] as ChartCall[],
  doughnut: [] as ChartCall[],
  line: [] as ChartCall[],
};

vi.mock("react-chartjs-2", () => ({
  Bar: (props: unknown) => {
    chartCalls.bar.push(props as ChartCall);
    return <div data-chart="bar" />;
  },
  Doughnut: (props: unknown) => {
    chartCalls.doughnut.push(props as ChartCall);
    return <div data-chart="doughnut" />;
  },
  Line: (props: unknown) => {
    chartCalls.line.push(props as ChartCall);
    return <div data-chart="line" />;
  },
}));

function fixtureRows(): [Variant[], VariantMetric[]] {
  const variants: Variant[] = [
    {
      id: "variant-control",
      key: "control",
      name: "기준안",
      description: "",
      isControl: true,
      sortOrder: 0,
    },
    {
      id: "variant-treatment",
      key: "treatment",
      name: "실험안",
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
      lost: 4,
      pending: 5,
      disqualified: 1,
      resolved: 6,
      wonRate: 0.2,
      absoluteDeltaFromControl: 0,
      relativeLiftFromControl: 0,
    },
    {
      variantId: "variant-treatment",
      key: "treatment",
      isControl: false,
      sample: 35,
      won: 11,
      lost: 7,
      pending: 8,
      disqualified: 1,
      resolved: 18,
      wonRate: 0.55,
      absoluteDeltaFromControl: 0.35,
      relativeLiftFromControl: 1.75,
    },
  ];

  return [variants, metrics];
}

function detail(overrides: Partial<ExperimentDetail> = {}): ExperimentDetail {
  const [variants, variantMetrics] = fixtureRows();

  return {
    experiment: {
      id: "experiment-1",
      companyId: "company-1",
      title: "실험 제목",
      hypothesis: "가설",
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

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: "snapshot-1",
    recordedAt: "2026-07-27T09:00:00.000Z",
    variantMetrics: [],
    funnelDataThrough: null,
    funnelQuality: null,
    source: "manual",
    ...overrides,
  };
}

describe("experiment charts and table", () => {
  beforeEach(() => {
    chartCalls.bar = [];
    chartCalls.doughnut = [];
    chartCalls.line = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses stable ids and reduced-motion-safe chart options", () => {
    const rows = buildVariantResultRows(detail());

    renderToStaticMarkup(
      <>
        <ExperimentCharts detail={detail()} />
        <VariantResultsTable detail={detail()} />
      </>,
    );

    expect(rows.map((row) => row.sample)).toEqual([15, 35]);
    expect(rows[0]?.progressPercent).toBe(50);
    expect(rows[1]?.progressPercent).toBe(100);
    expect(chartCalls.bar).toHaveLength(2);
    expect(chartCalls.bar[0].data.datasets.map((dataset) => dataset.id)).toEqual([
      "outcome-converted",
      "outcome-lost",
      "outcome-pending",
      "outcome-disqualified",
    ]);
    const sampleDatasetIds = chartCalls.bar[1].data.datasets.map((dataset) => dataset.id);
    expect(sampleDatasetIds.slice(0, 2)).toEqual([
      "progress-earned",
      "progress-remaining",
    ]);
    if (sampleDatasetIds.length > 2) {
      expect(sampleDatasetIds.slice(2)).toEqual(["guardrail-disqualified"]);
    }
    expect(chartCalls.bar.every((entry) => entry.options?.animation === false)).toBe(true);
    expect(chartCalls.doughnut).toHaveLength(1);
    expect(chartCalls.doughnut[0].data.datasets.map((dataset) => dataset.id)).toEqual([
      "overall-mix",
    ]);
  });

  it("renders no-data placeholder when variant metrics are absent", () => {
    const empty = detail({ variants: [], variantMetrics: [], snapshots: [] });

    const markup = renderToStaticMarkup(<ExperimentCharts detail={empty} />);

    expect(chartCalls.bar).toHaveLength(0);
    expect(markup).toContain("비교 가능한 표본이 아직 없습니다");
    expect(markup).toContain("데이터가 없습니다");
  });

  it("renders trend with null gaps and stable dataset ids", () => {
    const withGap = detail({
      snapshots: [
        snapshot({
          id: "snap-a",
          variantMetrics: [
            {
              variantId: "variant-control",
              key: "control",
              isControl: true,
              sample: 20,
              won: 3,
              lost: 6,
              pending: 7,
              disqualified: 4,
              resolved: 9,
              wonRate: 0.2,
              absoluteDeltaFromControl: 0,
              relativeLiftFromControl: 0,
            },
          ],
        }),
      ],
    });

    renderToStaticMarkup(<ExperimentCharts detail={withGap} />);

    expect(chartCalls.line).toHaveLength(1);
    expect(chartCalls.line[0].data.datasets.map((dataset) => dataset.id).sort()).toEqual(["trend-control", "trend-treatment"]);
    expect(chartCalls.line[0].data.datasets.find((dataset) => dataset.id === "trend-control")?.data).toEqual([20]);
    expect(chartCalls.line[0].data.datasets.find((dataset) => dataset.id === "trend-treatment")?.data).toEqual([null]);
  });

  it("keeps accessible chart labels and table values in parity with static variant text", () => {
    const staticText = '<script>alert("x")</script> 실험안';
    const withStaticText = detail({
      variants: [
        {
          id: "variant-control",
          key: "control",
          name: "기준안",
          description: "",
          isControl: true,
          sortOrder: 0,
        },
        {
          id: "variant-treatment",
          key: "treatment",
          name: staticText,
          description: "",
          isControl: false,
          sortOrder: 1,
        },
      ],
    });
    const rows = buildVariantResultRows(withStaticText);

    const markup = renderToStaticMarkup(
      <>
        <ExperimentCharts detail={withStaticText} />
        <VariantResultsTable detail={withStaticText} />
      </>,
    );

    expect(markup).toContain('aria-label="실험 성과 차트"');
    expect(markup).toContain('aria-label="그룹 계약 전환 비교 막대 차트"');
    expect(markup).toContain('aria-label="표본 및 guardrail 진행 막대 차트"');
    expect(markup).toContain('aria-labelledby="sbe-result-table-title"');
    expect(markup).toContain('aria-label="수치 비교"');
    expect(markup).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; 실험안");
    expect(markup).not.toContain("<script>");
    expect(chartCalls.bar[0].data.labels).toEqual(rows.map((row) => row.name));
    expect(chartCalls.bar[1].data.labels).toEqual(rows.map((row) => row.name));
    expect(chartCalls.bar[0].data.datasets[0]?.data).toEqual(rows.map((row) => row.won));
    expect(chartCalls.bar[1].data.datasets[0]?.data).toEqual(rows.map((row) => row.progressPercent));
    expect(rows.map((row) => `${row.sample}/${row.target}`)).toEqual(["15/30", "35/30"]);
  });

  it("trims trend to latest 12 points and preserves order", () => {
    const snapshots = Array.from({ length: 13 }, (_, index) =>
      snapshot({
        id: `snap-${index + 1}`,
        recordedAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        variantMetrics: [
          {
            variantId: "variant-control",
            key: "control",
            isControl: true,
            sample: 10 + index,
            won: index,
            lost: 5,
            pending: 2,
            disqualified: 1,
            resolved: 7,
            wonRate: 0.1 + index * 0.001,
            absoluteDeltaFromControl: 0,
            relativeLiftFromControl: 0,
          },
          {
            variantId: "variant-treatment",
            key: "treatment",
            isControl: false,
            sample: 10 + index,
            won: 5 + index,
            lost: 2,
            pending: 1,
            disqualified: 0,
            resolved: 8,
            wonRate: 0.2 + index * 0.001,
            absoluteDeltaFromControl: 0.05,
            relativeLiftFromControl: 0.1,
          },
        ],
      }),
    );

    renderToStaticMarkup(<ExperimentCharts detail={detail({ snapshots })} />);

    expect(chartCalls.line).toHaveLength(1);
    expect(chartCalls.line[0].data.labels).toHaveLength(12);
    expect(chartCalls.line[0].data.labels.at(0)).toBe("2026-07-02");
    expect(chartCalls.line[0].data.labels.at(-1)).toBe("2026-07-13");
  });

  it("handles malformed inputs without crashing while preserving fallback names", () => {
    const malformed = detail({
      variants: [
        {
          id: "variant-control",
          key: "control",
          name: "기준안",
          description: "",
          isControl: true,
          sortOrder: 0,
        },
      ],
      variantMetrics: [
        {
          variantId: "ghost",
          key: "ghost",
          isControl: false,
          sample: 1,
          won: 1,
          lost: 0,
          pending: 0,
          disqualified: 0,
          resolved: 1,
          wonRate: 1,
          absoluteDeltaFromControl: 0,
          relativeLiftFromControl: 0,
        },
        {
          variantId: "variant-control",
          key: "control",
          isControl: true,
          sample: 2,
          won: 0,
          lost: 0,
          pending: 1,
          disqualified: 1,
          resolved: 0,
          wonRate: 0,
          absoluteDeltaFromControl: 0,
          relativeLiftFromControl: 0,
        },
      ],
    });

    const rows = buildVariantResultRows(malformed);
    const markup = renderToStaticMarkup(
      <>
        <ExperimentCharts detail={malformed} />
        <VariantResultsTable detail={malformed} />
      </>,
    );

    expect(rows.map((row) => row.name)).toEqual(["ghost", "기준안"]);
    expect(markup).toContain("변형별 수치 비교");
    expect(markup).toContain("ghost");
  });
});
