#!/usr/bin/env node

import {
  getIdentityConfig,
  getSendConfig,
  parseArgs,
  parseDecisionCommand,
  requireFlag,
  requireUuid,
} from "./config.mjs";
import { validateDecisionPackage } from "./contract.mjs";
import { OperationError, UsageError } from "./errors.mjs";
import { formatDecisionMessage } from "./format.mjs";
import { readState, writeState } from "./state.mjs";
import { paperclipFetch, telegramFetch } from "./transport.mjs";

const HELP = `Paperclip Telegram decision bridge for Hermes

Usage:
  paperclip-decision.mjs send --sender <telegram-sender-id> --issue <uuid> --interaction <uuid>
  paperclip-decision.mjs resolve --sender <telegram-sender-id> --command "decision <issue-uuid>:<interaction-uuid> <expected-revision> approve|reject [optional-note]"

Environment:
  PAPERCLIP_API_URL
  PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS
  TELEGRAM_ALLOWED_USERS
  TELEGRAM_BOT_TOKEN
  TELEGRAM_HOME_CHANNEL
  PAPERCLIP_TELEGRAM_STATE_FILE
  TELEGRAM_API_BASE_URL              Optional mock/proxy base. Defaults to Telegram Bot API.
  PAPERCLIP_DECISION_TIMEOUT_MS      Optional request timeout from 50 to 60000ms.

The sender-specific Paperclip credentials must be board credentials. Agent and
task-bridge credentials are never used for resolution. Output never includes
credentials, Telegram sender ids, or Telegram channel ids.`;

function printSuccess(command, status) {
  process.stdout.write(`${JSON.stringify({ ok: true, command, status })}\n`);
}

async function sendDecision(args) {
  const sender = requireFlag(args, "sender");
  const issueId = requireUuid(requireFlag(args, "issue"), "--issue");
  const interactionId = requireUuid(requireFlag(args, "interaction"), "--interaction");
  const config = getSendConfig(sender);
  const rawPackage = await paperclipFetch(
    config,
    `/issues/${issueId}/interactions/${interactionId}/decision-package`,
  );
  const decision = validateDecisionPackage(rawPackage, issueId, interactionId);
  const text = formatDecisionMessage(decision, issueId, interactionId);
  const state = await readState(config.stateFile);
  const stateKey = `${interactionId}:${decision.revision}`;
  const existingMessageId = state.messages[stateKey];

  if (existingMessageId === undefined) {
    const result = await telegramFetch(config, "sendMessage", {
      chat_id: config.telegramChannel,
      text,
      disable_web_page_preview: true,
    });
    const messageId = result?.result?.message_id;
    if (!Number.isInteger(messageId) || messageId <= 0) {
      throw new OperationError("Telegram API returned an invalid message id");
    }
    state.messages[stateKey] = messageId;
    await writeState(config.stateFile, state);
    printSuccess("send", "sent");
    return;
  }

  await telegramFetch(config, "editMessageText", {
    chat_id: config.telegramChannel,
    message_id: existingMessageId,
    text,
    disable_web_page_preview: true,
  });
  printSuccess("send", "updated");
}

async function resolveDecision(args) {
  const sender = requireFlag(args, "sender");
  const parsed = parseDecisionCommand(requireFlag(args, "command"));
  const config = getIdentityConfig(sender);
  const body = { expectedRevision: parsed.expectedRevision };
  if (parsed.action === "reject" && parsed.note !== null) {
    body.reason = parsed.note;
  }
  await paperclipFetch(
    config,
    `/issues/${parsed.issueId}/interactions/${parsed.interactionId}/${parsed.action === "approve" ? "accept" : "reject"}`,
    {
      method: "POST",
      body,
    },
  );
  printSuccess("resolve", parsed.action === "approve" ? "accepted" : "rejected");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === "--help" || command === "-h" || args.help === true) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (args._.length !== 1) throw new UsageError("Provide exactly one command");
  if (command === "send") {
    await sendDecision(args);
    return;
  }
  if (command === "resolve") {
    await resolveDecision(args);
    return;
  }
  throw new UsageError("Command must be send or resolve");
}

main().catch((error) => {
  if (error instanceof UsageError) {
    process.stderr.write(`Usage error: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  const message = error instanceof OperationError ? error.message : "Decision bridge failed";
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
