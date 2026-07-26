import type {
  PluginContext,
  PluginPerformActionContext,
} from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import manifest, { PLUGIN_ID } from "../src/manifest.js";
import plugin, {
  createSpacebogamExperimentsWorkerPlugin,
} from "../src/worker.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";
const EXPERIMENT_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const SECRET_REF = {
  type: "secret_ref",
  secretId: "spacebogam-lead-hash",
  version: "latest",
};

async function setupHarness(
  config: Record<string, unknown> = { leadHashSecret: SECRET_REF },
) {
  const harness = createTestHarness({ manifest, config });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

describe("spacebogam experiments worker bridge", () => {
  it("returns the ready overview payload for configured companies", async () => {
    const harness = await setupHarness();

    await expect(harness.getData("overview", {
      companyId: COMPANY_ID,
    })).resolves.toMatchObject({
      pluginId: PLUGIN_ID,
      companyId: COMPANY_ID,
      status: "ready",
      configured: true,
      namespace: "test_paperclipai_plugin_spacebogam_experiments",
      experiments: [],
    });
  });

  it("rejects agent actors before board-only service mutations", async () => {
    const harness = await setupHarness();
    const result = await harness.performAction("board-action", {
      action: "create-experiment",
      payload: {
        title: "CTA 실험",
        hypothesis: "짧은 CTA가 전환을 높인다.",
        minimumSamplePerVariant: 30,
      },
    }, {
      actor: { type: "agent", agentId: AGENT_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "company_isolation_violation",
    });
    expect(harness.dbExecutes).toEqual([]);
  });

  it.each([
    {
      action: "update-experiment",
      payload: {
        experimentId: EXPERIMENT_ID,
        title: "CTA 실험 수정",
        version: 2,
      },
    },
    {
      action: "start-experiment",
      payload: {
        experimentId: EXPERIMENT_ID,
        version: 2,
        reason: "agent actor must not start lifecycle transitions",
      },
    },
    {
      action: "update-entry",
      payload: {
        experimentId: EXPERIMENT_ID,
        variantId: "66666666-6666-4666-8666-666666666666",
        entryId: "77777777-7777-4777-8777-777777777777",
        leadKey: "010-secret",
        outcome: "won",
        enteredAt: "2026-07-27T03:00:00.000Z",
        version: 2,
      },
    },
  ])("rejects agent actors before board-only $action actions", async ({ action, payload }) => {
    const harness = await setupHarness();
    const result = await harness.performAction("board-action", {
      action,
      payload,
    }, {
      actor: { type: "agent", agentId: AGENT_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "company_isolation_violation",
    });
    expect(JSON.stringify(result)).not.toContain("010-secret");
    expect(harness.dbExecutes).toEqual([]);
  });

  it("routes valid board actions through the service factory", async () => {
    const calls: Array<{
      input: unknown;
      context: PluginPerformActionContext;
      companyId: string;
      namespace: string;
    }> = [];
    const worker = createSpacebogamExperimentsWorkerPlugin(
      (ctx: PluginContext, companyId: string) => ({
        async performBoardAction(input, context) {
          calls.push({
            input,
            context,
            companyId,
            namespace: ctx.db.namespace,
          });
          return {
            ok: true,
            requestId: REQUEST_ID,
            experimentId: EXPERIMENT_ID,
            version: 3,
          };
        },
      }),
    );
    const harness = createTestHarness({ manifest });
    await worker.definition.setup(harness.ctx);

    await expect(harness.performAction("board-action", {
      companyId: "spoofed-company",
      action: "create-experiment",
      payload: {
        title: "CTA 실험",
        hypothesis: "짧은 CTA가 전환을 높인다.",
        minimumSamplePerVariant: 30,
      },
    }, {
      actor: { type: "user", userId: USER_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    })).resolves.toMatchObject({
      ok: true,
      requestId: REQUEST_ID,
      experimentId: EXPERIMENT_ID,
      version: 3,
    });
    expect(calls[0]).toMatchObject({
      companyId: COMPANY_ID,
      namespace: "test_paperclipai_plugin_spacebogam_experiments",
      context: { companyId: COMPANY_ID },
    });
  });

  it("returns a safe rejection for malformed board actions", async () => {
    const harness = await setupHarness();
    const result = await harness.performAction("board-action", {
      action: "create-entry",
      payload: {
        experimentId: EXPERIMENT_ID,
        leadKey: "010-secret",
      },
    }, {
      actor: { type: "user", userId: USER_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    });

    expect(result).toMatchObject({ ok: false, code: "unknown_action" });
    expect(JSON.stringify(result)).not.toContain("010-secret");
    expect(harness.dbExecutes).toEqual([]);
  });

  it("forwards issue-link board action and returns structured missing-experiment error", async () => {
    const harness = await setupHarness();
    const result = await harness.performAction("board-action", {
      action: "link-issue",
      payload: {
        experimentId: EXPERIMENT_ID,
        issueId: "99999999-9999-4999-8999-999999999999",
        version: 2,
      },
    }, {
      actor: { type: "user", userId: USER_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    });

    expect(result).toMatchObject({ ok: false, code: "experiment_not_found" });
    expect(JSON.stringify(result)).not.toContain("99999999-9999-4999-8999-999999999999");
    expect(harness.dbExecutes).toEqual([]);
  });

  it("forwards strategy request board action without leaking request text", async () => {
    const harness = await setupHarness();
    const result = await harness.performAction("board-action", {
      action: "request-strategy",
      payload: {
        experimentId: EXPERIMENT_ID,
        request: "전환율을 개선하기 위한 다음 전략을 제안해줘",
        version: 2,
      },
    }, {
      actor: { type: "user", userId: USER_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    });

    expect(result).toMatchObject({ ok: false, code: "experiment_not_found" });
    expect(JSON.stringify(result)).not.toContain("전환율을 개선하기 위한 다음 전략을 제안해줘");
    expect(harness.dbExecutes).toEqual([]);
  });

  it("forwards managed routine reconciliation as structured service rejection", async () => {
    const harness = await setupHarness();
    const result = await harness.performAction("board-action", {
      action: "reconcile-managed-routine",
      payload: {
        experimentId: EXPERIMENT_ID,
        enabled: false,
        version: 2,
      },
    }, {
      actor: { type: "user", userId: USER_ID, companyId: COMPANY_ID },
      companyId: COMPANY_ID,
    });

    expect(result).toMatchObject({ ok: false, code: "experiment_not_found" });
    expect(JSON.stringify(result)).not.toContain("reconcile-managed-routine");
    expect(harness.dbExecutes).toEqual([]);
  });
});
