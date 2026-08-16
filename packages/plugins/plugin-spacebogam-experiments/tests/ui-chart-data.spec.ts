import { describe, expect, it } from "vitest";

import {
  buildComparisonBarData,
  buildChartDataOptions,
  buildCumulativeTrendData,
  buildNoDataSummary,
  buildSampleProgressData,
  buildVariantResultRows,
} from "../src/ui/chart-data.js";
import type { ExperimentDetail } from "../src/ui/types.js";

const detail: ExperimentDetail = {
  experiment: {
    id: "experiment-1",
    companyId: "company-1",
    title: "상담 CTA",
    hypothesis: "다음 단계를 명확히 안내한다.",
    status: "running",
    minimumSamplePerVariant: 30,
    version: 1,
    updatedAt: "2026-07-27T03:00:00.000Z",
  },
  variants: [
    {
      id: "variant-control",
      key: "control",
      name: "기존 CTA",
      description: "",
      isControl: true,
      sortOrder: 0,
    },
    {
      id: "variant-treatment",
      key: "clear-next-step",
      name: "다음 단계 명확화",
      description: "",
      isControl: false,
      sortOrder: 1,
    },
  ],
  variantMetrics: [
    {
      variantId: "variant-control",
      key: "control",
      isControl: true,
      sample: 15,
      won: 2,
      lost: 3,
      pending: 9,
      disqualified: 1,
      resolved: 5,
      wonRate: 0.4,
      absoluteDeltaFromControl: 0,
      relativeLiftFromControl: 0,
    },
    {
      variantId: "variant-treatment",
      key: "clear-next-step",
      isControl: false,
      sample: 36,
      won: 4,
      lost: 4,
      pending: 27,
      disqualified: 1,
      resolved: 8,
      wonRate: 0.5,
      absoluteDeltaFromControl: 0.1,
      relativeLiftFromControl: 0.25,
    },
  ],
  snapshots: [],
  recentObservations: [],
};

