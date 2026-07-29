import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HEARTBEAT_RUN_SCRATCH_MARKER,
  RUN_SCRATCH_DIR_NAME_MAX_BYTES,
  UNIX_SOCKET_PATH_MAX_BYTES,
  buildHeartbeatRunScratchEnv,
  cleanupHeartbeatRunScratch,
  prepareHeartbeatRunScratch,
  type HeartbeatRunScratch,
} from "./run-scratch.js";

const cleanupDirs = new Set<string>();

async function trackScratch(scratch: HeartbeatRunScratch) {
  cleanupDirs.add(scratch.dir);
  return scratch;
}

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupDirs, (dir) =>
      fs.rm(dir, { recursive: true, force: true }).catch(() => undefined),
    ),
  );
  cleanupDirs.clear();
});

describe("heartbeat run scratch cleanup", () => {
  it("removes only a marked run-owned scratch directory", async () => {
    const scratch = await trackScratch(await prepareHeartbeatRunScratch({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
      issueId: "issue-1",
      issueIdentifier: "PAP-13071",
      now: new Date("2026-07-08T00:00:00.000Z"),
    }));
    await fs.writeFile(path.join(scratch.dir, "tool-cache.txt"), "cache");

    const result = await cleanupHeartbeatRunScratch({ scratch });

    expect(result).toEqual({ removed: true, dir: scratch.dir });
    await expect(fs.stat(scratch.dir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves paperclip-named directories without the ownership marker", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-run-unmarked-"));
    cleanupDirs.add(dir);
    const scratch: HeartbeatRunScratch = {
      dir,
      markerPath: path.join(dir, HEARTBEAT_RUN_SCRATCH_MARKER),
      metadata: {
        version: 1,
        companyId: "company-1",
        agentId: "agent-1",
        runId: "run-1",
        issueId: null,
        issueIdentifier: null,
        createdAt: new Date("2026-07-08T00:00:00.000Z").toISOString(),
      },
    };

    const result = await cleanupHeartbeatRunScratch({ scratch });

    expect(result).toEqual({ removed: false, dir, reason: "unmarked" });
    await expect(fs.stat(dir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("preserves marked scratch when the marker owner does not match the run", async () => {
    const scratch = await trackScratch(await prepareHeartbeatRunScratch({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
    }));
    const mismatched = {
      ...scratch,
      metadata: {
        ...scratch.metadata,
        runId: "run-2",
      },
    };

    const result = await cleanupHeartbeatRunScratch({ scratch: mismatched });

    expect(result).toEqual({ removed: false, dir: scratch.dir, reason: "owner_mismatch" });
    await expect(fs.stat(scratch.dir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("skips cleanup while the run process group is still alive", async () => {
    const scratch = await trackScratch(await prepareHeartbeatRunScratch({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
    }));

    const result = await cleanupHeartbeatRunScratch({
      scratch,
      processGroupId: 123,
      isProcessGroupAlive: () => true,
    });

    expect(result).toEqual({ removed: false, dir: scratch.dir, reason: "process_group_alive" });
    await expect(fs.stat(scratch.dir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("keeps the scratch directory short enough for sockets nested tools create under TMPDIR", async () => {
    // Runs export TMPDIR=<scratch dir>, so tools launched inside a run create
    // their sockets under it. tsx uses `$TMPDIR/tsx-<uid>/<pid>.pipe`; on macOS
    // a unix socket path over 104 bytes fails with EINVAL before any of our
    // code runs, which previously killed the server on every boot.
    const scratch = await trackScratch(await prepareHeartbeatRunScratch({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "76ad58c4-74d9-4c1e-9f0b-2f1d3e4a5b6c",
      issueId: "issue-1",
      issueIdentifier: "CMP-222",
    }));

    // Asserted on the directory name and a macOS-shaped tmpdir rather than the
    // local absolute path: a runner with a short tmpdir (Linux `/tmp`) passes
    // even a badly oversized name, which would let the regression back in.
    const dirName = path.basename(scratch.dir);
    expect(Buffer.byteLength(dirName)).toBeLessThanOrEqual(RUN_SCRATCH_DIR_NAME_MAX_BYTES);

    const macosTmpdir = "/var/folders/4p/c2wtkht16pnc5cvhgp757v900000gn/T";
    const worstCaseNestedSocket = path.join(macosTmpdir, dirName, "tsx-999999", "9999999.pipe");
    expect(Buffer.byteLength(worstCaseNestedSocket)).toBeLessThanOrEqual(UNIX_SOCKET_PATH_MAX_BYTES);
  });

  it("still removes legacy paperclip-run- scratch directories", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-run-cmp-222-76ad58c4-74d-"));
    cleanupDirs.add(dir);
    const metadata = {
      version: 1 as const,
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
      issueId: null,
      issueIdentifier: null,
      createdAt: new Date("2026-07-08T00:00:00.000Z").toISOString(),
    };
    const markerPath = path.join(dir, HEARTBEAT_RUN_SCRATCH_MARKER);
    await fs.writeFile(markerPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });

    const result = await cleanupHeartbeatRunScratch({ scratch: { dir, markerPath, metadata } });

    expect(result).toEqual({ removed: true, dir });
    await expect(fs.stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("builds explicit scratch env without clobbering configured temp dirs", async () => {
    const scratch = await trackScratch(await prepareHeartbeatRunScratch({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
    }));

    const result = buildHeartbeatRunScratchEnv({ TMPDIR: "/custom/tmp" }, scratch);

    expect(result.env.PAPERCLIP_RUN_SCRATCH_DIR).toBe(scratch.dir);
    expect(result.env.PAPERCLIP_TASK_SCRATCH_DIR).toBe(scratch.dir);
    expect(result.env.PAPERCLIP_SCRATCH_DIR).toBe(scratch.dir);
    expect(result.env.PAPERCLIP_TMPDIR).toBe(scratch.dir);
    expect(result.env.TMPDIR).toBeUndefined();
    expect(result.env.TEMP).toBe(scratch.dir);
    expect(result.env.TMP).toBe(scratch.dir);
    expect(result.tempKeysApplied).toEqual(["TEMP", "TMP"]);
  });
});
