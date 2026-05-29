# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [1.0.0](https://github.com/awinogradov/code-assistants/compare/release-action@v0.1.0...release-action@v1.0.0) (2026-05-29)

## Release Notes

Release-action v1.0.0 brings opt-in auto-merge control, standardized bot authentication, and enhanced monorepo ticket tracking.

## ✨ What's New

### Auto-merge control for release PRs
Release auto-merge is now opt-in, giving teams control over when releases go live. Add `"release": { "automerge": true }` to your root `package.json` to enable automatic merging of release PRs. Without this flag, release PRs will be approved but wait for manual merge, allowing final review before deployment.

<details><summary>Related issues</summary>

- [#112: Gate release auto-merge behind a release.automerge flag in package.json](https://github.com/awinogradov/code-assistants/issues/112)
</details>

### Enhanced monorepo release notes
Monorepo releases now include the same ticket tracking tables as standalone releases. Each member package shows its relevant GitHub Issues, Linear tickets, and Jira items based on the commits included. The action automatically detects which ticket systems you're using from your existing credentials.

<details><summary>Related issues</summary>

- [#102: Monorepo release notes are missing the GitHub Issues / Linear / Jira blocks](https://github.com/awinogradov/code-assistants/issues/102)
</details>

## 🐛 Bug Fixes

### Bot identity resolution
The action now properly derives the bot's GitHub user ID when generating commits, ensuring the correct noreply email format for bot accounts. This fixes issues where commits appeared as unverified or from the wrong author.

### Action loading errors
Fixed an issue where the sync and release composite actions would fail to load due to invalid variable expressions in input descriptions. Actions now load reliably across all workflow contexts.

## ⚙️ Configuration Required

### Bot username configuration
You can now customize the git author for release and sync commits by setting a `bot_username` input. If not specified, it defaults to `github-actions[bot]`. Store your bot's username in `vars.BOT_USERNAME` for consistent identity across workflows.

## ⚠️ Breaking Changes

### Renamed authentication inputs
The `token` and `github_token` inputs are now `bot_token` for consistency across all actions. Update your workflow files:

**Before:**
```yaml
with:
  token: ${{ secrets.GH_TOKEN }}
  # or
  github_token: ${{ secrets.GH_TOKEN }}
```

**After:**
```yaml
with:
  bot_token: ${{ secrets.BOT_TOKEN }}
  bot_username: ${{ vars.BOT_USERNAME }}  # optional
```

Also update your repository secrets from `GH_TOKEN` to `BOT_TOKEN`.

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #112 | [#114](https://github.com/awinogradov/code-assistants/pull/114) | @awinogradov |
| #102 | [#104](https://github.com/awinogradov/code-assistants/pull/104) | @awinogradov |
| #96 | [#103](https://github.com/awinogradov/code-assistants/pull/103) | @awinogradov |

### ⚠ BREAKING CHANGES

* **actions:** inputs token and github_token are renamed to bot_token; consumers must
update with: blocks to pass bot_token (and optional bot_username), and workflows now read
secrets.BOT_TOKEN and vars.BOT_USERNAME instead of secrets.GH_TOKEN.

### Features

* **actions:** rename token inputs to bot_token, add bot_username ([160049b](https://github.com/awinogradov/code-assistants/commit/160049b998131e2e5c503559bf5d8e70e7ea8d5a))
* **release-automerge:** gate auto-merge behind release.automerge flag ([dcb51c8](https://github.com/awinogradov/code-assistants/commit/dcb51c87f6026728a9baf6c40837859c3b10d31f))

### Bug Fixes

* **actions:** derive bot uid from github api for noreply email ([cd9b047](https://github.com/awinogradov/code-assistants/commit/cd9b0475830816e1be8f5e5d62362acf289d166e))
* **actions:** remove vars expr from descriptions ([f5b2c74](https://github.com/awinogradov/code-assistants/commit/f5b2c74aef1561ca8366ed31da938ef6e7bfb514))
* **release-action:** add per-system ticket tables to monorepo releases ([72e0eb9](https://github.com/awinogradov/code-assistants/commit/72e0eb9599bcebe170a1b54422de811bfe9ff3f9))

### Refactoring

* **release-action:** share ticket-config shape with member options ([0126223](https://github.com/awinogradov/code-assistants/commit/01262238212277ebf23e8e8dd3b5a213c42581e5))

### Tests

* **release-action:** assert ticket-insertion output as exact string ([582eacf](https://github.com/awinogradov/code-assistants/commit/582eacf28f413b24cbae9fa6cd053129a4df3cc6))
* **release-action:** cover ticket scoping and monorepo splice ([86f3c07](https://github.com/awinogradov/code-assistants/commit/86f3c07b04b1ae3c97d4cf3b0ef4addb80bfdbdb))
## 0.1.0 (2026-05-28)

## Release Notes

A powerful composite GitHub Action now automates the complete release pipeline for npm packages, GitHub Actions, and Claude plugins with intelligent changelog generation and multi-channel notifications.

## ✨ What's New

### Automated Release Pipeline
This action introduces a two-phase release workflow that handles everything from version bumping to publishing. When you push to main, it automatically creates a release PR with an updated version and changelog. Once merged, it publishes to npm, creates GitHub releases, updates version tags, and sends Slack notifications — all configured through your package.json.

### Monorepo Support
The action now discovers and orchestrates releases for all packages in a monorepo. It intelligently identifies which packages have changed and manages their releases independently, ensuring each package gets its own properly scoped changelog and version bump.

### AI-Enhanced Release Notes
Release notes can now be enriched with AI-generated summaries that provide clear, human-readable explanations of changes. The AI integration analyzes commit messages and linked issues to create comprehensive release notes that highlight what matters to your users.

### Flexible Release Configuration
Configure your release strategy directly in package.json using the new `release` field. This allows you to specify artifact types, custom workflows, and release preferences without modifying GitHub workflows.

## 🐛 Bug Fixes

### Accurate Branch Resolution
The action now correctly resolves branch references to concrete commit SHAs, preventing issues where releases could be created from the wrong commit when branches move during the release process.

### Reliable Monorepo Orchestration
Several edge cases in monorepo release orchestration have been fixed, ensuring that package dependencies are respected and releases happen in the correct order without conflicts.

### Improved Error Handling
API interactions with Linear, Jira, and GitHub are now more robust with better error messages and graceful fallbacks when external services are unavailable or return unexpected responses.

## ⚙️ Configuration Required

### GitHub Token Permissions
Your GitHub token needs `contents: write` and `pull-requests: write` permissions. For Actions, use a Personal Access Token (PAT) or GitHub App installation token instead of the default GITHUB_TOKEN to ensure proper workflow triggering.

### Optional API Keys
To enable enhanced features, you can provide:
- `anthropic_api_key`: For AI-generated release summaries
- `linear_api_key`: To fetch Linear ticket details  
- `slack_token`: For release notifications to Slack channels

### Package.json Release Field
Add a `release` field to your package.json to configure release behavior. See the documentation for available options and examples.


### Features

* **release-action:** add composite action for release workflows ([6368fbe](https://github.com/awinogradov/code-assistants/commit/6368fbef248c1e3c7c47bfdbc2d8a8e1598f6587))
* **release-action:** add monorepo member discovery modules ([6dfbef7](https://github.com/awinogradov/code-assistants/commit/6dfbef7a8bfc15032868b4fcecca9632e1a52c34))
* **release-action:** orchestrate per-member releases in monorepo mode ([687d7d3](https://github.com/awinogradov/code-assistants/commit/687d7d3f257a0a3ebd38aa151be50fa02b2173f0))
* **release-action:** read release config from package.json ([de0f103](https://github.com/awinogradov/code-assistants/commit/de0f103a117fa63ff895a936540c8b9d05bfd5d2))

### Bug Fixes

* **release-action:** correct base-ref and branch template coercion ([ac586a4](https://github.com/awinogradov/code-assistants/commit/ac586a46f950d5eddb016f0ba82b445d42f30f15))
* **release-action:** resolve base ref to a concrete commit sha ([611ddfd](https://github.com/awinogradov/code-assistants/commit/611ddfd587c0a3ff9e01759c0fef4efd26cbc51d))
* **release-action:** tighten monorepo orchestrator correctness ([65d12c9](https://github.com/awinogradov/code-assistants/commit/65d12c950c6cbe6d1d4693324e24621318ca698b))
* **release-action:** tighten parsers, ticket extraction, and api errors ([6eb786c](https://github.com/awinogradov/code-assistants/commit/6eb786cd6e41d4805cac38a7b53ae3b868797b12))
* **release-action:** wire ai notes into monorepo ([fd8dbf1](https://github.com/awinogradov/code-assistants/commit/fd8dbf16163e0a9024fd332032b4965c0b411882))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### Tests

* **release-action:** cover cwd path in notes ([720647d](https://github.com/awinogradov/code-assistants/commit/720647d9350bdfc66b220ff03e4298e43afde697))
* **release-action:** cover happy paths in notes ([643c4c8](https://github.com/awinogradov/code-assistants/commit/643c4c86bdcbb324062129131ba3083ab949c930))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
