import { describe, expect, it } from "vitest";

import { buildVariantResultRows } from "../src/ui/chart-data.js";
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
});
