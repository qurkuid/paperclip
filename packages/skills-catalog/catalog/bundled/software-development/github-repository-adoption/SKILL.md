---
name: github-repository-adoption
description: Analyze a public GitHub repository from a pinned snapshot, choose skill/plugin/adapter/core adoption, require approval, then deliver an implementation with verification and rollback evidence.
key: paperclipai/bundled/software-development/github-repository-adoption
recommendedForRoles:
  - engineer
  - product
  - security
tags:
  - github
  - repository
  - plugin
  - security
  - approvals
---

# GitHub Repository Adoption

Use this workflow when a Paperclip company supplies one public `https://github.com/<owner>/<repo>` URL and wants a reusable capability adopted. It separates read-only analysis from implementation. Never run code from the repository before approval.

## 1. Collect an immutable analysis input

1. Reject URLs with credentials, a query string, fragment, non-HTTPS scheme, or a path other than `<owner>/<repo>`.
2. Create a company-scoped snapshot with `POST /api/companies/:companyId/github-repository-snapshots` and record its canonical URL, default branch, and head commit. The head commit is the analysis pin; do not silently move it later.
3. Stop if the snapshot is not `ready`, lacks a recognizable license, is too large, or reports secret key names that need an owner review. Do not place secret values in comments, documents, logs, or work products.

The snapshot is metadata only: license, manifests, dependency/build hints, release/language facts, and environment variable names. It must not execute cloned code or emit source-file bodies.

## 2. Write the proposal and gates

Create/update the issue `plan` document with:

- snapshot URL, branch, commit, collection time, and observed license;
- dependency/manifests, lockfile/supply-chain posture, secret-key-name count, external API assumptions, and UI/data-structure observations;
- one adoption decision: `skill` for instructions only, `plugin` for isolated Paperclip capability/UI/tooling, `adapter` for an execution-runtime boundary, or `core change` only when a Paperclip invariant needs it;
- exact implementation contract, acceptance checks, company scope, rollback/delete path, and the intended PR/preview/work-product output.

Fail closed for an unknown or incompatible license, inaccessible security posture, a required credential, missing company scope, or an unbounded rollback. A manifest dependency or an external API is not permission to install, authenticate, call, or execute it.

## 3. Request approval

Create exactly one `request_confirmation` against the latest plan revision using `confirmation:{issueId}:plan:{revisionId}`. Its summary names the pinned commit, adoption decision, license and supply-chain findings, external services/data leaving Paperclip, rollback, and implementation scope.

Do not create an implementation issue, install packages, clone/run the repository, add credentials, or call its external APIs until this interaction is accepted. If the plan changes, revise it and create a fresh confirmation.

## 4. Implement only after acceptance

Create a company-scoped implementation child issue that references the approved plan revision and pinned commit. Keep the change within the accepted decision:

- **skill:** add instructions and a fixture/golden check;
- **plugin:** use the plugin boundary; expose only the approved capabilities;
- **adapter:** implement the adapter contract and lifecycle checks;
- **core change:** prove why the extension boundaries cannot satisfy the invariant.

Run the smallest relevant tests first, then required typecheck/build for the changed surface. Capture preview/console/network evidence for UI work, attach inspectable work products, and publish a PR only after those checks pass.

## 5. Complete or stop safely

The final issue comment records the source pin, decision, approval, changed files, verification, preview/PR/work-product links, and residual risk. Mark the work `done` only after verification. Mark it `blocked` with the named owner/action for a missing license, approval, secret binding, or external-service authorization.

## Golden case

`https://github.com/eisenjimmy/autoTHREADS` at commit `3dd347e506040fbf614cd5af0dd739cbc77b8b2b` is the fixture URL for this workflow. It verifies URL normalization, commit pinning, license/manifest snapshotting, secret-value non-collection, and the pre-approval boundary.
