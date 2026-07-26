import { createHmac, randomUUID } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginPerformActionContext,
  type ToolRunContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";

import { registerExperimentBoardData } from "./board-data.js";
import { readExperimentPluginConfig } from "./config.js";
import { createExperimentIssueIntegration } from "./issue-integration.js";
import { createExperimentRepository } from "./repository.js";
import type { ExperimentDatabase } from "./repository/database.js";
import { createSpacebogamExperimentService } from "./service.js";
import { createExperimentToolHandlers } from "./tools.js";
import manifest, {
  PLUGIN_ID,
  ROUTINE_KEY,
  SPACEBOGAM_AGENT_KEY,
  TOOL_NAMES,
} from "./manifest.js";
import type { ToolAction } from "./contracts/index.js";

type BoardActionService = {
  performBoardAction(
    input: unknown,
    context: PluginPerformActionContext,
  ): Promise<unknown>;
};

export type BoardActionServiceFactory = (
  ctx: PluginContext,
  companyId: string,
) => BoardActionService;

function databaseAdapter(ctx: PluginContext): ExperimentDatabase {
  return {
    namespace: ctx.db.namespace,
    query: (sql, params = []) => ctx.db.query(sql, [...params]),
    execute: (sql, params = []) => ctx.db.execute(sql, [...params]),
  };
}

function createLeadHasher(ctx: PluginContext, companyId: string) {
  return async (leadKey: string): Promise<string> => {
    const config = await readExperimentPluginConfig(ctx, companyId);
    if (config === null) {
      throw new Error("Spacebogam experiment plugin is not configured");
    }
    const secret = await ctx.secrets.resolve(config.leadHashSecret, {
      companyId,
      configPath: "leadHashSecret",
    });
    return createHmac("sha256", secret)
      .update(leadKey.trim().toLocaleLowerCase("ko-KR"))
      .digest("hex");
  };
}

function createDefaultBoardActionService(
  ctx: PluginContext,
  companyId: string,
): BoardActionService {
  const repository = createExperimentRepository(databaseAdapter(ctx));
  return createSpacebogamExperimentService({
    repository,
    activity: ctx.activity,
    now: () => new Date().toISOString(),
    newId: randomUUID,
    hashLeadKey: createLeadHasher(ctx, companyId),
    funnelFreshness: async () => ({
      quality: null,
      dataThrough: null,
      generatedAt: null,
    }),
    issueIntegration: createExperimentIssueIntegration(ctx),
    resolveLinkedProjectId: async (targetCompanyId) =>
      (await readExperimentPluginConfig(ctx, targetCompanyId))?.linkedProjectId
      ?? null,
    validateAgent: async (targetCompanyId, agentId) => {
      const agent = await ctx.agents.get(agentId, targetCompanyId);
      return agent !== null && agent.status !== "terminated";
    },
    invokeAgent: async (input) => ctx.agents.invoke(
      input.agentId,
      input.companyId,
      {
        prompt: [
          `공간보감 실험 ${input.experimentId}의 다음 전략을 검토하세요.`,
          "먼저 공간보감 실험 overview/get 도구로 구조화 상태를 읽으세요.",
          "같은 기간의 퍼널 근거는 기존 INTM MCP에서 확인하세요.",
          "개인정보를 포함하지 말고 propose_strategy 도구로 검토안을 제출하세요.",
          `요청: ${input.request}`,
        ].join("\n"),
        reason: "Spacebogam experiment strategy review",
      },
    ),
    reconcileRoutine: async (
      targetCompanyId,
      enabled,
      responsibleAgentId,
    ) => {
      await ctx.routines.managed.reconcile(
        ROUTINE_KEY,
        targetCompanyId,
        { assigneeAgentId: responsibleAgentId ?? null },
      );
      await ctx.routines.managed.update(
        ROUTINE_KEY,
        targetCompanyId,
        { status: enabled ? "active" : "paused" },
      );
    },
  });
}

export function createSpacebogamExperimentsWorkerPlugin(
  serviceFactory: BoardActionServiceFactory = createDefaultBoardActionService,
) {
  return definePlugin({
  async setup(ctx) {
    const repository = createExperimentRepository(databaseAdapter(ctx));
    const issueIntegration = createExperimentIssueIntegration(ctx);
    const toolHandlers = createExperimentToolHandlers({
      repository,
      issueIntegration,
      activity: ctx.activity,
      now: () => new Date().toISOString(),
      newId: randomUUID,
      funnelFreshness: async () => ({
        quality: null,
        dataThrough: null,
        generatedAt: null,
      }),
    });
    const handlers: Record<
      ToolAction,
      (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>
    > = {
      spacebogam_experiments_overview: toolHandlers.overview,
      spacebogam_experiment_get: toolHandlers.getExperiment,
      spacebogam_experiment_record_observation:
        toolHandlers.recordObservation,
      spacebogam_experiment_propose_strategy: toolHandlers.proposeStrategy,
    };
    const services = new Map<string, BoardActionService>();

    function serviceFor(companyId: string) {
      const existing = services.get(companyId);
      if (existing !== undefined) return existing;
      const service = serviceFactory(ctx, companyId);
      services.set(companyId, service);
      return service;
    }

    registerExperimentBoardData(ctx, repository);

    ctx.actions.register("board-action", async (params, context) => {
      if (context.companyId === null) {
        throw new Error("Company-scoped board context is required");
      }
      return serviceFor(context.companyId).performBoardAction({
        action: params["action"],
        payload: params["payload"],
      }, context);
    });

    for (const toolName of TOOL_NAMES) {
      const declaration = (manifest.tools ?? []).find(
        (candidate) => candidate.name === toolName,
      );
      if (declaration === undefined) {
        throw new Error(`Missing manifest declaration for ${toolName}`);
      }
      ctx.tools.register(toolName, declaration, handlers[toolName]);
    }
  },

  async onHealth() {
    return { status: "ok", message: "spacebogam-experiments ready" };
  },
});
}

const plugin = createSpacebogamExperimentsWorkerPlugin();

export default plugin;
runWorker(plugin, import.meta.url);
