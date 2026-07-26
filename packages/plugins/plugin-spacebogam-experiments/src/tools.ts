import type { ToolResult } from "@paperclipai/plugin-sdk";

import { createReadToolHandlers } from "./tools/read-handlers.js";
import type { ExperimentToolDeps } from "./tools/support.js";
import { createWriteToolHandlers } from "./tools/write-handlers.js";

export type { ExperimentToolDeps } from "./tools/support.js";

export function createExperimentToolHandlers(deps: ExperimentToolDeps) {
  const idempotentResults = new Map<string, ToolResult>();
  return {
    ...createReadToolHandlers(deps),
    ...createWriteToolHandlers(deps, idempotentResults),
  };
}
