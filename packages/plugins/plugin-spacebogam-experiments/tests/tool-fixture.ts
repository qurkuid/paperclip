import type { ToolRunContext } from "@paperclipai/plugin-sdk";

import {
  experimentSchema,
  observationSchema,
  persistedEntrySchema,
  variantSchema,
  type Observation,
  type Snapshot,
} from "../src/contracts/index.js";
import type { ExperimentDetail } from "../src/repository.js";
import {
  createExperimentToolHandlers,
  type ExperimentToolDeps,
} from "../src/tools.js";

export const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
export const AGENT_ID = "33333333-3333-4333-8333-333333333333";
export const OTHER_AGENT_ID = "44444444-4444-4444-8444-444444444444";
export const EXPERIMENT_ID = "55555555-5555-4555-8555-555555555555";
const VARIANT_ID = "66666666-6666-4666-8666-666666666666";
const ENTRY_ID = "77777777-7777-4777-8777-777777777777";
const OBSERVATION_ID = "99999999-1111-4999-8999-999999999999";
export const NOW = "2026-07-27T03:00:00.000Z";

export const runCtx = {
  companyId: COMPANY_ID,
  agentId: AGENT_ID,
  runId: "88888888-8888-4888-8888-888888888888",
  projectId: "99999999-9999-4999-8999-999999999998",
} satisfies ToolRunContext;

export function experimentDetail(issueId: string | null): ExperimentDetail {
  return {
    experiment: experimentSchema.parse({
      id: EXPERIMENT_ID,
      companyId: COMPANY_ID,
      title: "상담 CTA 실험",
      hypothesis: "구체적인 CTA가 상담 전환을 높인다.",
      status: "running",
      primaryMetric: "won_rate",
      guardrailMetric: null,
      minimumSamplePerVariant: 1,
      targetLift: null,
      plannedStartAt: null,
      startedAt: NOW,
      endedAt: null,
      linkedIssueId: issueId,
      responsibleAgentId: AGENT_ID,
      version: 2,
      archivedAt: null,
      updatedAt: NOW,
    }),
    variants: [variantSchema.parse({
      id: VARIANT_ID,
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      key: "control",
      name: "기존 CTA",
      description: "",
      isControl: true,
      sortOrder: 0,
    })],
    entries: [persistedEntrySchema.parse({
      id: ENTRY_ID,
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      variantId: VARIANT_ID,
      leadKeyHash: "private-lead-hash",
      outcome: "won",
      utmSource: "naver",
      utmMedium: "cpc",
      utmCampaign: "cta",
      enteredAt: NOW,
      outcomeAt: NOW,
      version: 1,
    })],
    snapshots: [],
    observations: [observationSchema.parse({
      id: OBSERVATION_ID,
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      kind: "note",
      summary: "기존 기록에 010-1234-5678 연락처가 포함됨",
      evidence: {
        source: "legacy_note",
        evidenceMarkdown: "email@example.com 원문",
        leadKey: "raw-lead-key",
      },
      funnelGeneratedAt: NOW,
      funnelReportHash: null,
      issueCommentId: null,
      workProductId: null,
      idempotencyKey: "legacy:unsafe",
      createdAt: NOW,
    })],
  };
}

export function setupToolState(
  detail: ExperimentDetail,
  issueIntegration: ExperimentToolDeps["issueIntegration"],
) {
  const observations: Observation[] = [];
  const snapshots: Snapshot[] = [];
  const activity: string[] = [];
  let funnelFreshnessCalls = 0;
  let nowCalls = 0;
  const keys = new Set<string>();
  let idIndex = 0;
  const ids = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  ];
  const repository: ExperimentToolDeps["repository"] = {
    async listExperiments(companyId) {
      return companyId === COMPANY_ID ? [detail.experiment] : [];
    },
    async getExperiment(companyId, experimentId) {
      return companyId === COMPANY_ID && experimentId === EXPERIMENT_ID
        ? { ...detail, observations, snapshots }
        : null;
    },
    async appendObservation(input) {
      const key = input.idempotencyKey;
      if (key !== null && keys.has(key)) throw new Error("idempotency_conflict");
      if (key !== null) keys.add(key);
      observations.push(input);
    },
    async appendSnapshot(input) {
      snapshots.push(input);
    },
  };
  const handlers = createExperimentToolHandlers({
    repository,
    issueIntegration,
    activity: { log: async (entry) => { activity.push(entry.message); } },
    now: () => {
      nowCalls += 1;
      return NOW;
    },
    newId: () => {
      const id = ids[idIndex];
      idIndex += 1;
      if (id === undefined) throw new Error("No fixture UUID remains");
      return id;
    },
    funnelFreshness: async () => {
      funnelFreshnessCalls += 1;
      return {
        quality: "ready",
        dataThrough: NOW,
        generatedAt: NOW,
      };
    },
  });
  return {
    handlers,
    observations,
    snapshots,
    activity,
    funnelFreshnessCalls: () => funnelFreshnessCalls,
    nowCalls: () => nowCalls,
  };
}
