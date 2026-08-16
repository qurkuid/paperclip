import { useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";

import { normalizeBoardActionResult, type BoardActionConflictResult } from "./action-result.js";
import type { BoardAction, RefreshAll } from "./types.js";

type BoardActionRunOptions = {
  readonly onConflict?: (result: BoardActionConflictResult) => void;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function useBoardAction(refreshAll: RefreshAll) {
  const perform = usePluginAction("board-action");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<BoardActionConflictResult | null>(null);

  async function run(
    input: BoardAction,
    successMessage: string,
    options?: BoardActionRunOptions,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setRecovery(null);
    try {
      const result = await perform(input);
      const normalized = normalizeBoardActionResult(result);
      if (normalized.kind === "conflict") {
        setError(normalized.message);
        setRecovery(normalized);
        options?.onConflict?.(normalized);
        refreshAll();
        return false;
      }
      if (normalized.kind === "failure") {
        throw new Error(normalized.message);
      }
      setMessage(successMessage);
      refreshAll();
      return true;
    } catch (caught) {
      setError(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, message, recovery, run };
}
