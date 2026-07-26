import type { PluginPerformActionContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import {
  experimentSchema,
  type Experiment,
  type Observation,
} from "../src/contracts/index.js";
import { createExperimentIssueIntegration } from "../src/issue-integration.js";
import type { ExperimentDetail, ExperimentPatch } from "../src/repository.js";
import {
  createSpacebogamExperimentService,
  type ExperimentServiceRepository,
} from "../src/service.js";
import manifest, { PLUGIN_ID } from "../src/manifest.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const EXPERIMENT_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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

function detail(experiment: Experiment): ExperimentDetail {
  return {
    experiment,
    variants: [],
    entries: [],
    snapshots: [],
    observations: [],
  };
}

function repositoryFixture() {
  let current: Experiment | null = null;
  let lastPatch: ExperimentPatch | null = null;
  const observations: Observation[] = [];
  const repository = {
    async getExperiment() {
      return current === null ? null : detail(current);
    },
    async createExperiment(input) {
      current = input;
      return detail(input);
    },
    async updateExperiment(input) {
      if (current === null) throw new Error("missing experiment");
      lastPatch = input.patch;
      current = experimentSchema.parse({
        ...current,
        ...input.patch,
        version: current.version + 1,
        updatedAt: input.updatedAt,
      });
      return detail(current);
    },
    async replaceDraftVariants() {
      if (current === null) throw new Error("missing experiment");
      return detail(current);
    },
    async transitionExperiment() {
      if (current === null) throw new Error("missing experiment");
      return detail(current);
    },
    async createEntry() {
      if (current === null) throw new Error("missing experiment");
      return detail(current);
    },
    async updateEntry() {
      if (current === null) throw new Error("missing experiment");
      return detail(current);
    },
    async deleteEntry() {
      if (current === null) throw new Error("missing experiment");
      return detail(current);
    },
    async appendSnapshot() {},
    async appendObservation(input) {
      observations.push(input);
    },
  } satisfies ExperimentServiceRepository;
  return {
    repository,
    current: () => current,
    lastPatch: () => lastPatch,
    observations: () => observations,
  };
}

function createService(
  repository: ExperimentServiceRepository,
  issueIntegration: ReturnType<typeof createExperimentIssueIntegration>,
) {
  const ids = [
    REQUEST_ID,
    EXPERIMENT_ID,
    SECOND_REQUEST_ID,
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
    "99999999-9999-4999-8999-999999999999",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ];
  return createSpacebogamExperimentService({
    repository,
    issueIntegration,
    activity: { log: async () => {} },
    now: () => NOW,
    newId: () => {
      const id = ids.shift();
      if (id === undefined) throw new Error("No fixture UUID remains");
      return id;
    },
    validateAgent: async (companyId, agentId) =>
      companyId === COMPANY_ID && agentId === USER_ID,
    resolveLinkedProjectId: async () => PROJECT_ID,
    hashLeadKey: async (leadKey) => `hash:${leadKey}`,
    funnelFreshness: async () => ({
      quality: null,
      dataThrough: null,
      generatedAt: null,
    }),
  });
}

describe("Spacebogam board issue actions", () => {
  it("creates and persists a native linked issue with a new experiment", async () => {
    const harness = createTestHarness({ manifest });
    const fixture = repositoryFixture();
    const service = createService(
      fixture.repository,
      createExperimentIssueIntegration(harness.ctx),
    );

    await expect(service.performBoardAction({
      action: "create-experiment",
      payload: {
        title: "상담 CTA 실험",
        hypothesis: "명확한 문구가 계약 전환을 높인다.",
      },
    }, boardContext)).resolves.toMatchObject({
      ok: true,
      experimentId: EXPERIMENT_ID,
    });

    expect(fixture.current()?.linkedIssueId).not.toBeNull();
    const issues = await harness.ctx.issues.list({
      companyId: COMPANY_ID,
      originKind: `plugin:${PLUGIN_ID}:experiment`,
      originId: `experiment:${EXPERIMENT_ID}`,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.projectId).toBe(PROJECT_ID);
  });

  it("rejects a cross-company issue without changing the experiment link", async () => {
    const harness = createTestHarness({ manifest });
    const fixture = repositoryFixture();
    const service = createService(
      fixture.repository,
      createExperimentIssueIntegration(harness.ctx),
    );
    await service.performBoardAction({
      action: "create-experiment",
      payload: {
        title: "상담 CTA 실험",
        hypothesis: "명확한 문구가 계약 전환을 높인다.",
      },
    }, boardContext);
    const foreignIssue = await harness.ctx.issues.create({
      companyId: OTHER_COMPANY_ID,
      title: "다른 회사 이슈",
    });

    await expect(service.performBoardAction({
      action: "link-issue",
      payload: {
        experimentId: EXPERIMENT_ID,
        issueId: foreignIssue.id,
        version: 1,
      },
    }, boardContext)).resolves.toMatchObject({
      ok: false,
      code: "company_isolation_violation",
    });
    expect(fixture.lastPatch()).toBeNull();
  });

  it("routes strategy requests through the issue-action handler once linked", async () => {
    const harness = createTestHarness({ manifest });
    const fixture = repositoryFixture();
    const service = createService(
      fixture.repository,
      createExperimentIssueIntegration(harness.ctx),
    );
    await service.performBoardAction({
      action: "create-experiment",
      payload: {
        title: "상담 CTA 실험",
        hypothesis: "명확한 문구가 계약 전환을 높인다.",
      },
    }, boardContext);
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "연결 대상 이슈",
    });
    await service.performBoardAction({
      action: "link-issue",
      payload: {
        experimentId: EXPERIMENT_ID,
        issueId: issue.id,
        version: 1,
      },
    }, boardContext);
    await service.performBoardAction({
      action: "select-responsible-agent",
      payload: {
        experimentId: EXPERIMENT_ID,
        responsibleAgentId: USER_ID,
        version: 2,
      },
    }, boardContext);

    await expect(service.performBoardAction({
      action: "request-strategy",
      payload: {
        experimentId: EXPERIMENT_ID,
        request: "다음 전략을 제안해줘",
        version: 3,
      },
    }, boardContext)).resolves.toMatchObject({
      ok: true,
      experimentId: EXPERIMENT_ID,
    });
    const linkedIssueId = fixture.current()?.linkedIssueId;
    expect(linkedIssueId).not.toBeNull();
    await expect(
      harness.ctx.issues.get(linkedIssueId!, COMPANY_ID),
    ).resolves.toMatchObject({
      status: "todo",
      assigneeAgentId: USER_ID,
      description: expect.stringContaining("다음 전략을 제안해줘"),
    });
    await expect(
      harness.ctx.issues.listComments(linkedIssueId!, COMPANY_ID),
    ).resolves.toEqual([
      expect.objectContaining({
        body: expect.stringContaining("다음 전략을 제안해줘"),
      }),
    ]);
  });

});
