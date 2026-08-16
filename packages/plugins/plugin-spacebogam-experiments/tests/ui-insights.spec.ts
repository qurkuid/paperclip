import { describe, expect, it } from "vitest";

import { deriveInsights } from "../src/ui/insights.js";
import type { ExperimentDetail } from "../src/ui/types.js";

const baseDetail: ExperimentDetail = {
  experiment: {
    id: "experiment-1",
    companyId: "company-1",
    title: "상담 CTA",
    hypothesis: "구체적인 문구가 계약률을 높인다.",
    status: "running",
    minimumSamplePerVariant: 30,
    linkedIssueId: null,
    responsibleAgentId: null,
    version: 1,
    updatedAt: "2026-07-27T03:00:00.000Z",
  },
  variants: [
    {
      id: "variant-control",
      key: "control",
      name: "현재안",
      description: "",
      isControl: true,
      sortOrder: 0,
    },
    {
      id: "variant-challenger",
      key: "challenger",
      name: "개선안",
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
      sample: 10,
      won: 2,
      lost: 2,
      pending: 6,
      disqualified: 0,
      resolved: 4,
      wonRate: 0.5,
      absoluteDeltaFromControl: 0,
      relativeLiftFromControl: 0,
    },
    {
      variantId: "variant-challenger",
      key: "challenger",
      isControl: false,
      sample: 10,
      won: 3,
      lost: 1,
      pending: 6,
      disqualified: 0,
      resolved: 4,
      wonRate: 0.75,
      absoluteDeltaFromControl: 0.25,
      relativeLiftFromControl: 0.5,
    },
  ],
  snapshots: [],
  recentObservations: [],
};

describe("experiment insight derivation", () => {
  it("prioritizes sample and pending-result bottlenecks", () => {
    const insights = deriveInsights(baseDetail);

    expect(insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "표본 수집", tone: "warning" }),
      expect.objectContaining({ label: "데이터 병목", tone: "critical" }),
      expect.objectContaining({ label: "운영 연결" }),
      expect.objectContaining({ label: "의사결정 연결" }),
    ]));
  });

  it("identifies a positive challenger after minimum sample is reached", () => {
    const detail = {
      ...baseDetail,
      experiment: {
        ...baseDetail.experiment,
        linkedIssueId: "issue-1",
        responsibleAgentId: "agent-1",
      },
      variantMetrics: baseDetail.variantMetrics.map((metric) => ({
        ...metric,
        sample: 30,
        pending: 0,
      })),
    };

    expect(deriveInsights(detail)[0]).toMatchObject({
      label: "핵심 결과",
      tone: "positive",
    });
  });
});
