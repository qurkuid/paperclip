import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";

import manifest from "../src/manifest.js";
import {
  SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
  buildExperimentQuery,
  buildOverviewQuery,
  isSpacebogamDataStale,
  normalizeBridgeError,
  normalizeExperimentDetailResponse,
  normalizeOverviewResponse,
} from "../src/ui/api.js";
import plugin from "../src/worker.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const SECRET_REF = {
  type: "secret_ref",
  secretId: "spacebogam-lead-hash",
  version: "latest",
};

describe("spacebogam experiments UI data baseline", () => {
  it("pins the existing board data keys and overview shape used by the UI", async () => {
    const harness = createTestHarness({
      manifest,
      config: { leadHashSecret: SECRET_REF },
    });
    await plugin.definition.setup(harness.ctx);

    await expect(harness.getData("overview", { companyId: COMPANY_ID })).resolves.toMatchObject({
      pluginId: "paperclipai.plugin-spacebogam-experiments",
      companyId: COMPANY_ID,
      status: "ready",
      configured: true,
      experiments: [],
    });
    await expect(harness.getData("experiment", {
      companyId: COMPANY_ID,
    })).resolves.toBeNull();
    await expect(harness.getData("operations-options", {
      companyId: COMPANY_ID,
    })).resolves.toMatchObject({
      routine: {
        status: "paused",
      },
    });
  });
});

