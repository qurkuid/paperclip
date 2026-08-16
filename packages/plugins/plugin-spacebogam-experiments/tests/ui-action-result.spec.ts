import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { normalizeBoardActionResult } from "../src/ui/action-result.js";
import { useBoardAction } from "../src/ui/action-hook.js";
import type { BoardAction, RefreshAll } from "../src/ui/types.js";

type BoardActionRunner = ReturnType<typeof useBoardAction>;
type PerformBoardAction = (input: BoardAction) => Promise<unknown>;
type BoardActionRecoveryResult = {
  readonly ok: false;
  readonly kind: "conflict";
  readonly refresh: true;
  readonly reapply: true;
};

const input: BoardAction = {
  action: "start-experiment",
  payload: {
    experimentId: "22222222-2222-4222-8222-222222222222",
    version: 2,
  },
};

let performBoardAction: PerformBoardAction = async () => ({ ok: true });

vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  usePluginAction: () => performBoardAction,
}));

function renderHook(refreshAll: RefreshAll): BoardActionRunner {
  let hook: BoardActionRunner | null = null;
  function Harness() {
    hook = useBoardAction(refreshAll);
    return null;
  }
  renderToString(React.createElement(Harness));
  if (hook === null) throw new Error("hook did not render");
  return hook;
}

describe("Spacebogam UI board action result handling", () => {
  it("treats the exact success envelope as success and refreshes board data", async () => {
    const refreshAll = vi.fn();
    performBoardAction = async () => ({
      ok: true,
      requestId: "11111111-1111-4111-8111-111111111111",
      experimentId: "22222222-2222-4222-8222-222222222222",
      version: 3,
    });

    await expect(renderHook(refreshAll).run(input, "started")).resolves.toBe(true);

    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("normalizes the exact success envelope as success", () => {
    expect(normalizeBoardActionResult({
      ok: true,
      requestId: "11111111-1111-4111-8111-111111111111",
      experimentId: "22222222-2222-4222-8222-222222222222",
      version: 3,
    })).toEqual({ kind: "success" });
  });

  it("preserves generic Error messages from failed action calls", async () => {
    const refreshAll = vi.fn();
    performBoardAction = async () => {
      throw new Error("network unavailable");
    };

    const action = renderHook(refreshAll);

    await expect(action.run(input, "started")).resolves.toBe(false);

    expect(refreshAll).not.toHaveBeenCalled();
  });

  it("maps stale version envelopes to a conflict recovery signal", () => {
    expect(normalizeBoardActionResult({
      ok: false,
      code: "invalid_version",
      message: "Experiment version is stale.",
      requestId: "11111111-1111-4111-8111-111111111111",
    })).toMatchObject<BoardActionRecoveryResult>({
      ok: false,
      kind: "conflict",
      refresh: true,
      reapply: true,
    });
  });

  it("rejects malformed action envelopes instead of treating them as success", async () => {
    const refreshAll = vi.fn();
    performBoardAction = async () => ({
      requestId: "11111111-1111-4111-8111-111111111111",
      experimentId: "22222222-2222-4222-8222-222222222222",
      version: 3,
    });

    await expect(renderHook(refreshAll).run(input, "started")).resolves.toBe(false);

    expect(refreshAll).not.toHaveBeenCalled();
  });

  it("refreshes board data when stale version failures need recovery", async () => {
    const refreshAll = vi.fn();
    performBoardAction = async () => ({
      ok: false,
      code: "invalid_version",
      message: "Experiment version is stale",
      requestId: "11111111-1111-4111-8111-111111111111",
    });

    const result = await renderHook(refreshAll).run(input, "started");

    expect(result).toBe(false);
    expect(refreshAll).toHaveBeenCalledOnce();
  });
});
