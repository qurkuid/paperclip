import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

test("embedded PostgreSQL can leave process signals to the Paperclip shutdown coordinator", () => {
  const probe = `
    const before = process.listenerCount("SIGINT");
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const afterImport = process.listenerCount("SIGINT");
    new EmbeddedPostgres({ autoStopOnExit: false });
    const afterOptOut = process.listenerCount("SIGINT");
    new EmbeddedPostgres();
    const afterDefault = process.listenerCount("SIGINT");
    console.log(JSON.stringify({ before, afterImport, afterOptOut, afterDefault }));
  `;

  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: `${repoRoot}/server`,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const counts = JSON.parse(result.stdout.trim());
  assert.equal(counts.afterImport, counts.before, "importing must not claim process signals");
  assert.equal(counts.afterOptOut, counts.before, "opted-out instances must leave signals untouched");
  assert.equal(
    counts.afterDefault,
    counts.before + 1,
    "default instances must retain embedded-postgres automatic cleanup",
  );
});
