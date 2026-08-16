# autoTHREADS pinned draft MCP sidecar

This sidecar exposes only source integrity, local draft listing, and local draft
creation. It directly loads the unmodified `dist-electron/drafts.js` from
`eisenjimmy/autoTHREADS` commit
`3dd347e506040fbf614cd5af0dd739cbc77b8b2b` (tree
`2f6fee3811c95ec4628ad6639f264c4aec108712`).

It does not load the upstream scheduler, Threads API, OAuth, LLM, news, image,
or autopilot modules. There is no publish tool. The Electron dependency used by
the upstream local JSON store is satisfied by the external, data-path-only shim
under `shims/`; no upstream file is changed.

Required configuration keys (values are operator-provided):

- `AUTOTHREADS_SOURCE_DIR`: clean detached checkout of the pinned commit.
- `AUTOTHREADS_DATA_DIR`: dedicated local dry-run data directory.

Run the secret-free smoke:

```sh
git clone https://github.com/eisenjimmy/autoTHREADS.git /opt/autothreads-upstream
git -C /opt/autothreads-upstream checkout --detach 3dd347e506040fbf614cd5af0dd739cbc77b8b2b
mkdir -p /var/lib/paperclip/autothreads-dry-run
AUTOTHREADS_SOURCE_DIR=/opt/autothreads-upstream \
AUTOTHREADS_DATA_DIR=/var/lib/paperclip/autothreads-dry-run \
node tools/autothreads-mcp-sidecar/smoke.cjs
```

For a direct Codex MCP entry:

```toml
[mcp_servers.autothreads_drafts]
command = "node"
args = ["/absolute/path/to/paperclip/tools/autothreads-mcp-sidecar/server.cjs"]

[mcp_servers.autothreads_drafts.env]
AUTOTHREADS_SOURCE_DIR = "/opt/autothreads-upstream"
AUTOTHREADS_DATA_DIR = "/var/lib/paperclip/autothreads-dry-run"
```

For Paperclip managed access, create an approved `local_stdio` template whose
command is `node`, whose argument is the absolute `server.cjs` path, and whose
allowed env keys are exactly `AUTOTHREADS_SOURCE_DIR` and
`AUTOTHREADS_DATA_DIR`. Register the three descriptors returned by `tools/list`,
create a disabled connection using that template, refresh its catalog, bind a
default-deny profile allowing the two read tools and making
`autothreads_create_draft` ask-first, then enable the connection. Do not add any
Threads or LLM secret key to the template.

Rollback is deterministic: disable the Paperclip connection, stop its runtime
slot, and remove only the dedicated `AUTOTHREADS_DATA_DIR`. Upstream source is
read-only and remains untouched. A future real-account mode is a separate
board-approved change; it must use Paperclip secret references and a per-action
publish confirmation rather than extending this sidecar implicitly.
