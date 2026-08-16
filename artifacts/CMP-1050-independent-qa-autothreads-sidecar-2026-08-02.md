# CMP-1050 — independent QA: autoTHREADS draft sidecar

## Decision

**Partial PASS; adoption decision is not ready.** The pinned source and the
draft-only sidecar reproduce safely. Paperclip-managed registration,
catalogue refresh, access policy, and test-call remain unproven because this
run cannot reach the Paperclip service. Do not approve the managed connection
until that one live-service check is recorded.

## Scope and safety boundary

This is an independent check of CMP-1049. It did not change upstream files,
use an account or secret, post content, make an external request, or create a
paid request.

## Reproduction and evidence

```sh
git -C artifacts/CMP-1049-autothreads-upstream rev-parse HEAD
# 3dd347e506040fbf614cd5af0dd739cbc77b8b2b
git -C artifacts/CMP-1049-autothreads-upstream rev-parse 'HEAD^{tree}'
# 2f6fee3811c95ec4628ad6639f264c4aec108712
test -z "$(git -C artifacts/CMP-1049-autothreads-upstream status --porcelain --untracked-files=no)"

AUTOTHREADS_SOURCE_DIR="$PWD/artifacts/CMP-1049-autothreads-upstream" \
AUTOTHREADS_DATA_DIR="$PAPERCLIP_RUN_SCRATCH_DIR/cmp-1050-sidecar-data" \
node tools/autothreads-mcp-sidecar/smoke.cjs

pnpm --filter @paperclipai/plugin-autothreads test -- --run
```

Observed results:

- Source commit/tree matched the pinned values above and the source checkout
  was clean.
- `initialize` reported `autothreads-pinned-draft-sidecar` with MCP
  `2024-11-05`.
- `tools/list` returned exactly three tools: source integrity, local draft
  listing, and local draft creation.
- Integrity returned `clean: true`; creation produced one local `draft` with
  `publishable: false`; listing returned that draft.
- No `publish`, `schedule`, `account`, or `secret` tool was exposed. The smoke
  result recorded `secretKeysPassed: []`, `externalCalls: 0`, and
  `costsIncurred: 0`.
- Only the run-owned `autothreads-db/drafts.json` was created; the retained
  upstream checkout stayed unchanged.
- The autoTHREADS plugin tests passed: 12/12. They cover local draft creation,
  review and approval gates, scheduling validation, rollback, company
  isolation, and the default-off publish switch.

## Managed Paperclip proof: not completed

The required live sequence is an approved `local_stdio` template (only
`AUTOTHREADS_SOURCE_DIR` and `AUTOTHREADS_DATA_DIR`) → disabled connection →
catalogue refresh → default-deny access policy (two read tools allowed; create
draft asks first) → enabled connection → test call. This run attempted the
configured service health and issue endpoints at `127.0.0.1:3100`; both failed
with connection refused (`HTTP 000`).

The closest server-harness check was also unavailable: the targeted local
stdio template test skipped because embedded PostgreSQL is unsupported in this
agent runtime. No Paperclip service was restarted, so other agents were not
interrupted.

## Next connection

On a healthy Paperclip service, an operator with tool-administration access
should run the managed sequence above with the same two path-only environment
values and attach its catalogue and test-call result to this issue. That single
check is the remaining adoption gate. A live Threads account, secret value,
or publishing must remain a separately approved task.
