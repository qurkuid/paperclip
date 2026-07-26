import type { PluginPerformActionContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { experimentSchema } from "../src/contracts/index.js";
import type { ExperimentDetail } from "../src/repository.js";
import {
  createSpacebogamExperimentService,
  type ExperimentServiceRepository,
} from "../src/service.js";
import manifest, {
  ROUTINE_KEY,
  SPACEBOGAM_AGENT_KEY,
  TOOL_NAMES,
} from "../src/manifest.js";
import { createSpacebogamExperimentsWorkerPlugin } from "../src/worker.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";
const EXPERIMENT_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const OBSERVATION_ID = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-07-27T03:00:00.000Z";

const boardContext = {
  actor: {
    type: "user",
    userId: USER_ID,
    agentId: null,
    runId: null,
    companyId: COMPANY_ID,
  },
  companyId: COMPANY_ID,
} satisfies PluginPerformActionContext;

function detail(responsibleAgentId: string | null): ExperimentDetail {
  return {
    experiment: experimentSchema.parse({
      id: EXPERIMENT_ID,
      companyId: COMPANY_ID,
      title: "상담 CTA 실험",
      hypothesis: "CTA가 상담 전환을 개선한다.",
      status: "running",
      primaryMetric: "won_rate",
      guardrailMetric: null,
      minimumSamplePerVariant: 30,
      targetLift: null,
      plannedStartAt: null,
      startedAt: NOW,
      endedAt: null,
      linkedIssueId: null,
      responsibleAgentId,
      version: 2,
      archivedAt: null,
      updatedAt: NOW,
    }),
    variants: [],
    entries: [],
    snapshots: [],
    observations: [],
  };
}

function repositoryFor(value: ExperimentDetail): ExperimentServiceRepository {
  return {
    async getExperiment() { return value; },
    async createExperiment() { return value; },
    async updateExperiment() { return value; },
    async replaceDraftVariants() { return value; },
    async transitionExperiment() { return value; },
    async createEntry() { return value; },
    async updateEntry() { return value; },
    async deleteEntry() { return value; },
    async appendSnapshot() {},
    async appendObservation() {},
  };
}

function serviceFor(
  responsibleAgentId: string | null,
  reconcileRoutine: (
    companyId: string,
    enabled: boolean,
    agentId: string | null | undefined,
  ) => Promise<void>,
) {
  const ids = [REQUEST_ID, OBSERVATION_ID];
  return createSpacebogamExperimentService({
    repository: repositoryFor(detail(responsibleAgentId)),
    activity: { log: async () => {} },
    now: () => NOW,
    newId: () => {
      const id = ids.shift();
      if (id === undefined) throw new Error("No fixture UUID remains");
      return id;
    },
    hashLeadKey: async (leadKey) => leadKey,
    funnelFreshness: async () => ({
      quality: null,
      dataThrough: null,
      generatedAt: null,
    }),
    reconcileRoutine,
  });
}

describe("Spacebogam managed routine", () => {
  it("keeps the weekly trigger armed while the routine and agent remain paused", () => {
    expect(manifest.routines).toContainEqual(expect.objectContaining({
      routineKey: ROUTINE_KEY,
      status: "paused",
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
      triggers: [expect.objectContaining({ enabled: true })],
    }));
    expect(manifest.agents).toContainEqual(expect.objectContaining({
      agentKey: SPACEBOGAM_AGENT_KEY,
      status: "paused",
      budgetMonthlyCents: 0,
    }));
  });

  it("instructs bounded existing INTM MCP use and prohibits lifecycle mutation", () => {
    const routine = manifest.routines?.find(
      (candidate) => candidate.routineKey === ROUTINE_KEY,
    );

    expect(routine?.description).toMatch(/existing INTM MCP/);
    expect(routine?.description).toMatch(/non-PII observations/);
    expect(routine?.description).toMatch(/proposal tool/);
    expect(routine?.description).toMatch(/Never mutate experiment lifecycle, variants, or lead outcomes/);
  });

  it("requires a responsible agent before enabling", async () => {
    const calls: string[] = [];
    const service = serviceFor(null, async () => { calls.push("called"); });

    await expect(service.performBoardAction({
      action: "reconcile-managed-routine",
      payload: { experimentId: EXPERIMENT_ID, enabled: true, version: 2 },
    }, boardContext)).resolves.toMatchObject({
      ok: false,
      code: "unknown_action",
    });
    expect(calls).toEqual([]);
  });

  it("passes the responsible agent to routine reconciliation", async () => {
    const calls: Array<{
      companyId: string;
      enabled: boolean;
      agentId: string | null | undefined;
    }> = [];
    const service = serviceFor(
      AGENT_ID,
      async (companyId, enabled, agentId) => {
        calls.push({ companyId, enabled, agentId });
      },
    );

    await expect(service.performBoardAction({
      action: "reconcile-managed-routine",
      payload: { experimentId: EXPERIMENT_ID, enabled: true, version: 2 },
    }, boardContext)).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual([{
      companyId: COMPANY_ID,
      enabled: true,
      agentId: AGENT_ID,
    }]);
  });

  it("declares every T07 tool with strict parameter schemas", () => {
    const declarations = manifest.tools ?? [];

    expect(declarations.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    for (const declaration of declarations) {
      expect(declaration.parametersSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("registers every declared T07 tool during worker setup", async () => {
    const harness = createTestHarness({ manifest });
    const worker = createSpacebogamExperimentsWorkerPlugin();
    await worker.definition.setup(harness.ctx);

    await expect(harness.executeTool(TOOL_NAMES[0], { companyId: COMPANY_ID }, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
    })).resolves.toMatchObject({
      data: { companyId: COMPANY_ID, experiments: [] },
    });
    for (const toolName of TOOL_NAMES.slice(1)) {
      await expect(harness.executeTool(toolName, { companyId: COMPANY_ID }, {
        companyId: COMPANY_ID,
        agentId: AGENT_ID,
      })).rejects.not.toThrow(/No tool handler registered/);
    }
  });

  it("fails setup instead of silently skipping a required tool declaration", async () => {
    const originalTools = manifest.tools;
    manifest.tools = originalTools?.filter(
      (declaration) => declaration.name !== TOOL_NAMES[0],
    );
    try {
      const harness = createTestHarness({ manifest });
      const worker = createSpacebogamExperimentsWorkerPlugin();

      await expect(worker.definition.setup(harness.ctx)).rejects
        .toThrow(`Missing manifest declaration for ${TOOL_NAMES[0]}`);
    } finally {
      manifest.tools = originalTools;
    }
  });
});
