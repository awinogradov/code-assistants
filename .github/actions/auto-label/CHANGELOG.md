# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [0.2.2](https://github.com/awinogradov/code-assistants/compare/auto-label-action@v0.2.1...auto-label-action@v0.2.2) (2026-06-26)

## Release Notes

The `auto-label` action now correctly labels pull requests in pnpm-based monorepos, where it was previously applying no labels at all.

## 🐛 Bug Fixes

### Workspace Labels Now Applied in pnpm Monorepos

Consumer repos that use `pnpm-workspace.yaml` to declare their workspace members were silently receiving no `<scope>/<member>` labels on pull requests. The action was only reading workspace members from the `workspaces` field in `package.json`, which pnpm repos typically leave empty. It now falls back to parsing `packages:` globs from `pnpm-workspace.yaml` when `package.json` declares no workspaces, so pnpm monorepos get the same labelling behaviour as npm/Bun workspace repos.


### Bug Fixes

* **auto-label:** read workspace members from pnpm-workspace.yaml ([f1b9df6](https://github.com/awinogradov/code-assistants/commit/f1b9df6ff8bf54ecdd5923818e7def3fd57438b2))
## [0.2.1](https://github.com/awinogradov/code-assistants/compare/auto-label-action@v0.2.0...auto-label-action@v0.2.1) (2026-06-08)

## Release Notes

Auto label action now loads properly and attributes label events to your project bot instead of github-actions[bot].

## ✨ What's New

### Bot identity for label operations
Label add/remove events created by the auto-label action now appear under your project's bot account instead of the generic `github-actions[bot]`. This provides clearer audit trails and consistent bot attribution across your automation workflows.

<details><summary>Related issues</summary>

- [#267: Attribute auto-label add/remove events to BOT_USERNAME, not github-actions](https://github.com/awinogradov/code-assistants/issues/267)
</details>

## 🐛 Bug Fixes

### Action loading restored
The auto-label action was failing to load on every push due to an invalid token description containing GitHub expression syntax. The action now loads correctly and pull requests receive their workspace member labels as expected.

<details><summary>Related issues</summary>

- [#276: Auto label action fails to load: secrets context in input description](https://github.com/awinogradov/code-assistants/issues/276)
</details>

## ⚙️ Configuration Required

### BOT_TOKEN secret
You must configure a `BOT_TOKEN` secret with `pull-requests: write` and `issues: write` permissions. The action uses this token to attribute label operations to your project bot. Without this secret, the workflow will fail.

## ⚠️ Breaking Changes

### New secret requirement
The auto-label action now requires a `BOT_TOKEN` secret. Downstream repositories syncing the `auto-label.yml` workflow must configure this secret or label operations will fail. The token needs `pull-requests: write` and `issues: write` permissions to manage labels on pull requests.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #276 | [#277](https://github.com/awinogradov/code-assistants/pull/277) | @awinogradov |
| #267 | [#270](https://github.com/awinogradov/code-assistants/pull/270) | @awinogradov |

### Bug Fixes

* **auto-label:** attribute label events to bot ([c8fe71b](https://github.com/awinogradov/code-assistants/commit/c8fe71b9aa22406d1d7b615beda887ce6711ccf0))
* **auto-label:** drop ${{ }} expression from token description ([e36649a](https://github.com/awinogradov/code-assistants/commit/e36649a180d8e706cddd3628e9ef5cfc99aa2af7))
## 0.2.0 (2026-06-01)

## Release Notes

A new GitHub Action automatically labels pull requests based on which workspace packages they modify, keeping your PR organization clean and consistent.

## ✨ What's New

### Auto-labeling for workspace pull requests
Your pull requests now get automatically labeled with `<scope>/<package>` tags based on which workspace members they touch. The action reads your repository's npm scope from `package.json` and workspace structure, then applies the right labels without any manual configuration. When packages are removed from the workspace, their orphaned labels get cleaned up automatically on merge to keep your label list tidy.

<details><summary>Related issues</summary>

- [#65: Add an auto-label composite action and the matching upstream workflow](https://github.com/awinogradov/code-assistants/issues/65)
</details>

## 🐛 Bug Fixes

### Pull requests no longer cancel each other's labeling
Multiple pull requests can now have their labels synced simultaneously without interfering with each other. Previously, opening or updating one PR would cancel the labeling process for any other PR that was being processed, leaving them with outdated or missing labels. Each PR now gets its own isolated labeling run.

## ⚙️ Configuration Required

### Workflow integration
Add the auto-label workflow to your repository's `.github/workflows/` directory. The action requires no configuration when your repository uses standard npm/Bun workspaces — it automatically detects your package scope and workspace structure. For non-standard setups, you can override the label prefix with the `label-prefix` input parameter.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #65 | [#210](https://github.com/awinogradov/code-assistants/pull/210) | @awinogradov |

### Features

* **auto-label:** add composite action for pr labeling ([8ca7d49](https://github.com/awinogradov/code-assistants/commit/8ca7d4977df8269515af3888c77844dd97a04a47))

### Documentation

* **auto-label:** mirror concurrency group in usage ([8398152](https://github.com/awinogradov/code-assistants/commit/839815232d5eb2c95255bdf4a344a5d2cc8b6d19))

### CI

* **auto-label:** consume action via [@main](https://github.com/main), matching code-review ([faabc3c](https://github.com/awinogradov/code-assistants/commit/faabc3c327e04fc1d18620aeef4fb8cc28c2279f))
* **auto-label:** use local action in dogfood, add [@main](https://github.com/main) template ([69f9299](https://github.com/awinogradov/code-assistants/commit/69f92997b3aca085d487c9f2d43cc3c395787639))
