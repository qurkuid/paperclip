import { useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";

import type { BoardAction, RefreshAll } from "./types.js";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function useBoardAction(refreshAll: RefreshAll) {
  const perform = usePluginAction("board-action");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(input: BoardAction, successMessage: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await perform(input);
      if (
        typeof result === "object"
        && result !== null
        && "ok" in result
        && result.ok === false
      ) {
        const description = "message" in result && typeof result.message === "string"
          ? result.message
          : "작업이 거부되었습니다.";
        throw new Error(description);
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

  return { busy, error, message, run };
}
