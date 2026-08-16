import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = path.join(repoRoot, "ecosystem.config.cjs");

test("PM2 restarts do not tree-kill Paperclip before graceful shutdown can persist running work", () => {
  // Given: the repository-owned PM2 process contract.
  assert.equal(
    existsSync(configPath),
    true,
    "ecosystem.config.cjs must define the safe Paperclip process topology",
  );

  // When: PM2 loads the Paperclip application definition.
  const config = require(configPath);
  const paperclip = config.apps?.find((app) => app.name === "paperclip");

  // Then: PM2 owns the real server process and leaves child processes to its shutdown handler.
  assert.ok(paperclip, "paperclip app definition must exist");
  assert.equal(paperclip.script, path.join(repoRoot, "cli/src/index.ts"));
  assert.equal(paperclip.interpreter, process.execPath);
  assert.deepEqual(paperclip.node_args.slice(0, 3), [
    "--require",
    path.join(repoRoot, "cli/node_modules/tsx/dist/preflight.cjs"),
    "--import",
  ]);
  assert.match(paperclip.node_args[3], /cli\/node_modules\/tsx\/dist\/loader\.mjs$/);
  assert.equal(paperclip.treekill, false);
  assert.ok(
    paperclip.kill_timeout >= 120_000,
    "graceful heartbeat drain needs more than PM2's 1.6 second default",
  );
});

test("PM2 direct-server command starts the Paperclip CLI without the tsx wrapper", () => {
  // Given: the repository-owned PM2 application definition.
  const config = require(configPath);
  const paperclip = config.apps.find((app) => app.name === "paperclip");

  // When: the configured interpreter loads the CLI entrypoint directly.
  const result = spawnSync(
    paperclip.interpreter,
    [...paperclip.node_args, paperclip.script, "--help"],
    { cwd: paperclip.cwd, encoding: "utf8" },
  );

  // Then: the direct server process is executable without a wrapper child.
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /paperclipai/i);
});

test("PM2 serves Vite modules under the authenticated /af proxy after a hard reload", () => {
  // Given: nginx forwards /af/* to Paperclip while root-relative assets belong to INTM.
  const config = require(configPath);
  const paperclip = config.apps.find((app) => app.name === "paperclip");

  // Then: Vite must emit /af-prefixed module URLs instead of root-relative URLs.
  assert.equal(
    paperclip.env?.PAPERCLIP_UI_BASE_PATH,
    "/af",
    "hard reloads need Vite assets to stay inside the authenticated /af proxy",
  );
});
