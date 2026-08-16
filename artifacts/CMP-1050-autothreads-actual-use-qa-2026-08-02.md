# CMP-1050 — autoTHREADS actual-use verification

## Background

The latest request asks that autoTHREADS be usable in practice and that the
original GitHub function be implemented and exercised. This verification keeps
the issue's existing safety limits: no real Threads account, secret value,
external post, or new paid request.

## What was run

```sh
AUTOTHREADS_SOURCE_DIR="$PWD/artifacts/CMP-1049-autothreads-upstream" \
AUTOTHREADS_DATA_DIR="$PAPERCLIP_RUN_SCRATCH_DIR/autothreads-actual-use-data" \
node tools/autothreads-mcp-sidecar/smoke.cjs

pnpm --filter @paperclipai/plugin-autothreads test -- --run
```

## Results

- The retained upstream checkout is exactly commit
  `3dd347e506040fbf614cd5af0dd739cbc77b8b2b`, tree
  `2f6fee3811c95ec4628ad6639f264c4aec108712`, and clean.
- The draft sidecar completed MCP initialization, tool discovery, source
  integrity, draft creation, and draft listing in a new run-owned data folder.
- Only three tools were exposed: source check, draft list, and draft creation.
  No publish, schedule, account, or secret tool was exposed.
- The run recorded no secret keys, external calls, or costs. The created item
  stayed a local `draft` and reported `publishable: false`.
- The Paperclip autoTHREADS plugin test suite passed: 12 of 12 tests. It proves
  the usable Paperclip flow for draft creation, review submission, approval
  gates, future scheduling, rollback, company isolation, and a default-off
  publishing switch.

## Judgment

The request has two separate meanings:

1. **Safe operational use now:** PASS. Paperclip can create and manage local
   drafts through the unchanged upstream draft store, and the Paperclip plugin
   implements the review → approval → schedule workflow with publishing off by
   default.
2. **Full original GitHub live behavior:** not executed by design. The upstream
   Electron application includes account OAuth, Threads publishing, replies,
   news fetching, and LLM calls. Running those portions requires a real account
   and/or secret values and may publish or incur cost, which this issue
   explicitly forbids. The sidecar deliberately does not load those modules.

## Remaining proof needed

The running Paperclip service at `127.0.0.1:3100` was unavailable from this
agent environment (`curl` returned connection failure). Consequently the
report also could not be uploaded to the issue during this run. The managed
`local_stdio` template → catalog refresh → permission profile → test call
could not be performed against the live service. A generic gateway test was
also skipped because this runtime does not support the embedded Postgres test
database. No server was restarted, preserving other agents' work.

When a separate, approved live-account task exists, it should use the existing
plugin's review and approval gates, a Paperclip secret reference (never a
literal token), and a local mock first. It must not expand this draft-only
sidecar into a publisher.
