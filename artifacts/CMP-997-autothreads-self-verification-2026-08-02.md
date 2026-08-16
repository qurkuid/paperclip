# CMP-997 autoTHREADS self-verification

Date: 2026-08-02 (KST)

## Purpose and scope

Verified the review-gated autoTHREADS plugin for the approved CMP-839 plan
scope: namespace migration, company-scoped operations, secret references,
approval-gated state changes, idempotency, rollback, and publish safety.
No Spacebogam public website files were changed.

## Change

Provider exception text is no longer retained anywhere in the plugin database.
The plugin stores a fixed, non-sensitive recovery message instead, so a token
or other credential echoed by an upstream provider cannot reach a response,
activity entry, database record, or UI.

## Automated evidence

`pnpm --filter @paperclipai/plugin-autothreads test`

- 8 tests passed.
- A different-company content action returns `content_not_found`.
- A content item cannot be scheduled before review and final approval.
- Rollback clears the scheduled time and revokes approval in the same company.
- The company kill switch performs no secret resolution or database write.
- A simulated provider error containing `Bearer provider-secret-value` is not
  persisted; only the fixed recovery message is stored.

`pnpm --filter @paperclipai/plugin-autothreads typecheck`

- Passed.

`pnpm --filter @paperclipai/plugin-autothreads build`

- Passed.

The package test was rerun after build: 8 tests passed.

## UI and runtime evidence

The plugin source shows connection state only, never the token value, and
states that immediate/automatic publishing is unavailable. The runtime board
could not be opened in this heartbeat: the assigned Paperclip API endpoint
`127.0.0.1:3100` was unavailable. No server was restarted, to avoid disrupting
other agents' work.

`pnpm check:token-gates` was run but failed on 25 pre-existing, unrelated UI
violations in `TaskFlowDetailPanel.tsx`, `TaskFlowView.tsx`, and
`ToolActionDecisionPreview.tsx`. The autoTHREADS plugin contains no files in
that gate's reported list.

## Remaining operational check

An instance administrator should start or restore the Paperclip service, open
the installed autoTHREADS page for the company, and confirm it shows only
connection state plus the review/approval/schedule flow. Do not enter or expose
a Threads token during that check.
