#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { createInterface } = require("node:readline");
const Module = require("node:module");
const path = require("node:path");

const PINNED_COMMIT = "3dd347e506040fbf614cd5af0dd739cbc77b8b2b";
const PINNED_TREE = "2f6fee3811c95ec4628ad6639f264c4aec108712";
const sourceDir = path.resolve(requiredEnv("AUTOTHREADS_SOURCE_DIR"));
const shimDir = path.join(__dirname, "shims");

process.env.NODE_PATH = [shimDir, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const sourceIntegrity = verifySource();
const upstreamDrafts = require(path.join(sourceDir, "dist-electron", "drafts.js"));

const tools = [
  {
    name: "autothreads_source_integrity",
    title: "Verify pinned autoTHREADS source",
    description: "Return the pinned upstream commit/tree and clean-worktree result. Read-only and network-free.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "autothreads_list_drafts",
    title: "List local autoTHREADS drafts",
    description: "List drafts through the unmodified upstream allDrafts function. Local files only; no account or network access.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "autothreads_create_draft",
    title: "Create local autoTHREADS draft",
    description: "Create one local draft through the unmodified upstream upsertDraft function. This cannot schedule or publish.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: 500 },
        id: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function git(...args) {
  return execFileSync("git", ["-C", sourceDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifySource() {
  const commit = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  const status = git("status", "--porcelain", "--untracked-files=no");
  if (commit !== PINNED_COMMIT || tree !== PINNED_TREE || status !== "") {
    throw new Error("autoTHREADS source integrity check failed");
  }
  return { repository: "eisenjimmy/autoTHREADS", commit, tree, clean: true };
}

function success(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
    isError: false,
  };
}

function failure(code, message) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: code },
    isError: true,
  };
}

async function callTool(name, args) {
  if (name === "autothreads_source_integrity") return success(sourceIntegrity);
  if (name === "autothreads_list_drafts") {
    return success({ drafts: upstreamDrafts.allDrafts() });
  }
  if (name === "autothreads_create_draft") {
    const input = args && typeof args === "object" && !Array.isArray(args) ? args : {};
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text || text.length > 500) return failure("invalid_text", "text must be 1 to 500 characters");
    if (input.id !== undefined && (typeof input.id !== "string" || input.id.length > 200 || input.id.length === 0)) {
      return failure("invalid_id", "id must be 1 to 200 characters");
    }
    const drafts = await upstreamDrafts.upsertDraft({
      id: input.id,
      kind: "post",
      text,
      status: "draft",
    });
    const created = input.id ? drafts.find((draft) => draft.id === input.id) : drafts[0];
    return success({ draft: created, count: drafts.length, publishable: false });
  }
  return failure("tool_not_found", `Unknown tool: ${name}`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return null;
  if (message.id === undefined) return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "autothreads-pinned-draft-sidecar", version: "0.1.0" },
      },
    };
  }
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id: message.id, result: { tools } };
  }
  if (message.method === "tools/call") {
    const params = message.params && typeof message.params === "object" ? message.params : {};
    return { jsonrpc: "2.0", id: message.id, result: await callTool(params.name, params.arguments) };
  }
  return {
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32601, message: "Method not found" },
  };
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  try {
    const response = await handle(JSON.parse(line));
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" },
    })}\n`);
  }
});
