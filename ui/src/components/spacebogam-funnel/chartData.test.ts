import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";
import { describe, expect, it } from "vitest";
import { buildLossParetoRows } from "./chartData";

function report(stages: SpacebogamFunnelReport["stages"]): SpacebogamFunnelReport {
  return { stages } as SpacebogamFunnelReport;
}

describe("buildLossParetoRows", () => {
  it("ranks positive stage losses and computes cumulative loss share", () => {
    const rows = buildLossParetoRows(report([
      { key: "visit", label: "방문", count: 100, previousCount: null, conversionFromPrevious: null, dropOffCount: null, dropOffRate: null },
      { key: "engaged", label: "참여", count: 70, previousCount: 100, conversionFromPrevious: 0.7, dropOffCount: 30, dropOffRate: 0.3 },
      { key: "consultation", label: "상담 CTA 클릭", count: 20, previousCount: 70, conversionFromPrevious: 0.286, dropOffCount: 50, dropOffRate: 0.714 },
      { key: "lead", label: "상담 제출", count: 10, previousCount: 20, conversionFromPrevious: 0.5, dropOffCount: 10, dropOffRate: 0.5 },
    ]));

    expect(rows.map((row) => row.transition)).toEqual(["참여 → 상담 CTA 클릭", "방문 → 참여", "상담 CTA 클릭 → 상담 제출"]);
    expect(rows.map((row) => row.losses)).toEqual([50, 30, 10]);
    expect(rows.map((row) => row.cumulativeLossShare)).toEqual([50 / 90, 80 / 90, 1]);
  });

  it("excludes zero and negative drop-off counts from the loss Pareto", () => {
    const rows = buildLossParetoRows(report([
      { key: "visit", label: "방문", count: 100, previousCount: null, conversionFromPrevious: null, dropOffCount: null, dropOffRate: null },
      { key: "engaged", label: "참여", count: 100, previousCount: 100, conversionFromPrevious: 1, dropOffCount: 0, dropOffRate: 0 },
      { key: "consultation", label: "상담 CTA 클릭", count: 120, previousCount: 100, conversionFromPrevious: 1.2, dropOffCount: -20, dropOffRate: -0.2 },
      { key: "lead", label: "상담 제출", count: 80, previousCount: 120, conversionFromPrevious: 0.667, dropOffCount: 40, dropOffRate: 0.333 },
    ]));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ transition: "상담 CTA 클릭 → 상담 제출", losses: 40, cumulativeLossShare: 1 });
  });
});
