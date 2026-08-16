import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { TOOL_ACTIONS } from "./contracts/index.js";

export const PLUGIN_ID = "paperclipai.plugin-spacebogam-experiments";
export const ROUTE_PATH = "spacebogam-experiments";
export const SPACEBOGAM_AGENT_KEY = "spacebogam-experiment-operator";
export const ROUTINE_KEY = "spacebogam-experiment-review";
export const TOOL_NAMES = TOOL_ACTIONS;

const experimentIdSchema = {
  type: "object",
  properties: {
    companyId: { type: "string", format: "uuid" },
    experimentId: { type: "string", format: "uuid" },
  },
  required: ["companyId", "experimentId"],
  additionalProperties: false,
};

const idempotencyKeyProperty = {
  type: "string",
  pattern: "^[A-Za-z0-9._:-]+$",
  minLength: 1,
  maxLength: 120,
};

const tools = [
  {
    name: TOOL_NAMES[0],
    displayName: "공간보감 실험 목록",
    description: "현재 회사의 실험, 표본 집계, 최근 관찰을 구조화해 읽습니다.",
    parametersSchema: {
      type: "object",
      properties: {
        companyId: { type: "string", format: "uuid" },
        includeArchived: { type: "boolean" },
        status: {
          type: "array",
          items: {
            type: "string",
            enum: ["draft", "running", "paused", "completed", "cancelled"],
          },
        },
      },
      required: ["companyId"],
      additionalProperties: false,
    },
  },
  {
    name: TOOL_NAMES[1],
    displayName: "공간보감 실험 상세",
    description: "실험 설계, variant 집계, snapshot과 관찰을 읽습니다.",
    parametersSchema: experimentIdSchema,
  },
  {
    name: TOOL_NAMES[2],
    displayName: "공간보감 실험 관찰 기록",
    description: "실험 상태나 결과를 바꾸지 않고 append-only 관찰을 기록합니다.",
    parametersSchema: {
      type: "object",
      properties: {
        companyId: { type: "string", format: "uuid" },
        experimentId: { type: "string", format: "uuid" },
        kind: { type: "string", enum: ["note", "measurement"] },
        summary: { type: "string", minLength: 1, maxLength: 4000 },
        evidenceMarkdown: { type: "string", minLength: 1, maxLength: 8000 },
        idempotencyKey: idempotencyKeyProperty,
      },
      required: ["companyId", "experimentId", "kind", "summary", "idempotencyKey"],
      additionalProperties: false,
    },
  },
  {
    name: TOOL_NAMES[3],
    displayName: "공간보감 실험 전략 제안",
    description: "책임 에이전트가 근거와 전략을 이슈 문서 및 의사결정 검토로 제출합니다.",
    parametersSchema: {
      type: "object",
      properties: {
        companyId: { type: "string", format: "uuid" },
        experimentId: { type: "string", format: "uuid" },
        proposal: { type: "string", minLength: 1, maxLength: 4000 },
        evidenceMarkdown: { type: "string", minLength: 1, maxLength: 8000 },
        idempotencyKey: idempotencyKeyProperty,
      },
      required: [
        "companyId",
        "experimentId",
        "proposal",
        "evidenceMarkdown",
        "idempotencyKey",
      ],
      additionalProperties: false,
    },
  },
];

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "실험 운영",
  description: "First-party Spacebogam lead-funnel experiment operations for variants, outcomes, observations, and strategy review.",
  author: "Paperclip",
  categories: ["automation", "ui"],
  capabilities: [
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "secrets.read-ref",
    "activity.read",
    "activity.log.write",
    "issues.read",
    "issues.create",
    "issues.update",
    "issues.wakeup",
    "issue.comments.read",
    "issue.comments.create",
    "issue.interactions.create",
    "issue.documents.read",
    "issue.documents.write",
    "agents.read",
    "agents.managed",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "routines.managed",
    "agent.tools.register",
    "api.routes.register",
    "ui.sidebar.register",
    "ui.page.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      leadHashSecret: {
        type: "string",
        format: "secret-ref",
        title: "리드 식별 키 해시 비밀",
        description: "리드 식별 키를 HMAC으로 비식별화하는 회사 전용 비밀입니다.",
      },
      linkedProjectId: {
        type: "string",
        format: "uuid",
        title: "기본 프로젝트",
      },
      legacyIssueId: {
        type: "string",
        format: "uuid",
        title: "기존 운영 문서",
        description: "실험 페이지 상단 배너에 연결할 기존 운영 문서 이슈입니다.",
      },
    },
    required: ["leadHashSecret"],
    additionalProperties: false,
  },
  database: {
    namespaceSlug: "spacebogam_experiments",
    migrationsDir: "migrations",
    coreReadTables: ["companies", "issues", "issue_comments", "agents", "projects"],
  },
  agents: [
    {
      agentKey: SPACEBOGAM_AGENT_KEY,
      displayName: "Spacebogam Experiment Operator",
      role: "general",
      title: "Experiment Operator",
      icon: "target",
      capabilities: "Reads Spacebogam experiments, checks the matching INTM funnel report through the existing MCP, records bounded observations, and submits reviewable strategies through plugin tools.",
      adapterPreference: ["claude_local", "codex_local", "gemini_local", "opencode_local"],
      permissions: { pluginTools: [PLUGIN_ID] },
      status: "paused",
      budgetMonthlyCents: 0,
    },
  ],
  routines: [
    {
      routineKey: ROUTINE_KEY,
      title: "Review Spacebogam experiments",
      description: "Use the experiment overview/get tools, inspect the matching INTM funnel report through the existing INTM MCP, record only non-PII observations, and submit any strategy through the proposal tool for Paperclip approval. Never mutate experiment lifecycle, variants, or lead outcomes.",
      status: "paused",
      priority: "medium",
      assigneeRef: { resourceKind: "agent", resourceKey: SPACEBOGAM_AGENT_KEY },
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
      triggers: [{
        kind: "schedule",
        label: "Weekly",
        enabled: true,
        cronExpression: "0 9 * * 1",
        timezone: "Asia/Seoul",
        signingMode: null,
        replayWindowSec: null,
      }],
    },
  ],
  tools,
  apiRoutes: [
    {
      routeKey: "overview",
      method: "GET",
      path: "/overview",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
  ],
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "spacebogam-experiments-sidebar",
        displayName: "전체 현황",
        exportName: "SpacebogamExperimentsSidebar",
        order: 60,
      },
      {
        type: "page",
        id: "spacebogam-experiments-page",
        displayName: "실험 운영",
        exportName: "SpacebogamExperimentsPage",
        routePath: ROUTE_PATH,
      },
    ],
  },
};

export default manifest;