describe("spacebogam experiments UI data contract", () => {
  it("builds stable bridge query keys and params", () => {
    expect(buildOverviewQuery(COMPANY_ID)).toEqual({
      key: ["spacebogam-experiments", "overview", COMPANY_ID],
      name: "overview",
      params: { companyId: COMPANY_ID },
      refreshIntervalMs: 300_000,
    });
    expect(buildExperimentQuery(COMPANY_ID, null)).toEqual({
      key: ["spacebogam-experiments", "experiment", COMPANY_ID, null],
      name: "experiment",
      params: { companyId: COMPANY_ID },
      refreshIntervalMs: 300_000,
    });
    expect(buildExperimentQuery(COMPANY_ID, "22222222-2222-4222-8222-222222222222").params).toEqual({
      companyId: COMPANY_ID,
      experimentId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("uses the planned five-minute refresh and marks the exact stale boundary", () => {
    const loadedAtMs = Date.UTC(2026, 6, 27, 0, 0, 0);

    expect(SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS).toBe(300_000);
    expect(isSpacebogamDataStale(loadedAtMs, loadedAtMs + 299_999)).toBe(false);
    expect(isSpacebogamDataStale(loadedAtMs, loadedAtMs + 300_000)).toBe(true);
  });

  it("normalizes overview ready, plugin-not-ready, empty, stale, and invalid response states", () => {
    const loadedAtMs = Date.UTC(2026, 6, 27, 0, 0, 0);

    expect(normalizeOverviewResponse({
      pluginId: "paperclipai.plugin-spacebogam-experiments",
      companyId: COMPANY_ID,
      status: "ready",
      configured: true,
      experiments: [],
    }, { loadedAtMs, nowMs: loadedAtMs })).toMatchObject({
      kind: "empty",
      stale: false,
    });
    expect(normalizeOverviewResponse({
      pluginId: "paperclipai.plugin-spacebogam-experiments",
      companyId: COMPANY_ID,
      status: "ready",
      configured: false,
      experiments: [],
    }, { loadedAtMs, nowMs: loadedAtMs })).toMatchObject({
      kind: "plugin-not-ready",
      stale: false,
    });
    expect(normalizeOverviewResponse({
      pluginId: "paperclipai.plugin-spacebogam-experiments",
      companyId: COMPANY_ID,
      status: "ready",
      configured: true,
      experiments: [{
        id: "22222222-2222-4222-8222-222222222222",
        companyId: COMPANY_ID,
        title: "A/B 상담 문구",
        hypothesis: "문구 변경으로 상담 전환이 오른다",
        status: "running",
        minimumSamplePerVariant: 30,
        version: 1,
        updatedAt: "2026-07-27T00:00:00.000Z",
      }],
    }, { loadedAtMs, nowMs: loadedAtMs })).toMatchObject({
      kind: "ready",
      stale: false,
    });
    expect(normalizeOverviewResponse({
      pluginId: "paperclipai.plugin-spacebogam-experiments",
      companyId: COMPANY_ID,
      status: "ready",
      configured: true,
      experiments: [{
        id: "22222222-2222-4222-8222-222222222222",
        companyId: COMPANY_ID,
        title: "A/B 상담 문구",
        hypothesis: "문구 변경으로 상담 전환이 오른다",
        status: "running",
        minimumSamplePerVariant: 30,
        version: 1,
        updatedAt: "2026-07-27T00:00:00.000Z",
      }],
    }, { loadedAtMs, nowMs: loadedAtMs + 300_000 })).toMatchObject({
      kind: "stale",
      stale: true,
    });
    expect(normalizeOverviewResponse({
      pluginId: "paperclipai.plugin-spacebogam-experiments",
      companyId: COMPANY_ID,
      status: "ready",
      configured: true,
      experiments: [{ id: "not-enough-fields", status: "unknown" }],
    }, { loadedAtMs, nowMs: loadedAtMs })).toEqual({
      kind: "invalid-response",
      code: "invalid_response",
      message: "Spacebogam experiments overview response is invalid.",
      stale: false,
    });
  });

  it("normalizes missing detail, detail ready, invalid detail, worker errors, and conflict errors", () => {
    const loadedAtMs = Date.UTC(2026, 6, 27, 0, 0, 0);

    expect(normalizeExperimentDetailResponse(null, { loadedAtMs, nowMs: loadedAtMs })).toEqual({
      kind: "no-experiment",
      stale: false,
    });
    expect(normalizeExperimentDetailResponse({
      experiment: {
        id: "22222222-2222-4222-8222-222222222222",
        companyId: COMPANY_ID,
        title: "A/B 상담 문구",
        hypothesis: "문구 변경으로 상담 전환이 오른다",
        status: "running",
        minimumSamplePerVariant: 30,
        version: 1,
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
      variants: [],
      variantMetrics: [],
      snapshots: [],
      recentObservations: [],
    }, { loadedAtMs, nowMs: loadedAtMs })).toMatchObject({
      kind: "ready",
      stale: false,
    });
    expect(normalizeExperimentDetailResponse({
      experiment: {
        id: "22222222-2222-4222-8222-222222222222",
        companyId: COMPANY_ID,
        title: "A/B 상담 문구",
        hypothesis: "문구 변경으로 상담 전환이 오른다",
        status: "running",
        minimumSamplePerVariant: 30,
        version: 1,
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
      variants: [],
      variantMetrics: [],
      snapshots: [],
      recentObservations: [],
    }, { loadedAtMs, nowMs: loadedAtMs + 300_000 })).toMatchObject({
      kind: "stale",
      stale: true,
    });
    expect(normalizeExperimentDetailResponse({
      experiment: { id: "22222222-2222-4222-8222-222222222222" },
      variants: [],
      variantMetrics: [],
      snapshots: [],
      recentObservations: [],
    }, { loadedAtMs, nowMs: loadedAtMs })).toEqual({
      kind: "invalid-response",
      code: "invalid_response",
      message: "Spacebogam experiment detail response is invalid.",
      stale: false,
    });
    expect(normalizeBridgeError(new Error("Worker timed out"))).toEqual({
      kind: "error",
      code: "worker_error",
      message: "Worker timed out",
    });
    expect(normalizeBridgeError({
      code: "conflict",
      message: "Version conflict",
    })).toEqual({
      kind: "conflict",
      code: "conflict",
      message: "Version conflict",
    });
  });
});
