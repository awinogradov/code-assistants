# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## 0.1.0 (2026-05-29)

## Release Notes

Release auto-merge now automatically merges approved release PRs when all checks are green, with per-repo opt-in control.

## ✨ What's New

### Automatic Release PR Merging
The release pipeline now includes an auto-merge capability that monitors release PRs and merges them automatically once they're approved and all checks pass. This eliminates the manual merge step between approval and publish, speeding up your release process. The action is event-driven and self-healing — it re-evaluates whenever a check completes or review is submitted, merging as soon as all conditions are met.

<details><summary>Related issues</summary>

- [#107: Add release-automerge composite action with downstream sync workflow](https://github.com/awinogradov/code-assistants/issues/107)
</details>

### Per-Repository Opt-in Control
Auto-merge is disabled by default and requires explicit opt-in. To enable it for a repository, add `"release": { "automerge": true }` to the root `package.json`. This gives teams control over whether they want fully automated releases or prefer manual oversight of the merge step.

<details><summary>Related issues</summary>

- [#112: Gate release auto-merge behind a release.automerge flag in package.json](https://github.com/awinogradov/code-assistants/issues/112)
</details>

## 🐛 Bug Fixes

### Check Status Aggregation
The action now correctly handles cancelled checks when determining if all checks have passed. Previously, a cancelled check could block auto-merge even when all actual tests were green. Now, only failed or pending checks will prevent merging.

## ⚙️ Configuration Required

### Enable Auto-merge
To activate automatic merging of release PRs in your repository, add the following to your root `package.json`:

```json
{
  "release": {
    "automerge": true
  }
}
```

Without this configuration, release PRs will continue to require manual merging even if you have the auto-merge workflow installed.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #112 | [#114](https://github.com/awinogradov/code-assistants/pull/114) | @awinogradov |
| #107 | [#110](https://github.com/awinogradov/code-assistants/pull/110) | @awinogradov |

### Features

* **release-automerge:** add release auto-merge action and workflow ([1863ee9](https://github.com/awinogradov/code-assistants/commit/1863ee92945dcbe381b4ccd12ce51d6b4748eceb))
* **release-automerge:** gate auto-merge behind release.automerge flag ([dcb51c8](https://github.com/awinogradov/code-assistants/commit/dcb51c87f6026728a9baf6c40837859c3b10d31f))

### Bug Fixes

* **actions-core:** ignore cancelled-only checks in status aggregation ([d141422](https://github.com/awinogradov/code-assistants/commit/d141422b2ce40891eae58815b487e7aff76fcefb))

### Documentation

* **release-automerge:** document auto-merge flow and actions ([af001f2](https://github.com/awinogradov/code-assistants/commit/af001f236ce117bc36910c793310f23e76355a3a))
* **release:** document release.automerge opt-in flag ([2f3961f](https://github.com/awinogradov/code-assistants/commit/2f3961fb6f9ace95bc38d8265d8b09ad9b9ed0b0))

### Refactoring

* **release-automerge:** extract pure auto-merge opt-in parser ([bc93a38](https://github.com/awinogradov/code-assistants/commit/bc93a387b1adcb243852d27a0fe1b8cce27b1edc))

### CI

* **release-automerge:** drop status event trigger ([a1d8260](https://github.com/awinogradov/code-assistants/commit/a1d82606d28c623f94235b02d58d4fbccbf720c8))
* **release-automerge:** gate auto-merge job to release branches ([d9783be](https://github.com/awinogradov/code-assistants/commit/d9783bebbb5a88414ec2bf09b5aad30313e76049))
* **release-sync:** sync full release pipeline, not just auto-merge ([fa9ce72](https://github.com/awinogradov/code-assistants/commit/fa9ce7284f71f2ee229c742509d4a3eb08bdf2c0))
* **release:** rename release/publish workflows to release-* ([53aac6d](https://github.com/awinogradov/code-assistants/commit/53aac6d09e07f9ebe721f39d6143bb44fd8c4c6c))
