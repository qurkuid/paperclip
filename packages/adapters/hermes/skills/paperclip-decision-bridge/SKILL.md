---
name: paperclip-decision-bridge
description: Deliver complete Paperclip decision packages to an allowlisted Hermes Telegram channel and resolve them with exact revision-checked commands.
---

# Paperclip Decision Bridge

Use this skill only for deterministic delivery and resolution of Paperclip
decision interactions through the existing Hermes Telegram channel.

The helper, not the LLM, parses resolution commands. An LLM must never
reinterpret, repair, translate, summarize, or infer a command before mutation.
Only the literal input received from the allowlisted Telegram sender may be
passed to `resolve`.

## Required Environment

Configure secrets in the Hermes runtime environment. Never paste them into a
prompt, repository file, issue, or log:

- `PAPERCLIP_API_URL` - Paperclip base URL, with or without `/api`.
- `PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS` - strict JSON object mapping each
  allowlisted Telegram sender id to that person's Paperclip board API
  credential.
- `TELEGRAM_ALLOWED_USERS` - comma- or whitespace-delimited Telegram sender
  allowlist.
- `TELEGRAM_BOT_TOKEN` - existing Hermes Telegram bot token.
- `TELEGRAM_HOME_CHANNEL` - existing Hermes Telegram destination.
- `PAPERCLIP_TELEGRAM_STATE_FILE` - local file used only for the map from
  interaction id plus revision to Telegram message id.

Optional:

- `TELEGRAM_API_BASE_URL` - defaults to `https://api.telegram.org`; override
  only for an approved proxy or test server.
- `PAPERCLIP_DECISION_TIMEOUT_MS` - request timeout from 50 to 60000ms.

Do not use `PAPERCLIP_BRIDGE_API_KEY`, `PAPERCLIP_API_KEY`, or an agent API key.
Decision endpoints are board-only. The sender must appear in both
`TELEGRAM_ALLOWED_USERS` and `PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS`.

## Send a Decision Package

```sh
node ./paperclip-decision.mjs send \
  --sender "123456789" \
  --issue "$PAPERCLIP_ISSUE_ID" \
  --interaction "$PAPERCLIP_INTERACTION_ID"
```

Replace `123456789` with the exact `**User ID:** <id>` from the current Hermes
inbound Telegram platform context. Hermes v0.13 does not expose that identity
as `TELEGRAM_SENDER_ID`. Never infer a sender, use a default, or substitute the
channel/chat id. Pass the literal current inbound User ID; the helper then
requires that same value in both the allowlist and board credential map.

The helper requests Paperclip's safe decision projection, then refuses delivery
unless evidence is complete, the interaction is pending and resolvable, and its
expiry is still in the future. It formats company, issue, interaction,
revision, reason, options, KPI, sample, freshness, as-of time, expiry, status,
and safe links. It never includes attachment bodies, raw lead/contact fields,
credentials, or Telegram sender/channel ids in output.

Retrying the same interaction revision edits the existing Telegram message.
The local state file stores only `interaction id + revision -> Telegram message
id`; it does not store decision content or credentials.

## Resolve an Exact Command

Pass the literal Telegram message as one `--command` value:

```sh
node ./paperclip-decision.mjs resolve \
  --sender "123456789" \
  --command "decision $ISSUE_ID:$INTERACTION_ID $EXPECTED_REVISION approve"

node ./paperclip-decision.mjs resolve \
  --sender "123456789" \
  --command "decision $ISSUE_ID:$INTERACTION_ID $EXPECTED_REVISION reject Needs another sample window"
```

The accepted grammar is exactly:

```text
decision <issue-uuid>:<interaction-uuid> <expected-revision> approve
decision <issue-uuid>:<interaction-uuid> <expected-revision> reject [optional-note]
```

Approve does not accept a note because the canonical accept endpoint only
accepts `expectedRevision`. A reject note is sent only as the canonical reject
reason. Free-form requests, uppercase actions, malformed identifiers,
multi-line input, stale revisions, expired interactions, replayed decisions,
cross-company targets, and unregistered senders fail closed.
