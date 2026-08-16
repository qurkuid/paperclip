import { describe, expect, it } from "vitest";
import {
  entryInputSchema,
  actionPayloadEntrySchema,
  boardActionInputSchema,
  ENTRY_PII_FIELD_KEYS,
  errorResponseSchema,
  toolInputSchema,
  experimentProjectionSchema,
  experimentSchema,
  lifecycleTransitionSchema,
  persistedEntrySchema,
  variantSchema,
} from "../src/contracts/index.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const EXPERIMENT_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const ENTRY_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-27T03:00:00.000Z";

const validExperiment = {
  id: EXPERIMENT_ID,
  companyId: COMPANY_ID,
  title: "상담 전환 CTA 실험",
  hypothesis: "상담 요청 버튼 문구가 계약 전환율을 개선한다.",
  status: "running",
  primaryMetric: "won_rate",
  minimumSamplePerVariant: 30,
  guardrailMetric: "disqualification_rate",
  version: 1,
  updatedAt: NOW,
} as const;

const validVariant = {
  id: VARIANT_ID,
  companyId: COMPANY_ID,
  experimentId: EXPERIMENT_ID,
  key: "control",
  name: "기존 문구",
  description: "현재 상담 CTA",
  isControl: true,
  sortOrder: 0,
} as const;

const projectionBase = {
  experiment: validExperiment,
  variantMetrics: [],
  readiness: "collecting",
  freshness: {
    experimentUpdatedAt: NOW,
    funnelDataThrough: null,
    funnelGeneratedAt: null,
    funnelQuality: null,
  },
  recentObservations: [],
} as const;

