import { describe, expect, it } from "vitest";
import { buildExperimentProjection } from "../src/analytics.js";
import type { ExperimentOutcome } from "../src/contracts/index.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const EXPERIMENT_ID = "22222222-2222-4222-8222-222222222222";
const CONTROL_ID = "33333333-3333-4333-8333-333333333333";
const TREATMENT_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-27T03:00:00.000Z";
const RECENT = "2026-07-26T03:00:00.000Z";
const OLD = "2026-07-18T03:00:00.000Z";

const experiment = {
  id: EXPERIMENT_ID,
  companyId: COMPANY_ID,
  title: "상담 전환 CTA 실험",
  hypothesis: "상담 요청 버튼 문구가 계약 전환율을 개선한다.",
  status: "running",
  primaryMetric: "won_rate",
  minimumSamplePerVariant: 30,
  guardrailMetric: null,
  version: 1,
  updatedAt: RECENT,
} as const;

const variants = [
  {
    id: CONTROL_ID,
    companyId: COMPANY_ID,
    experimentId: EXPERIMENT_ID,
    key: "control",
    name: "기존 문구",
    description: "",
    isControl: true,
    sortOrder: 0,
  },
  {
    id: TREATMENT_ID,
    companyId: COMPANY_ID,
    experimentId: EXPERIMENT_ID,
    key: "variant-a",
    name: "신규 문구",
    description: "",
    isControl: false,
    sortOrder: 1,
  },
] as const;