describe("experiment chart data", () => {
  it("characterizes current variant result rows with exact table inputs", () => {
    expect(buildVariantResultRows(detail)).toEqual([
      {
        variantId: "variant-control",
        key: "control",
        name: "기존 CTA",
        isControl: true,
        target: 30,
        sample: 15,
        won: 2,
        lost: 3,
        pending: 9,
        disqualified: 1,
        resolved: 5,
        wonRate: 0.4,
        progressPercent: 50,
      },
      {
        variantId: "variant-treatment",
        key: "clear-next-step",
        name: "다음 단계 명확화",
        isControl: false,
        target: 30,
        sample: 36,
        won: 4,
        lost: 4,
        pending: 27,
        disqualified: 1,
        resolved: 8,
        wonRate: 0.5,
        progressPercent: 100,
      },
    ]);
  });

  it("builds named rows from the same variant metrics used by charts", () => {
    // Given
    const expectedNames = ["기존 CTA", "다음 단계 명확화"];

    // When
    const rows = buildVariantResultRows(detail);

    // Then
    expect(rows.map((row) => row.name)).toEqual(expectedNames);
    expect(rows[0]).toMatchObject({
      sample: 15,
      resolved: 5,
      wonRate: 0.4,
    });
  });

  it("caps displayed sample progress while preserving the actual sample", () => {
    // Given
    const target = detail.experiment.minimumSamplePerVariant;

    // When
    const rows = buildVariantResultRows(detail);

    // Then
    expect(rows.map((row) => ({
      sample: row.sample,
      target,
      progressPercent: row.progressPercent,
    }))).toEqual([
      { sample: 15, target: 30, progressPercent: 50 },
      { sample: 36, target: 30, progressPercent: 100 },
    ]);
  });

  it("builds stable comparison bar datasets with table row parity", () => {
    const rows = buildVariantResultRows(detail);

    expect(buildComparisonBarData(rows)).toEqual({
      id: "variant-outcome-comparison",
      labels: ["기존 CTA", "다음 단계 명확화"],
      datasets: [
        {
          id: "outcome-converted",
          label: "계약",
          data: [2, 4],
        },
        {
          id: "outcome-lost",
          label: "실패",
          data: [3, 4],
        },
        {
          id: "outcome-pending",
          label: "진행 중",
          data: [9, 27],
        },
        {
          id: "outcome-disqualified",
          label: "제외",
          data: [1, 1],
        },
      ],
    });
  });

  it("builds sample and guardrail progress data without losing actual sample counts", () => {
    expect(buildSampleProgressData(detail)).toEqual({
      id: "sample-guardrail-progress",
      target: 30,
      labels: ["기존 CTA", "다음 단계 명확화"],
      datasets: [
        {
          id: "progress-earned",
          label: "확보",
          data: [50, 100],
        },
        {
          id: "progress-remaining",
          label: "남음",
          data: [50, 0],
        },
      ],
      samples: [
        { variantId: "variant-control", sample: 15, target: 30 },
        { variantId: "variant-treatment", sample: 36, target: 30 },
      ],
    });
  });

  it("sorts cumulative trend snapshots and keeps deterministic variant dataset ids", () => {
    const trendDetail: ExperimentDetail = {
      ...detail,
      snapshots: [
        {
          id: "snapshot-later",
          recordedAt: "2026-07-27T00:00:00.000Z",
          variantMetrics: [
            { ...detail.variantMetrics[0], sample: 20, wonRate: 0.5 },
            { ...detail.variantMetrics[1], sample: 24, wonRate: null },
          ],
          funnelDataThrough: null,
          funnelQuality: null,
          source: "manual",
        },
        {
          id: "snapshot-earlier",
          recordedAt: "2026-07-26T00:00:00.000Z",
          variantMetrics: [
            { ...detail.variantMetrics[0], sample: 10, wonRate: 0.2 },
            { ...detail.variantMetrics[1], sample: 12, wonRate: 0.25 },
          ],
          funnelDataThrough: null,
          funnelQuality: null,
          source: "manual",
        },
      ],
    };

    expect(buildCumulativeTrendData(trendDetail)).toEqual({
      id: "cumulative-won-rate-trend",
      labels: ["2026-07-26", "2026-07-27"],
      datasets: [
        {
          id: "trend-control",
          label: "기존 CTA",
          data: [20, 50],
        },
        {
          id: "trend-clear-next-step",
          label: "다음 단계 명확화",
          data: [25, null],
        },
      ],
    });
  });

  it("returns a no-data summary for empty metric input", () => {
    expect(buildNoDataSummary({ ...detail, variantMetrics: [] })).toEqual({
      id: "experiment-chart-no-data",
      hasVariantMetrics: false,
      hasSnapshots: false,
      message: "No variant metrics are available for chart rendering.",
    });
  });

  it("builds explicit reduced-motion data options", () => {
    expect(buildChartDataOptions({ reducedMotion: true })).toEqual({
      id: "chart-data-options",
      reducedMotion: true,
      animation: false,
    });
    expect(buildChartDataOptions({ reducedMotion: false })).toEqual({
      id: "chart-data-options",
      reducedMotion: false,
      animation: "default",
    });
  });

  it("handles malformed zero targets and missing variant names safely", () => {
    const malformed: ExperimentDetail = {
      ...detail,
      experiment: { ...detail.experiment, minimumSamplePerVariant: 0 },
      variants: [],
      variantMetrics: [
        {
          ...detail.variantMetrics[0],
          variantId: "variant-missing",
          key: "missing-name",
          sample: 5,
        },
      ],
    };

    expect(buildVariantResultRows(malformed)).toMatchObject([
      {
        variantId: "variant-missing",
        name: "missing-name",
        target: 0,
        progressPercent: 0,
      },
    ]);
    expect(buildSampleProgressData(malformed).target).toBe(0);
  });
});