describe("Spacebogam experiment contracts", () => {
  it("parses a valid strict projection object", () => {
    // Given
    const projection = {
      experiment: validExperiment,
      variants: [validVariant],
      variantMetrics: [{
        variantId: VARIANT_ID,
        key: "control",
        isControl: true,
        sample: 30,
        won: 10,
        lost: 20,
        pending: 0,
        disqualified: 0,
        resolved: 30,
        wonRate: 1 / 3,
        absoluteDeltaFromControl: 0,
        relativeLiftFromControl: 0,
      }],
      readiness: "directional_review",
      freshness: {
        experimentUpdatedAt: NOW,
        funnelDataThrough: NOW,
        funnelGeneratedAt: NOW,
        funnelQuality: "ready",
      },
      recentObservations: [],
    } as const;

    // When
    const parsed = experimentProjectionSchema.parse(projection);

    // Then
    expect(parsed.readiness).toBe("directional_review");
    expect(parsed.variants).toHaveLength(1);
  });

  it("rejects malformed experiment boundaries", () => {
    // Given
    const results = [
      experimentSchema.safeParse({ ...validExperiment, unexpected: true }),
      experimentSchema.safeParse({ ...validExperiment, status: "started" }),
      experimentSchema.safeParse({ ...validExperiment, version: 0 }),
      experimentSchema.safeParse({ ...validExperiment, version: 1.5 }),
    ];

    // When
    const rejectedCount = results.filter((result) => !result.success).length;

    // Then
    expect(rejectedCount).toBe(results.length);
  });

  it("rejects lifecycle transitions outside the allowed set", () => {
    // Given
    const input = { from: "completed", to: "running" } as const;

    // When
    const result = lifecycleTransitionSchema.safeParse(input);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects invalid lifecycle status values before transition checks", () => {
    // Given
    const invalidFrom = { from: "started", to: "running" } as const;
    const invalidTo = { from: "draft", to: "started" } as const;

    // When
    const invalidFromResult = lifecycleTransitionSchema.safeParse(invalidFrom);
    const invalidToResult = lifecycleTransitionSchema.safeParse(invalidTo);

    // Then
    expect(invalidFromResult.success).toBe(false);
    expect(invalidToResult.success).toBe(false);
  });

  it("rejects malformed board action payloads", () => {
    // Given
    const validPayload = { experimentId: EXPERIMENT_ID, variantId: VARIANT_ID, leadKey: "lead-123", outcome: "won", enteredAt: NOW, version: 1 } as const;
    const invalidPayload = { experimentId: EXPERIMENT_ID, variantId: VARIANT_ID, phone: "010-0000-0000", outcome: "won", enteredAt: NOW, version: 1 } as const;

    // When
    const validResult = boardActionInputSchema.safeParse({ action: "create-entry", payload: validPayload });
    const invalidResult = boardActionInputSchema.safeParse({ action: "create-entry", payload: invalidPayload });

    // Then
    expect(validResult.success).toBe(true);
    expect(invalidResult.success).toBe(false);
  });

  it("rejects unknown board action keys", () => {
    // Given
    const input = {
      action: "start-experiment-now",
      payload: {
        experimentId: EXPERIMENT_ID,
        version: 1,
      },
    } as const;

    // When
    const result = boardActionInputSchema.safeParse(input);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects malformed tool action payloads", () => {
    // When
    const validResult = toolInputSchema.safeParse({ tool: "spacebogam_experiment_get", payload: { companyId: COMPANY_ID, experimentId: EXPERIMENT_ID } });
    const invalidResult = toolInputSchema.safeParse({ tool: "spacebogam_experiment_get", payload: { experimentId: "not-a-uuid" } });

    // Then
    expect(validResult.success).toBe(true);
    expect(invalidResult.success).toBe(false);
  });

  it("rejects unknown error response codes", () => {
    // Given
    const validError = { ok: false, code: "experiment_not_found", message: "not found", requestId: COMPANY_ID } as const;
    const invalidError = { ...validError, code: "invalid_code" } as const;

    // When
    const validResult = errorResponseSchema.safeParse(validError);
    const invalidResult = errorResponseSchema.safeParse(invalidError);

    // Then
    expect(validResult.success).toBe(true);
    expect(invalidResult.success).toBe(false);
  });

  it("rejects PII-looking field names on entry input", () => {
    // Given
    const baseInput = {
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      variantId: VARIANT_ID,
      leadKey: "lead-123",
      outcome: "pending",
      enteredAt: NOW,
      outcomeAt: null,
    } as const;

    for (const piiKey of ENTRY_PII_FIELD_KEYS) {
      // When
      const result = entryInputSchema.safeParse({ ...baseInput, [piiKey]: "raw-pii" });

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects PII-looking field names on action entry payloads", () => {
    // Given
    const basePayload = {
      experimentId: EXPERIMENT_ID,
      variantId: VARIANT_ID,
      leadKey: "lead-123",
      outcome: "pending",
      enteredAt: NOW,
      version: 1,
    } as const;

    for (const piiKey of ENTRY_PII_FIELD_KEYS) {
      // When
      const result = actionPayloadEntrySchema.safeParse({ ...basePayload, [piiKey]: "raw-pii" });

      // Then
      expect(result.success).toBe(false);
    }
  });

  it("keeps raw leadKey out of the persisted entry schema", () => {
    // Given
    const input = {
      id: ENTRY_ID,
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      variantId: VARIANT_ID,
      leadKeyHash: "sha256:abcdef",
      outcome: "won",
      enteredAt: NOW,
      outcomeAt: NOW,
      version: 1,
    } as const;

    // When
    const parsed = persistedEntrySchema.parse(input);
    const resultWithRawLead = persistedEntrySchema.safeParse({ ...input, leadKey: "lead-123" });

    // Then
    expect("leadKey" in parsed).toBe(false);
    expect(resultWithRawLead.success).toBe(false);
  });

  it("enforces outcomeAt null only for pending outcomes", () => {
    // Given
    const pendingWithTime = {
      id: ENTRY_ID,
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      variantId: VARIANT_ID,
      leadKeyHash: "sha256:abcdef",
      outcome: "pending",
      enteredAt: NOW,
      outcomeAt: NOW,
      version: 1,
    } as const;
    const wonWithoutTime = { ...pendingWithTime, outcome: "won", outcomeAt: null } as const;

    // When
    const pendingResult = persistedEntrySchema.safeParse(pendingWithTime);
    const wonResult = persistedEntrySchema.safeParse(wonWithoutTime);

    // Then
    expect(pendingResult.success).toBe(false);
    expect(wonResult.success).toBe(false);
  });

  it("rejects variants with unsafe experiment ownership at projection boundary", () => {
    // Given
    const projection = {
      ...projectionBase,
      variants: [{ ...validVariant, experimentId: "55555555-5555-4555-8555-555555555555" }],
    } as const;

    // When
    const result = experimentProjectionSchema.safeParse(projection);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects projection without exactly one control variant", () => {
    // Given
    const projection = {
      ...projectionBase,
      variants: [
        { ...validVariant, isControl: false, key: "variant-a" },
        {
          ...validVariant,
          id: "55555555-5555-4555-8555-555555555555",
          key: "variant-b",
          isControl: false,
        },
      ],
    } as const;

    // When
    const result = experimentProjectionSchema.safeParse(projection);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only leadKey in action payload", () => {
    // Given
    const input = {
      experimentId: EXPERIMENT_ID,
      variantId: VARIANT_ID,
      leadKey: "   ",
      outcome: "won",
      enteredAt: NOW,
      version: 1,
    } as const;

    // When
    const result = actionPayloadEntrySchema.safeParse(input);

    // Then
    expect(result.success).toBe(false);
  });

});
