# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

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
