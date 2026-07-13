# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [0.2.3](https://github.com/awinogradov/code-assistants/compare/release-automerge@v0.2.2...release-automerge@v0.2.3) (2026-07-13)

## Release Notes

Transient GitHub API errors (502s, 429s) no longer cause the auto-merge action to fail mid-flight — it now retries with backoff and recovers automatically.

## 🐛 Bug Fixes

### Resilience Against Transient GitHub API Errors

Previously, a temporary GitHub API hiccup — such as a 502 Bad Gateway or a 429 rate-limit response — could cause the auto-merge job to fail outright, leaving a release PR approved and green but unmerged. The action now retries those requests automatically with backoff, so brief API instability is absorbed silently and the merge completes as expected without any manual intervention.

<details><summary>Related issues</summary>

- [#450: Auto label fails on transient GitHub 502 responses](https://github.com/awinogradov/code-assistants/issues/450)
- [#453: Keep Auto label green when GitHub returns a transient 502](https://github.com/awinogradov/code-assistants/pull/453)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #450 | [#453](https://github.com/awinogradov/code-assistants/pull/453) | @awinogradov |

### Bug Fixes

* retry transient github errors in action clients ([88529bf](https://github.com/awinogradov/code-assistants/commit/88529bfb976a72852df74767604e3276df180786))
## [0.2.2](https://github.com/awinogradov/code-assistants/compare/release-automerge@v0.2.1...release-automerge@v0.2.2) (2026-06-15)

## Release Notes

This update improves documentation readability across all action docs and the AI code review output.

## 📚 Documentation & Settings Updates

### GitHub-style alert formatting
Documentation callouts and tips now render with GitHub's native alert styling, making important information stand out better. The AI code review footer hint also uses this new format for clearer guidance.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #315 | [#316](https://github.com/awinogradov/code-assistants/pull/316) | @awinogradov |

### Documentation

* adopt github alert syntax for callouts ([151e57b](https://github.com/awinogradov/code-assistants/commit/151e57bd2694b5df626833d3243cdded6f77eef9))
## [0.2.1](https://github.com/awinogradov/code-assistants/compare/release-automerge@v0.2.0...release-automerge@v0.2.1) (2026-06-13)

## Release Notes

The documentation references in release-automerge have been updated to match the new numbered chapter structure.

## 🐛 Bug Fixes

### Updated documentation links
The release-automerge action now correctly points to the renamed documentation chapters when displaying error messages and skip notifications. This ensures your team can quickly find the right documentation when troubleshooting configuration issues or understanding why a release PR wasn't automatically merged.

<details><summary>Related issues</summary>

- [#295: MAINTENANCE: Restructure docs into numbered book chapters](https://github.com/awinogradov/code-assistants/pull/295)
</details>


### Bug Fixes

* renumber docs and update shipped links ([4b77286](https://github.com/awinogradov/code-assistants/commit/4b77286ff4fa59ea51a25ca051e36e6898df4f06))
## [0.2.0](https://github.com/awinogradov/code-assistants/compare/release-automerge@v0.1.0...release-automerge@v0.2.0) (2026-06-08)

## Release Notes

The code review action now provides detailed explanations when it skips reviews, making it easier to understand and resolve failing checks.

## ✨ What's New

### Detailed skip explanations with direct log links
When the code review action skips a review due to failing checks, it now posts a comprehensive comment that links each failing check directly to its logs and explains why it failed. This helps you quickly identify and resolve issues without hunting through GitHub's UI for the right logs.

<details><summary>Related issues</summary>

- [#280: Add check log links and an AI failure summary to the code-review skip comment](https://github.com/awinogradov/code-assistants/issues/280)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #280 | [#285](https://github.com/awinogradov/code-assistants/pull/285) | @awinogradov |

### Features

* **code-review-action:** reuse review engine for skip reasons ([f62cc9c](https://github.com/awinogradov/code-assistants/commit/f62cc9cad7b2f78a188904712a1beb273bf0dbeb))
## 0.1.0 (2026-05-29)

## Release Notes

Release auto-merge now merges approved release PRs automatically when all checks pass, eliminating the manual merge step.

## ✨ What's New

### Automatic release PR merging
Release PRs now merge themselves once approved and all checks turn green. The system continuously monitors PR status and merges as soon as conditions are met — no more waiting for someone to click the merge button. This reduces release cycle time and ensures consistent merge timing across all repositories.

<details><summary>Related issues</summary>

- [#107: Add release-automerge composite action with downstream sync workflow](https://github.com/awinogradov/code-assistants/issues/107)
</details>

### Per-repository and per-package opt-in control
Auto-merge requires explicit opt-in through a `release.automerge` flag in `package.json`. Set it at the repository root to enable for all packages, or configure individual packages to opt in or out. This gives teams full control over their release automation comfort level — start with manual merges and enable automation when ready.

<details><summary>Related issues</summary>

- [#112: Gate release auto-merge behind a release.automerge flag in package.json](https://github.com/awinogradov/code-assistants/issues/112)
</details>

## 🐛 Bug Fixes

### Pending checks no longer block auto-merge
Auto-merge previously gave up if CI checks were still running when the approval came through. Now it polls every 15 seconds for up to 8 minutes, waiting for checks to complete before making the merge decision. This ensures release PRs merge as soon as they're ready, not just if they happen to be approved after CI finishes.

### Release PR approval now works correctly
Release PRs can now be auto-approved because they're authored with a different identity than the approver. Previously, both author and approver used the same bot account, which GitHub blocks (you can't approve your own PR). The release creation workflow now uses a distinct token, allowing the approval bot to properly approve release PRs.

### Cancelled checks no longer cause false failures
Check status aggregation now ignores checks that were only cancelled (never ran). This prevents auto-merge from incorrectly thinking the PR has failures when workflows were simply cancelled due to newer commits.

## ⚙️ Configuration Required

### Enable auto-merge in package.json
Add `"release": { "automerge": true }` to your root `package.json` to enable auto-merge for all packages, or add it to individual package `package.json` files for per-package control.

**Example (repository-wide):**
```json
{
  "name": "my-monorepo",
  "release": {
    "automerge": true
  }
}
```

**Example (single package opt-in):**
```json
{
  "name": "@myorg/specific-package",
  "release": {
    "automerge": true
  }
}
```

## 📚 Documentation & Settings Updates

### Release automation flow documentation
Complete documentation now covers the auto-merge flow, including architecture diagrams, configuration examples, and troubleshooting guides. Find it in `docs/release-automerge.md`.

### Release PR author identity requirements
The release creation workflow documentation now explains why release PRs must be authored with a different GitHub identity than the approval bot. This architectural requirement enables auto-approval to function within GitHub's security model.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #112 | [#121](https://github.com/awinogradov/code-assistants/pull/121) | @awinogradov |
| #107 | [#110](https://github.com/awinogradov/code-assistants/pull/110) | @awinogradov |

### Features

* **release-automerge:** add release auto-merge action and workflow ([1863ee9](https://github.com/awinogradov/code-assistants/commit/1863ee92945dcbe381b4ccd12ce51d6b4748eceb))
* **release-automerge:** gate auto-merge behind release.automerge flag ([dcb51c8](https://github.com/awinogradov/code-assistants/commit/dcb51c87f6026728a9baf6c40837859c3b10d31f))
* **release-automerge:** resolve automerge opt-in per release member ([2aa4fa8](https://github.com/awinogradov/code-assistants/commit/2aa4fa89bcd19879f16ff09a7924b8409916ce99))

### Bug Fixes

* **actions-core:** ignore cancelled-only checks in status aggregation ([d141422](https://github.com/awinogradov/code-assistants/commit/d141422b2ce40891eae58815b487e7aff76fcefb))
* **release:** poll pending checks before auto-merge ([d408a81](https://github.com/awinogradov/code-assistants/commit/d408a812c57dcc951c5939ec415a484826f03371))

### Documentation

* **release-automerge:** document auto-merge flow and actions ([af001f2](https://github.com/awinogradov/code-assistants/commit/af001f236ce117bc36910c793310f23e76355a3a))
* **release:** document distinct release-pr author identity ([eb99546](https://github.com/awinogradov/code-assistants/commit/eb995467a7fad1f4408c6cbf8736e8a4e8d2097c))
* **release:** document release.automerge opt-in flag ([2f3961f](https://github.com/awinogradov/code-assistants/commit/2f3961fb6f9ace95bc38d8265d8b09ad9b9ed0b0))

### Refactoring

* **checks:** extract shared check-status poll loop ([8987c37](https://github.com/awinogradov/code-assistants/commit/8987c379894c8ddf5a77e1fae0d495fd17341b92))
* **release-automerge:** extract pure auto-merge opt-in parser ([bc93a38](https://github.com/awinogradov/code-assistants/commit/bc93a387b1adcb243852d27a0fe1b8cce27b1edc))
* **release-automerge:** parallelize opt-in reads ([b816f71](https://github.com/awinogradov/code-assistants/commit/b816f71320d1f0f4cbadcbd75e5f8c23d101eaf0))

### CI

* **release-automerge:** drop status event trigger ([a1d8260](https://github.com/awinogradov/code-assistants/commit/a1d82606d28c623f94235b02d58d4fbccbf720c8))
* **release-automerge:** gate auto-merge job to release branches ([d9783be](https://github.com/awinogradov/code-assistants/commit/d9783bebbb5a88414ec2bf09b5aad30313e76049))
* **release-sync:** sync full release pipeline, not just auto-merge ([fa9ce72](https://github.com/awinogradov/code-assistants/commit/fa9ce7284f71f2ee229c742509d4a3eb08bdf2c0))
* **release:** rename release/publish workflows to release-* ([53aac6d](https://github.com/awinogradov/code-assistants/commit/53aac6d09e07f9ebe721f39d6143bb44fd8c4c6c))
