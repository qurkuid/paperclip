# CMP-1024 — autoTHREADS MCP direct-connection PoC

## Background

This review evaluates the public upstream repository, not the existing Paperclip
plugin. It does not execute upstream code, install dependencies, use accounts,
read secrets, publish content, or make calls to content/AI/Threads services.

Source: [eisenjimmy/autoTHREADS](https://github.com/eisenjimmy/autoTHREADS),
fixed at commit [`3dd347e506040fbf614cd5af0dd739cbc77b8b2b`](https://github.com/eisenjimmy/autoTHREADS/tree/3dd347e506040fbf614cd5af0dd739cbc77b8b2b).

## Execution and evidence

Public source was cloned read-only into the run-owned temporary directory and
checked out as a detached worktree at the fixed commit.

| Check | Result |
| --- | --- |
| Commit | `3dd347e506040fbf614cd5af0dd739cbc77b8b2b` |
| Git tree | `2f6fee3811c95ec4628ad6639f264c4aec108712` |
| Source modification | `git status --porcelain` empty |
| MCP protocol scan | no `mcp`, `Model Context Protocol`, or JSON-RPC server implementation |
| Runtime surface | Electron main-process IPC only (`electron/preload.ts`); no stdio/HTTP tool server |
| Package check | no MCP SDK or server dependency; package scripts start/build/package an Electron desktop app |
| License | MIT, copyright 2026 Jimmy Park; retain notice in any copied substantial source |

The only `stdio` hits are child-process I/O for the project’s own dev/build
scripts, not MCP transport. The README describes the app as an Electron desktop
application and its process-boundary section assigns side effects to Electron’s
main process.

## Result: what can connect unchanged

Nothing in the fixed source can be registered as a native MCP server unchanged.
It has no MCP manifest, `tools/list`, JSON-RPC handler, stdio transport, or
supported HTTP tool endpoint. Its available control boundary is internal
Electron IPC, which is not a stable external integration contract.

The upstream source does contain the business operations a future adapter would
need: local drafts, scheduling, LLM generation and Threads calls. Those are
not safely callable directly from Paperclip without a new boundary outside (or
a change inside) the source.

## Options

| Option | Fit to unchanged upstream | Size | Decision |
| --- | --- | --- | --- |
| Native MCP | Not possible | none, but unavailable | reject |
| External sidecar wrapper | Possible only by starting Electron and bridging private IPC, or by duplicating logic | medium/high; fragile on updates | do not build now |
| Remote/Paperclip gateway | Requires a stable HTTP or MCP endpoint that upstream does not provide | high; introduces hosting, auth and network exposure | reject |

### Recommended smallest configuration

Do not connect the upstream runtime today. Keep it as an evaluated, immutable
reference and keep Paperclip’s existing review-gated autoTHREADS plugin as the
separate operating implementation. If a future product decision requires the
upstream UI, ask upstream for a versioned, read-only MCP/HTTP interface first;
then prefer a **stdio sidecar** over a remote gateway.

This avoids running unreviewed Electron code, avoids copying its private IPC
contract, and avoids creating a permanent service merely for an unsupported
integration.

## Proposed tool and safety contract (only after approval)

No tools are registered by this PoC. If upstream supplies a supported API, the
first adapter must expose only these narrow operations:

| Tool | Input / output | Permission | Failure and rollback |
| --- | --- | --- | --- |
| `autothreads.health` | no input → version, availability | read-only, no secrets | returns unavailable; no retry loop |
| `autothreads.drafts.list` | cursor/limit → draft summaries | read-only, no network | bounded result; timeout has no side effect |
| `autothreads.drafts.create` | text, optional schedule → draft id | Paperclip draft-write | local draft only; delete by id is rollback |
| `autothreads.publish` | approved draft id → remote media id/permalink | separate board approval and Threads publish scope | on uncertain remote result, mark `unknown`; never auto-repost |

Secrets must be injected only into the sidecar process by Paperclip’s secret
store and never returned in tool output or logs. Required names, if the
approved adapter needs them: `THREADS_ACCESS_TOKEN`; optionally
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or a locally hosted LLM
base URL. The owner for providing and granting any such secret is the
spacebogam CEO/board. This PoC did not inspect or request any secret.

Approval gates: no account connection, external network call, LLM call, image
search, scheduling, local database write, or publish operation is allowed
before a board-approved implementation issue. Publishing additionally requires
a per-action approval. Rollback is stop sidecar + revoke secret binding; a
successfully published Threads post cannot be assumed reversible, so ambiguity
must remain visible for human review.

## Supply chain and external-surface findings

- `package-lock.json` exists, but `npm install` is an unapproved supply-chain
  action and was not run.
- Dependencies include Electron, React, Vite and TypeScript; there is no MCP
  package.
- The fixed source contains outbound paths to Threads Graph/OAuth, hosted AI
  providers, local LLM endpoints, news sources, image search and RSS/Atom
  feeds. The Threads API uses POST for content creation/publishing.
- The README states local encrypted storage; Paperclip must not rely on or
  extract that store. The original copyright/license notice must accompany any
  copied substantial source.

## CMP-826 transition assessment

| Existing work | Recommendation | Cost/risk |
| --- | --- | --- |
| Immutable GitHub snapshot and approval workflow | retain; it remains generally useful and does not execute source | low |
| Existing review-gated Paperclip autoTHREADS plugin | retain as the only current Paperclip-safe operating path, pending product decision | low; separate codebase to maintain |
| Assumption that upstream is native MCP-capable | retire | removes a false integration path |
| Sidecar or remote gateway | defer until a supported upstream API and explicit approval exist | medium/high; unstable private IPC or duplicated logic |

## Minimal PoC conclusion

The safe, secret-free PoC is complete: it proves the pinned source is unmodified
and that native MCP direct connection is unavailable. A live MCP exchange would
require either executing the Electron project or credentials/network access,
both explicitly outside this issue’s permitted scope. No “working MCP” claim is
made.

## Independent QA proposal

Before adoption, an independent QA issue should re-run the fixed-commit checks:

1. Verify commit/tree and clean detached checkout.
2. Re-run the MCP/dependency/static endpoint scan.
3. Confirm no secret, account, dependency install or network side effect
   occurred.
4. Confirm a proposed adapter cannot reach `publish` without a fresh approval.

No source or Paperclip runtime files were changed by this PoC.