function entry(id: number, variantId: string, outcome: ExperimentOutcome) {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(id).padStart(12, "0")}`,
    companyId: COMPANY_ID,
    experimentId: EXPERIMENT_ID,
    variantId,
    leadKeyHash: `sha256:${id}`,
    outcome,
    enteredAt: RECENT,
    outcomeAt: outcome === "pending" ? null : RECENT,
    version: 1,
  } as const;
}

function entriesFor(variantId: string, won: number, lost: number, pending = 0, disqualified = 0) {
  const entries = [];
  let id = variantId === CONTROL_ID ? 1 : 1000;
  for (let index = 0; index < won; index += 1) {
    entries.push(entry(id, variantId, "won"));
    id += 1;
  }
  for (let index = 0; index < lost; index += 1) {
    entries.push(entry(id, variantId, "lost"));
    id += 1;
  }
  for (let index = 0; index < pending; index += 1) {
    entries.push(entry(id, variantId, "pending"));
    id += 1;
  }
  for (let index = 0; index < disqualified; index += 1) {
    entries.push(entry(id, variantId, "disqualified"));
    id += 1;
  }
  return entries;
}

describe("Spacebogam experiment analytics", () => {
  it("returns collecting at 29 samples and directional review at 30 samples", () => {
    // Given
    const belowMinimum = [
      ...entriesFor(CONTROL_ID, 10, 20),
      ...entriesFor(TREATMENT_ID, 10, 19),
    ];
    const atMinimum = [
      ...entriesFor(CONTROL_ID, 10, 20),
      ...entriesFor(TREATMENT_ID, 10, 20),
    ];

    // When
    const collecting = buildExperimentProjection({ experiment, variants, entries: belowMinimum, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });
    const directional = buildExperimentProjection({ experiment, variants, entries: atMinimum, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });

    // Then
    expect(collecting.readiness).toBe("collecting");
    expect(directional.readiness).toBe("directional_review");
  });

  it("uses one sample as the inclusive minimum sample boundary", () => {
    // Given
    const minimumOne = { ...experiment, minimumSamplePerVariant: 1 } as const;
    const belowMinimum = entriesFor(CONTROL_ID, 1, 0);
    const atMinimum = [
      ...entriesFor(CONTROL_ID, 1, 0),
      ...entriesFor(TREATMENT_ID, 0, 1),
    ];

    // When
    const collecting = buildExperimentProjection({ experiment: minimumOne, variants, entries: belowMinimum, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });
    const directional = buildExperimentProjection({ experiment: minimumOne, variants, entries: atMinimum, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });

    // Then
    expect(collecting.readiness).toBe("collecting");
    expect(directional.readiness).toBe("directional_review");
  });

  it("returns recorded for completed experiments", () => {
    // Given
    const completed = { ...experiment, status: "completed" } as const;

    // When
    const projection = buildExperimentProjection({ experiment: completed, variants, entries: entriesFor(CONTROL_ID, 30, 0), observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });

    // Then
    expect(projection.readiness).toBe("recorded");
  });

  it("prioritizes recorded when completed even if funnel/staleness conditions exist", () => {
    // Given
    const completed = {
      ...experiment,
      status: "completed",
      updatedAt: OLD,
    } as const;
    const entries = [...entriesFor(CONTROL_ID, 10, 20), ...entriesFor(TREATMENT_ID, 12, 18)];

    // When
    const projection = buildExperimentProjection({
      experiment: completed,
      variants,
      entries,
      observations: [],
      currentTime: NOW,
      funnel: { quality: "empty", dataThrough: OLD, generatedAt: OLD },
    });

    // Then
    expect(projection.readiness).toBe("recorded");
  });

  it("returns measurement attention for stale funnel state", () => {
    // Given
    const entries = [...entriesFor(CONTROL_ID, 10, 20), ...entriesFor(TREATMENT_ID, 12, 18)];

    // When
    const projection = buildExperimentProjection({ experiment, variants, entries, observations: [], currentTime: NOW, funnel: { quality: "stale", dataThrough: OLD, generatedAt: OLD } });

    // Then
    expect(projection.readiness).toBe("measurement_attention");
  });

  it("prioritizes sample collection before funnel and stale-record attention", () => {
    // Given
    const staleExperiment = { ...experiment, updatedAt: OLD } as const;
    const entries = [
      ...entriesFor(CONTROL_ID, 10, 20),
      ...entriesFor(TREATMENT_ID, 10, 19),
    ];

    // When
    const projection = buildExperimentProjection({ experiment: staleExperiment, variants, entries, observations: [], currentTime: NOW, funnel: { quality: "stale", dataThrough: OLD, generatedAt: OLD } });

    // Then
    expect(projection.readiness).toBe("collecting");
  });

  it("prioritizes funnel measurement attention before stale experiment records", () => {
    // Given
    const staleExperiment = { ...experiment, updatedAt: OLD } as const;
    const entries = [...entriesFor(CONTROL_ID, 10, 20), ...entriesFor(TREATMENT_ID, 12, 18)];

    // When
    const projection = buildExperimentProjection({ experiment: staleExperiment, variants, entries, observations: [], currentTime: NOW, funnel: { quality: "stale", dataThrough: OLD, generatedAt: OLD } });

    // Then
    expect(projection.readiness).toBe("measurement_attention");
  });

  it("returns record stale when latest experiment record is older than seven days", () => {
    // Given
    const staleExperiment = { ...experiment, updatedAt: OLD } as const;
    const entries = [...entriesFor(CONTROL_ID, 10, 20), ...entriesFor(TREATMENT_ID, 12, 18)];

    // When
    const projection = buildExperimentProjection({ experiment: staleExperiment, variants, entries, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });

    // Then
    expect(projection.readiness).toBe("record_stale");
  });

  it("returns null relative lift when the control denominator is zero", () => {
    // Given
    const entries = [...entriesFor(CONTROL_ID, 0, 0, 30), ...entriesFor(TREATMENT_ID, 10, 20)];

    // When
    const projection = buildExperimentProjection({ experiment, variants, entries, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });

    // Then
    expect(projection.variantMetrics[0]?.wonRate).toBeNull();
    expect(projection.variantMetrics[1]?.relativeLiftFromControl).toBeNull();
  });

  it("excludes pending and disqualified outcomes from resolved denominator", () => {
    // Given
    const entries = [
      ...entriesFor(CONTROL_ID, 10, 10, 5, 5),
      ...entriesFor(TREATMENT_ID, 15, 5, 5, 5),
    ];

    // When
    const projection = buildExperimentProjection({ experiment, variants, entries, observations: [], currentTime: NOW, funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW } });

    // Then
    expect(projection.variantMetrics[0]?.sample).toBe(30);
    expect(projection.variantMetrics[0]?.resolved).toBe(20);
    expect(projection.variantMetrics[0]?.wonRate).toBe(0.5);
    expect(projection.variantMetrics[0]?.pending).toBe(5);
    expect(projection.variantMetrics[0]?.disqualified).toBe(5);
  });

  it("rejects malformed funnel quality before producing a projection", () => {
    // Given
    const entries = [...entriesFor(CONTROL_ID, 10, 20), ...entriesFor(TREATMENT_ID, 12, 18)];

    // Then
    expect(() =>
      buildExperimentProjection({
        experiment,
        variants,
        entries,
        observations: [],
        currentTime: NOW,
        funnel: { quality: "unknown", dataThrough: NOW, generatedAt: NOW },
      }),
    ).toThrow();
  });

  it("rejects malformed current time before stale-record comparison", () => {
    // Given
    const entries = [...entriesFor(CONTROL_ID, 10, 20), ...entriesFor(TREATMENT_ID, 12, 18)];

    // Then
    expect(() =>
      buildExperimentProjection({
        experiment,
        variants,
        entries,
        observations: [],
        currentTime: "not-a-date",
        funnel: { quality: "ready", dataThrough: NOW, generatedAt: NOW },
      }),
    ).toThrow();
  });
});
