# CMP-1025 — autoTHREADS MCP direct-connection independent QA

## Verdict

**Not accepted as independently reproduced.** The earlier PoC report is
internally consistent, but its pinned upstream checkout was run-owned temporary
material and is no longer present. Recomputing the advertised commit and tree
would require obtaining the upstream source again, which this QA task expressly
forbids.

This is a safe negative result: no upstream runtime, dependency installation,
account connection, secret access, publication, paid call, or network request
was performed in this QA run.

## Scope and route

- Purpose: independently confirm the MCP direct-connection claim recorded for
  `eisenjimmy/autoTHREADS` at commit
  `3dd347e506040fbf614cd5af0dd739cbc77b8b2b`.
- Required checks: pinned commit/tree, MCP absence, dependencies, potential
  outbound calls, unmodified source, and publication approval boundary.
- Source execution and installation were prohibited and were not attempted.

## Evidence collected

| Required check | Result | Evidence |
| --- | --- | --- |
| Pinned commit/tree | Not independently reproducible | The fixed commit is absent from this repository's Git object store; no local upstream checkout exists. |
| Original source unchanged | Not independently reproducible | The original temporary checkout is absent, so its status cannot be inspected. |
| MCP server absent | Historical evidence only | The prior PoC record reports no MCP protocol or transport; this QA run cannot rescan absent source. |
| Dependencies / installation | Passed for this run | No package manager command was run. |
| Account, secret, publishing, cost | Passed for this run | No secret endpoint, account action, publish action, external request, or runtime execution was used. |
| Existing Paperclip safety boundary | Static review passed | `plugin-autothreads` exposes draft-safe tools only; `publish` is not an agent tool. Publishing defaults to paused and needs a secret reference, user ID, reviewer, and approver configuration. |

## Static safety observations

The existing Paperclip plugin is distinct from the upstream source and must not
be mistaken for proof that upstream supports MCP. Its manifest lists only
`list_contents`, `create_draft`, and `submit_for_review`; none publishes.
Its publishing configuration defaults to paused. The worker checks that switch
before resolving a token or issuing its Threads requests.

The retained prior report documents that the upstream project is an Electron
application with private IPC rather than an MCP server, and that it has outbound
paths. That report remains a useful reference, not independently verified
evidence for this QA result.

## Decision

Do not adopt or connect the upstream autoTHREADS runtime. Keep the existing
review-gated Paperclip plugin as the only operating path. A future renewed QA
requires a separately approved immutable source snapshot (or a supplied local
archive) so the commit/tree and static MCP scan can be repeated without network
access. Any later publication work must retain a separate per-action approval.

## Verification limits and risk

The Paperclip API service at the run-provided address was unavailable, so this
report could not be uploaded or attached to the issue during the run. No service
was restarted because that could interrupt other agents. The primary remaining
risk is evidentiary: the earlier fixed-source assertions are not independently
confirmed in the current retained workspace.
