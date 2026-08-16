# CMP-857 autoTHREADS verification record

Date: 2026-08-02 (KST)

## Scope

This record verifies the existing autoTHREADS package without changing its
publishing configuration. It is intentionally review-gated: automatic
publishing remains unavailable unless an operator later enables the existing
approval-and-schedule flow.

## Checks completed

| Check | Result |
| --- | --- |
| Package unit tests | 3 passed |
| Package build | passed |
| Post-build unit tests | 3 passed |
| UI bundle on disk | `dist/ui/index.js` present |
| Visible safety copy in UI source/bundle | "자동 게시 기능은 제공하지 않습니다." |
| Secret display | UI reports connection state only; it does not render the token value |

## Operator-only verification needed

The run-scoped agent credential receives `403 Board access required` for
plugin installation and lifecycle endpoints. The public plugin UI bundle
request for the expected key returned HTTP 500, so the installed plugin record
and its runtime bundle cannot be confirmed from this agent credential.

An instance administrator should open the Paperclip board, go to:

1. Company settings
2. Instance plugins
3. autoTHREADS
4. Open the autoTHREADS page from the sidebar

Confirm the plugin is **Ready**, then capture the page that shows both the
connection state and the exact safety text: **"자동 게시 기능은 제공하지
않습니다."** Do not enter or expose a Threads token during this check.

Expected runtime base for this verification run: `http://127.0.0.1:3100`.
The final company-scoped browser URL is created by the board route and cannot
be safely inferred without the selected company route prefix.

## Risk

The package itself builds and tests successfully, but the current installed
runtime/UI status remains unverified until an instance administrator checks it.
