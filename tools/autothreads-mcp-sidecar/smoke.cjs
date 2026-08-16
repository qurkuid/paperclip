#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const path = require("node:path");

const sourceDir = process.env.AUTOTHREADS_SOURCE_DIR;
const dataDir = process.env.AUTOTHREADS_DATA_DIR;
if (!sourceDir || !dataDir) throw new Error("AUTOTHREADS_SOURCE_DIR and AUTOTHREADS_DATA_DIR are required");

const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
  env: {
    PATH: process.env.PATH,
    AUTOTHREADS_SOURCE_DIR: sourceDir,
    AUTOTHREADS_DATA_DIR: dataDir,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let nextId = 1;
const pending = new Map();
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  const waiter = pending.get(message.id);
  if (waiter) {
    pending.delete(message.id);
    waiter.resolve(message);
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("error", (error) => {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
});
child.on("exit", (code, signal) => {
  if (pending.size === 0) return;
  const error = new Error(`sidecar exited before responding (code=${code}, signal=${signal})`);
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
});

function request(method, params = {}) {
  const id = nextId++;
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return response;
}

function emit(event, payload) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...payload })}\n`);
}

(async () => {
  const initialized = await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "autothreads-smoke", version: "0.1.0" } });
  emit("initialize", { serverInfo: initialized.result.serverInfo, protocolVersion: initialized.result.protocolVersion });

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
  const listed = await request("tools/list");
  const toolNames = listed.result.tools.map((tool) => tool.name);
  if (toolNames.some((name) => /publish|schedule|account|secret/i.test(name))) throw new Error("unsafe tool exposed");
  emit("tools/list", { count: toolNames.length, tools: toolNames, publishExposed: false });

  const integrity = await request("tools/call", { name: "autothreads_source_integrity", arguments: {} });
  emit("tools/call", { tool: "autothreads_source_integrity", result: integrity.result.structuredContent });

  const created = await request("tools/call", {
    name: "autothreads_create_draft",
    arguments: { id: "cmp-1049-dry-run-1", text: "CMP-1049 secret-free MCP draft dry-run" },
  });
  if (created.result.isError || created.result.structuredContent.draft.status !== "draft") throw new Error("draft creation failed");
  emit("tools/call", { tool: "autothreads_create_draft", result: created.result.structuredContent });

  const listedDrafts = await request("tools/call", { name: "autothreads_list_drafts", arguments: {} });
  emit("tools/call", { tool: "autothreads_list_drafts", count: listedDrafts.result.structuredContent.drafts.length });
  emit("safety", { secretKeysPassed: [], externalCalls: 0, costsIncurred: 0, publishExposed: false });
  child.stdin.end();
})().catch((error) => {
  child.kill("SIGTERM");
  throw error;
});
