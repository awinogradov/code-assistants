# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## 1.0.0 (2026-05-28)

## Release Notes

Introducing agents-rules-sync - a new GitHub Action that keeps your AI assistant rules in sync across repositories.

## ✨ What's New

### Agents Rules Sync Action
This composite GitHub Action automatically syncs stack-appropriate AI assistant rules from an upstream repository into your project's `CLAUDE.md` file. Set it up once with a scheduled workflow, and your team's AI assistant guidelines stay current without manual intervention. The action reads your project's declared stack from `package.json` and fetches the matching rules file.

<details><summary>Related issues</summary>

- [e5f7b35: add composite action to sync rules to claude.md](https://github.com/awinogradov/code-assistants/commit/e5f7b359784bd22ce2cc801ed7a78047c3353950)
</details>

### AGENTS.md Symlink Support
When enabled with `agents-md: true`, the action now creates a Git symlink from `AGENTS.md` to `CLAUDE.md`. This allows projects to maintain backward compatibility with tools expecting the old filename while standardizing on CLAUDE.md as the primary location.

<details><summary>Related issues</summary>

- [68673cc: add agents-md input for agents.md symlink](https://github.com/awinogradov/code-assistants/commit/68673ccf90e098a7182f30f473773cef55cb994e)
</details>

## 🐛 Bug Fixes

### Clearer Error Messages for Invalid Configuration
When your `package.json` contains malformed JSON or missing agents configuration, the action now provides helpful error messages with direct links to documentation, making troubleshooting faster.

<details><summary>Related issues</summary>

- [15a63ea: include docs link in malformed-json error](https://github.com/awinogradov/code-assistants/commit/15a63eac9b26a305b10f6ed7bc82509e98996e4f)
</details>

### Improved Sync Status Visibility
The sync action now generates a summary in your GitHub Actions run with proper line breaks, making it easier to see what files were synced and whether any changes were detected. The sync branch has also been renamed for better clarity.

<details><summary>Related issues</summary>

- [572716e: rename branch and add step summary](https://github.com/awinogradov/code-assistants/commit/572716e3bce0bbdd12ea7f9e90291f18980e8548)
- [1c9ba10: render step summary with line breaks](https://github.com/awinogradov/code-assistants/commit/1c9ba10342f6b9b3b3455d170c3d04529685b986)
</details>

## ⚙️ Configuration Required

### GitHub Token Configuration
Both `files-sync` and `agents-rules-sync` actions now require an explicit `token` input. You must provide either a Personal Access Token (PAT) or GitHub App installation token with `contents: write` and `pull-requests: write` permissions. The workflow's default `GITHUB_TOKEN` is not supported due to GitHub's restrictions on workflow-triggered events.

## ⚠️ Breaking Changes

### Explicit Token Input Required
The sync actions no longer use a default token. You must explicitly pass a `token` input with appropriate permissions. If you're currently using these actions without specifying a token, add `token: ${{ secrets.SYNC_PAT }}` to your workflow and configure the corresponding secret with a PAT or GitHub App token that has `contents: write` and `pull-requests: write` permissions.

<details><summary>Related issues</summary>

- [f95876f: require explicit token input on sync actions](https://github.com/awinogradov/code-assistants/commit/f95876f5f522a60cf3a65d977088796a4028f341)
</details>

## 📚 Documentation & Settings Updates

### Sync Flow Documentation
New comprehensive documentation explains the end-to-end data flow for agents-rules-sync, including detailed diagrams showing how it composes with files-sync and what happens when the agents-md input is enabled. This helps deployment teams understand the sync mechanism and troubleshoot issues.

<details><summary>Related issues</summary>

- [e3a6f44: document agents-md input and sync flow](https://github.com/awinogradov/code-assistants/commit/e3a6f44d8521c7f345ccb3dfb736d2434705938b)
</details>


### ⚠ BREAKING CHANGES

* **sync:** Consumers must now pass an explicit `token` input (PAT or GitHub App installation token) to both files-sync and agents-rules-sync. Pinning to an existing tag retains the old default behavior until upgrade.

### Features

* **agents-rules-sync:** add agents-md input for agents.md symlink ([68673cc](https://github.com/awinogradov/code-assistants/commit/68673ccf90e098a7182f30f473773cef55cb994e))
* **agents-rules-sync:** add composite action to sync rules to claude.md ([e5f7b35](https://github.com/awinogradov/code-assistants/commit/e5f7b359784bd22ce2cc801ed7a78047c3353950))
* **sync:** require explicit token input on sync actions ([f95876f](https://github.com/awinogradov/code-assistants/commit/f95876f5f522a60cf3a65d977088796a4028f341))

### Bug Fixes

* **agents-rules-sync:** include docs link in malformed-json error ([15a63ea](https://github.com/awinogradov/code-assistants/commit/15a63eac9b26a305b10f6ed7bc82509e98996e4f))
* **sync:** correct app token permissions claim ([b26f011](https://github.com/awinogradov/code-assistants/commit/b26f0118d7f13c0d16c2c8c919ade5002383f960))
* **sync:** rename branch and add step summary ([572716e](https://github.com/awinogradov/code-assistants/commit/572716e3bce0bbdd12ea7f9e90291f18980e8548))
* **sync:** render step summary with line breaks ([1c9ba10](https://github.com/awinogradov/code-assistants/commit/1c9ba10342f6b9b3b3455d170c3d04529685b986))

### Documentation

* document agents-md input and sync flow ([e3a6f44](https://github.com/awinogradov/code-assistants/commit/e3a6f44d8521c7f345ccb3dfb736d2434705938b))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### Refactoring

* move actions-lib to packages/actions-core ([14798cd](https://github.com/awinogradov/code-assistants/commit/14798cdda4cfc9bd10547b06b9133eda623c9b9a))

### Tests

* cover symlink entries and the entry-builder helper ([306d052](https://github.com/awinogradov/code-assistants/commit/306d052403f8b737446da6f98fbf58f18c3aaea9))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
