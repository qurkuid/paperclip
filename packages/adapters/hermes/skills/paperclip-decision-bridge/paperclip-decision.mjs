#!/usr/bin/env node

import {
  getIdentityConfig,
  getSendConfig,
  parseArgs,
  parseDecisionCommand,
  requireFlag,
  requireUuid,
} from "./config.mjs";
import { validateDecisionNotice, validateDecisionPackage } from "./contract.mjs";
import { OperationError, UsageError } from "./errors.mjs";
import { formatDecisionMessage, formatDecisionNotice } from "./format.mjs";
import { readState, writeState } from "./state.mjs";
import { paperclipFetch, telegramFetch } from "./transport.mjs";

const HELP = `Paperclip Telegram decision bridge for Hermes

Usage:
  paperclip-decision.mjs send --sender <telegram-sender-id> --issue <uuid> --interaction <uuid>
  paperclip-decision.mjs notify --sender <telegram-sender-id> --issue <uuid> --interaction <uuid>
  paperclip-decision.mjs poll --sender <telegram-sender-id> --company <uuid>
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
  const status = await deliver(
    config,
    `${interactionId}:${decision.revision}`,
    formatDecisionMessage(decision, issueId, interactionId),
  );
  printSuccess("send", status);
}

/**
 * Deliver a Telegram message under a state key, editing in place when the same
 * key was already delivered. Returns "sent" or "updated".
 */
async function deliver(config, stateKey, text) {
  const state = await readState(config.stateFile);
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
    return "sent";
  }

  await telegramFetch(config, "editMessageText", {
    chat_id: config.telegramChannel,
    message_id: existingMessageId,
    text,
    disable_web_page_preview: true,
  });
  return "updated";
}

async function notifyDecision(args) {
  const sender = requireFlag(args, "sender");
  const issueId = requireUuid(requireFlag(args, "issue"), "--issue");
  const interactionId = requireUuid(requireFlag(args, "interaction"), "--interaction");
  const config = getSendConfig(sender);
  const rawPackage = await paperclipFetch(
    config,
    `/issues/${issueId}/interactions/${interactionId}/decision-package`,
  );
  const notice = validateDecisionNotice(rawPackage, issueId, interactionId);
  const status = await deliver(
    config,
    `notice:${interactionId}:${notice.revision}`,
    formatDecisionNotice(notice),
  );
  printSuccess("notify", status);
}

const INTERACTION_ATTENTION_ID_RE = /^issue_thread_interaction:interaction:([0-9a-f-]{36})$/;

/**
 * Sweep a company's queued decisions and deliver every pending one: the full
 * resolvable package when its evidence is complete, otherwise a pointer-only
 * notice. Re-running is safe — delivery is keyed by interaction and revision,
 * so an unchanged item is edited in place rather than re-posted.
 *
 * Reads the attention feed rather than the queue item listing because only the
 * feed carries the related issue, and the decision-package endpoint is scoped
 * by issue.
 */
async function pollDecisions(args) {
  const sender = requireFlag(args, "sender");
  const companyId = requireUuid(requireFlag(args, "company"), "--company");
  const config = getSendConfig(sender);
  const feed = await paperclipFetch(config, `/companies/${companyId}/attention?all=true`);
  const items = Array.isArray(feed?.items) ? feed.items : null;
  if (!items) throw new OperationError("Attention feed is malformed");

  const counts = { sent: 0, updated: 0, notified: 0, skipped: 0 };
  for (const item of items) {
    if (item?.sourceKind !== "issue_thread_interaction") continue;
    if (!Array.isArray(item.queues) || item.queues.length === 0) continue;

    const interactionId = INTERACTION_ATTENTION_ID_RE.exec(item.id ?? "")?.[1] ?? null;
    const issueId = typeof item.relatedIssue?.id === "string" ? item.relatedIssue.id : null;
    if (!interactionId || !issueId) {
      counts.skipped += 1;
      continue;
    }

    const rawPackage = await paperclipFetch(
      config,
      `/issues/${issueId}/interactions/${interactionId}/decision-package`,
    );
    let text;
    let stateKey;
    let complete = true;
    try {
      const decision = validateDecisionPackage(rawPackage, issueId, interactionId);
      text = formatDecisionMessage(decision, issueId, interactionId);
      stateKey = `${interactionId}:${decision.revision}`;
    } catch {
      complete = false;
      const notice = validateDecisionNotice(rawPackage, issueId, interactionId);
      text = formatDecisionNotice(notice);
      stateKey = `notice:${interactionId}:${notice.revision}`;
    }
    const status = await deliver(config, stateKey, text);
    if (!complete) counts.notified += 1;
    else counts[status] += 1;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: "poll", ...counts })}\n`);
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
  if (command === "notify") {
    await notifyDecision(args);
    return;
  }
  if (command === "poll") {
    await pollDecisions(args);
    return;
  }
  if (command === "resolve") {
    await resolveDecision(args);
    return;
  }
  throw new UsageError("Command must be send, notify, poll, or resolve");
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
