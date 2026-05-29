# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## 0.1.0 (2026-05-29)

## Release Notes

Release auto-merge eliminates the manual merge step for release PRs, automatically merging them once all checks pass and approval is recorded.

## ✨ What's New

### Automated release PR merging
Release PRs now merge automatically when they're fully green and approved, removing the manual merge step that previously delayed releases. The system continuously monitors release PRs and merges them as soon as all conditions are met, streamlining your release pipeline.

<details><summary>Related issues</summary>

- [#107: Add release-automerge composite action with downstream sync workflow](https://github.com/awinogradov/code-assistants/issues/107)
</details>

### Per-member auto-merge control
In monorepo setups, each workspace member can now independently opt in or out of auto-merge. A member's `release.automerge` setting overrides the repository-wide default, giving teams flexibility to enable automation at their own pace while sharing the same repository.

<details><summary>Related issues</summary>

- [#112: Gate release auto-merge behind a release.automerge flag in package.json](https://github.com/awinogradov/code-assistants/issues/112)
</details>

### Opt-in safety mechanism
Auto-merge is disabled by default and requires explicit opt-in through the `release.automerge` flag. This ensures existing workflows continue unchanged until teams are ready to adopt automation, preventing unexpected automatic merges in production environments.

<details><summary>Related issues</summary>

- [#112: Gate release auto-merge behind a release.automerge flag in package.json](https://github.com/awinogradov/code-assistants/issues/112)
</details>

### Unified release pipeline sync
The complete release pipeline (create, auto-merge, and publish workflows) now synchronizes to downstream repositories as a cohesive unit. This ensures all components of the automated release process stay in sync across your organization.

<details><summary>Related issues</summary>

- [#107: Add release-automerge composite action with downstream sync workflow](https://github.com/awinogradov/code-assistants/issues/107)
</details>

## 🐛 Bug Fixes

### Cancelled checks no longer block releases
Previously, cancelled workflow runs could prevent release PRs from being considered "all green" and block auto-merge. The system now correctly ignores cancelled-only checks when determining if a PR is ready to merge, preventing stuck releases due to workflow cancellations.

## ⚙️ Configuration Required

### Enable auto-merge with release.automerge flag
To enable automatic merging of release PRs, add `"release": { "automerge": true }` to your root `package.json`. Without this flag, release PRs will remain approved but unmerged, requiring manual intervention. In monorepos, individual members can override this setting in their own `package.json` files.

## ⚠️ Breaking Changes

### Release PR author identity must differ from reviewer
Release PRs must now be authored by a different GitHub identity than the auto-approval reviewer. If using the same bot account for both operations, auto-approval will fail silently and releases won't merge automatically. Update your `release-create.yml` workflow to use a distinct token (e.g., `secrets.GH_TOKEN` for authoring, `secrets.BOT_TOKEN` for reviewing).

## 📚 Documentation & Settings Updates

### Auto-merge workflow documentation
New comprehensive documentation explains the release auto-merge flow, including setup requirements, the distinct author identity constraint, and how the opt-in mechanism works across monorepo members.

### release.automerge field specification
The `release` field in `package.json` now supports an `automerge` boolean property that controls whether release PRs merge automatically. This setting cascades from root to workspace members, with member values taking precedence.


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

### Documentation

* **release-automerge:** document auto-merge flow and actions ([af001f2](https://github.com/awinogradov/code-assistants/commit/af001f236ce117bc36910c793310f23e76355a3a))
* **release:** document distinct release-pr author identity ([eb99546](https://github.com/awinogradov/code-assistants/commit/eb995467a7fad1f4408c6cbf8736e8a4e8d2097c))
* **release:** document release.automerge opt-in flag ([2f3961f](https://github.com/awinogradov/code-assistants/commit/2f3961fb6f9ace95bc38d8265d8b09ad9b9ed0b0))

### Refactoring

* **release-automerge:** extract pure auto-merge opt-in parser ([bc93a38](https://github.com/awinogradov/code-assistants/commit/bc93a387b1adcb243852d27a0fe1b8cce27b1edc))
* **release-automerge:** parallelize opt-in reads ([b816f71](https://github.com/awinogradov/code-assistants/commit/b816f71320d1f0f4cbadcbd75e5f8c23d101eaf0))

### CI

* **release-automerge:** drop status event trigger ([a1d8260](https://github.com/awinogradov/code-assistants/commit/a1d82606d28c623f94235b02d58d4fbccbf720c8))
* **release-automerge:** gate auto-merge job to release branches ([d9783be](https://github.com/awinogradov/code-assistants/commit/d9783bebbb5a88414ec2bf09b5aad30313e76049))
* **release-sync:** sync full release pipeline, not just auto-merge ([fa9ce72](https://github.com/awinogradov/code-assistants/commit/fa9ce7284f71f2ee229c742509d4a3eb08bdf2c0))
* **release:** rename release/publish workflows to release-* ([53aac6d](https://github.com/awinogradov/code-assistants/commit/53aac6d09e07f9ebe721f39d6143bb44fd8c4c6c))
