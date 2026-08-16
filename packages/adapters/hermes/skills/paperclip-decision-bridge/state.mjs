import fs from "node:fs/promises";
import path from "node:path";

import { OperationError } from "./errors.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readState(stateFile) {
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    const state = JSON.parse(raw);
    if (!isRecord(state) || state.version !== 1 || !isRecord(state.messages)) {
      throw new OperationError("Telegram decision state file is invalid");
    }
    const messages = {};
    for (const [revision, messageId] of Object.entries(state.messages)) {
      if (
        typeof revision !== "string"
        || revision.length === 0
        || !Number.isInteger(messageId)
        || messageId <= 0
      ) {
        throw new OperationError("Telegram decision state file is invalid");
      }
      messages[revision] = messageId;
    }
    return { version: 1, messages };
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, messages: {} };
    if (error instanceof OperationError) throw error;
    throw new OperationError("Telegram decision state file is invalid");
  }
}

export async function writeState(stateFile, state) {
  const directory = path.dirname(stateFile);
  const temporaryFile = `${stateFile}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryFile, stateFile);
  } catch {
    await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
    throw new OperationError("Unable to persist Telegram decision delivery state");
  }
}
