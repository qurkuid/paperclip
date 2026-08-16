import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-autothreads";
export const ROUTE_PATH = "autothreads";
export const PUBLISH_JOB_KEY = "publish-due-content";
export const TOOL_NAMES = ["list_contents", "create_draft", "submit_for_review"] as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "autoTHREADS",
  description: "Review-gated, scheduled Threads text publishing. Publishing is paused by default.",
  author: "Paperclip",
  categories: ["automation", "ui"],
  capabilities: [
    "api.routes.register",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "jobs.schedule",
    "http.outbound",
    "secrets.read-ref",
    "activity.log.write",
    "agent.tools.register",
    "ui.sidebar.register",
    "ui.page.register",
    "instance.settings.register",
  ],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  instanceConfigSchema: {
    type: "object",
    properties: {
      threadsAccessTokenRef: { type: "string", format: "secret-ref", title: "Threads access token" },
      threadsUserId: { type: "string", title: "Threads user ID" },
      reviewerPrincipalIds: { type: "array", items: { type: "string" }, default: [] },
      approverPrincipalIds: { type: "array", items: { type: "string" }, default: [] },
      publishingPaused: { type: "boolean", default: true },
    },
    allOf: [{
      if: { properties: { publishingPaused: { const: false } }, required: ["publishingPaused"] },
      then: {
        required: ["threadsAccessTokenRef", "threadsUserId", "reviewerPrincipalIds", "approverPrincipalIds"],
        properties: {
          reviewerPrincipalIds: { minItems: 1 },
          approverPrincipalIds: { minItems: 1 },
        },
      },
    }],
    additionalProperties: false,
  },
  database: { namespaceSlug: "autothreads", migrationsDir: "migrations" },
  jobs: [{
    jobKey: PUBLISH_JOB_KEY,
    displayName: "Publish approved Threads content",
    description: "Publishes only due, approved current revisions while the company kill switch is off.",
    schedule: "* * * * *",
  }],
  tools: [
    {
      name: "list_contents",
      displayName: "List autoTHREADS content",
      description: "List this company's autoTHREADS drafts and their review or publication state. This does not publish content.",
      parametersSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "create_draft",
      displayName: "Create autoTHREADS draft",
      description: "Create a Threads text draft for human review. It remains a draft and cannot publish from this tool.",
      parametersSchema: {
        type: "object",
        properties: { body: { type: "string", minLength: 1, maxLength: 500 }, idempotencyKey: { type: "string", minLength: 1, maxLength: 200 } },
        required: ["body", "idempotencyKey"],
        additionalProperties: false,
      },
    },
    {
      name: "submit_for_review",
      displayName: "Submit autoTHREADS draft for review",
      description: "Submit a current draft for human review. This cannot approve, schedule, or publish content.",
      parametersSchema: {
        type: "object",
        properties: { contentId: { type: "string" }, expectedRevision: { type: "integer", minimum: 1 } },
        required: ["contentId", "expectedRevision"],
        additionalProperties: false,
      },
    },
  ],
  apiRoutes: [
    { routeKey: "contents", method: "GET", path: "/contents", auth: "board-or-agent", capability: "api.routes.register", companyResolution: { from: "query", key: "companyId" } },
    { routeKey: "contents-create", method: "POST", path: "/contents", auth: "board-or-agent", capability: "api.routes.register", companyResolution: { from: "body", key: "companyId" } },
    { routeKey: "content-action", method: "POST", path: "/contents/:contentId/:action", auth: "board-or-agent", capability: "api.routes.register", companyResolution: { from: "body", key: "companyId" } },
    { routeKey: "health", method: "GET", path: "/health", auth: "board-or-agent", capability: "api.routes.register", companyResolution: { from: "query", key: "companyId" } },
  ],
  ui: { slots: [
    { type: "sidebar", id: "autothreads-sidebar", displayName: "autoTHREADS", exportName: "AutoThreadsSidebar", order: 65 },
    { type: "page", id: "autothreads-page", displayName: "autoTHREADS", exportName: "AutoThreadsPage", routePath: ROUTE_PATH },
    { type: "settingsPage", id: "autothreads-settings", displayName: "autoTHREADS", exportName: "AutoThreadsSettings" },
  ] },
};

export default manifest;
