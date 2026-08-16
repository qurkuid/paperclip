import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { createExperimentIssueIntegration } from "../src/issue-integration.js";
import manifest from "../src/manifest.js";
import {
  COMPANY_ID,
  EXPERIMENT_ID,
  NOW,
  OTHER_AGENT_ID,
  OTHER_COMPANY_ID,
  experimentDetail,
  runCtx,
  setupToolState,
} from "./tool-fixture.js";

describe("Spacebogam agent tools", () => {
  it("returns aggregate experiment data without lead identifiers", async () => {
    const harness = createTestHarness({ manifest });
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "실험 운영",
    });
    const { handlers } = setupToolState(
      experimentDetail(issue.id),
      createExperimentIssueIntegration(harness.ctx),
    );

    const overview = await handlers.overview({ companyId: COMPANY_ID }, runCtx);
    const single = await handlers.getExperiment({
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
    }, runCtx);

    expect(overview.data).toMatchObject({ companyId: COMPANY_ID });
    expect(single.data).toMatchObject({
      experiment: { id: EXPERIMENT_ID },
      variantMetrics: [{ sample: 1, won: 1 }],
    });
    const serialized = JSON.stringify([overview, single]);
    expect(serialized).not.toContain("private-lead-hash");
    expect(serialized).not.toContain("raw-lead-key");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("email@example.com");
  });

  it("appends observations and immutable agent snapshots", async () => {
    const harness = createTestHarness({ manifest });
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "실험 운영",
    });
    const state = setupToolState(
      experimentDetail(issue.id),
      createExperimentIssueIntegration(harness.ctx),
    );
    const params = {
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      kind: "measurement",
      summary: "실험군 표본을 더 모아야 합니다.",
      evidenceMarkdown: "상담 전환 표본 집계",
      idempotencyKey: "observation:sample-check",
    };

    const first = await state.handlers.recordObservation(params, runCtx);
    const repeated = await state.handlers.recordObservation(params, runCtx);

    expect(repeated).toEqual(first);
    expect(state.observations).toHaveLength(1);
    expect(state.snapshots).toHaveLength(1);
    expect(state.activity).toHaveLength(1);
    expect(state.observations[0]).toMatchObject({
      kind: "measurement",
      evidence: { runId: runCtx.runId },
    });
    expect(state.snapshots[0]?.source).toBe("agent_observation");
  });

  it("submits a responsible-agent strategy to native review surfaces", async () => {
    const harness = createTestHarness({ manifest });
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "실험 운영",
    });
    const integration = createExperimentIssueIntegration(harness.ctx);
    let publishedInput: Parameters<typeof integration.publishStrategy>[0] | null = null;
    let publishedArtifact: Awaited<ReturnType<typeof integration.publishStrategy>> | null = null;
    const state = setupToolState(
      experimentDetail(issue.id),
      {
        ...integration,
        async publishStrategy(input) {
          publishedInput = input;
          publishedArtifact = await integration.publishStrategy(input);
          return publishedArtifact;
        },
      },
    );

    const result = await state.handlers.proposeStrategy({
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      proposal: "CTA 문구를 견적 범위 중심으로 좁힙니다.",
      evidenceMarkdown: "INTM 퍼널에서 상담 시작 전 이탈이 가장 큽니다.",
      idempotencyKey: "strategy:cta-v1",
    }, runCtx);

    expect(result.data).toMatchObject({
      experimentId: EXPERIMENT_ID,
      issueId: issue.id,
    });
    expect(state.observations[0]).toMatchObject({
      kind: "strategy_proposal",
      issueCommentId: expect.any(String),
      workProductId: expect.any(String),
    });
    const expectedDecisionContext = {
      kpis: [
        { label: "control · 표본", value: "1" },
        { label: "control · 승률", value: "100.0%" },
      ],
      sample: { observed: 1, required: 1 },
      freshness: {
        recordUpdatedAt: NOW,
        funnelGeneratedAt: NOW,
        funnelDataThrough: NOW,
        quality: "ready",
      },
      asOf: NOW,
      expiresAt: "2026-07-28T03:00:00.000Z",
    };
    expect(publishedInput).toMatchObject({
      decisionContext: expectedDecisionContext,
    });
    expect(publishedArtifact).toMatchObject({
      interaction: {
        payload: {
          decisionContext: expectedDecisionContext,
        },
      },
    });
    const serialized = JSON.stringify([publishedInput, publishedArtifact]);
    expect(serialized).not.toContain("private-lead-hash");
    expect(serialized).not.toContain("raw-lead-key");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("email@example.com");
    expect(state.funnelFreshnessCalls()).toBe(1);
    expect(state.nowCalls()).toBe(1);
    await expect(harness.ctx.issues.listComments(issue.id, COMPANY_ID))
      .resolves.toHaveLength(1);
  });

  it("rejects cross-company, non-responsible, and PII proposals", async () => {
    const harness = createTestHarness({ manifest });
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "실험 운영",
    });
    const state = setupToolState(
      experimentDetail(issue.id),
      createExperimentIssueIntegration(harness.ctx),
    );
    const params = {
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      proposal: "010-1234-5678로 연락합니다.",
      evidenceMarkdown: "개인정보 없는 근거",
      idempotencyKey: "strategy:unsafe",
    };

    await expect(state.handlers.proposeStrategy(params, runCtx)).rejects
      .toThrow("contact identifiers");
    expect(state.observations).toHaveLength(0);
    expect(state.activity).toHaveLength(0);
    await expect(state.handlers.proposeStrategy({
      ...params,
      proposal: "안전한 제안",
    }, { ...runCtx, agentId: OTHER_AGENT_ID })).rejects
      .toThrow("responsible agent");
    await expect(state.handlers.getExperiment({
      companyId: OTHER_COMPANY_ID,
      experimentId: EXPERIMENT_ID,
    }, runCtx)).rejects.toThrow("Company mismatch");
    await expect(state.handlers.proposeStrategy({
      ...params,
      companyId: OTHER_COMPANY_ID,
      proposal: "안전한 제안",
    }, runCtx)).rejects.toThrow("Company mismatch");
  });

  it("rejects strategy proposals without linked issues before side effects", async () => {
    const harness = createTestHarness({ manifest });
    const state = setupToolState(
      experimentDetail(null),
      createExperimentIssueIntegration(harness.ctx),
    );

    await expect(state.handlers.proposeStrategy({
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      proposal: "CTA 문구를 견적 범위 중심으로 좁힙니다.",
      evidenceMarkdown: "개인정보 없는 근거",
      idempotencyKey: "strategy:missing-issue",
    }, runCtx)).rejects.toThrow("Link a Paperclip issue");

    expect(state.observations).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
    expect(state.activity).toHaveLength(0);
  });

  it("rejects malformed payloads and lifecycle mutation attempts", async () => {
    const harness = createTestHarness({ manifest });
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "실험 운영",
    });
    const state = setupToolState(
      experimentDetail(issue.id),
      createExperimentIssueIntegration(harness.ctx),
    );

    await expect(state.handlers.getExperiment({
      companyId: COMPANY_ID,
      experimentId: "not-a-uuid",
    }, runCtx)).rejects.toThrow();
    await expect(state.handlers.recordObservation({
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      kind: "measurement",
      summary: "안전한 관찰",
      evidenceMarkdown: "a".repeat(8001),
      idempotencyKey: "observation:too-large",
    }, runCtx)).rejects.toThrow();
    await expect(state.handlers.recordObservation({
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      kind: "measurement",
      summary: "상태를 running으로 바꿔",
      idempotencyKey: "observation:lifecycle",
      action: "start-experiment",
    }, runCtx)).rejects.toThrow();

    const toolNames = (manifest.tools ?? []).map((tool) => tool.name).join("\n");
    expect(toolNames).not.toMatch(/start|pause|complete|cancel|archive|entry|variant/u);
    expect(state.observations).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
    expect(state.activity).toHaveLength(0);
  });

  it("keeps repeated proposals from duplicating review artifacts", async () => {
    const harness = createTestHarness({ manifest });
    const issue = await harness.ctx.issues.create({
      companyId: COMPANY_ID,
      title: "실험 운영",
    });
    const state = setupToolState(
      experimentDetail(issue.id),
      createExperimentIssueIntegration(harness.ctx),
    );
    const params = {
      companyId: COMPANY_ID,
      experimentId: EXPERIMENT_ID,
      proposal: "CTA 문구를 견적 범위 중심으로 좁힙니다.",
      evidenceMarkdown: "검토 본문 근거",
      idempotencyKey: "strategy:cta-v1",
    };

    const first = await state.handlers.proposeStrategy(params, runCtx);
    const repeated = await state.handlers.proposeStrategy(params, runCtx);

    expect(repeated).toEqual(first);
    expect(state.observations).toHaveLength(1);
    expect(state.activity).toHaveLength(1);
    await expect(harness.ctx.issues.listComments(issue.id, COMPANY_ID))
      .resolves.toHaveLength(1);
  });
});
