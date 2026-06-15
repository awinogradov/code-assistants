# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [1.1.3](https://github.com/awinogradov/code-assistants/compare/release-action@v1.1.2...release-action@v1.1.3) (2026-06-15)

## Release Notes

Documentation callouts now render as native GitHub alert boxes for better visibility.

## 📚 Documentation & Settings Updates

### GitHub alert syntax for callouts
All documentation across the project now uses GitHub's native alert syntax (like `> [!TIP]`) instead of custom formatting. This creates proper colored alert boxes with icons when viewing docs on GitHub, making important information like tips, warnings, and notes more visually distinct and easier to spot. The AI code review footer hint also renders as a native tip alert for better visibility.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #315 | [#316](https://github.com/awinogradov/code-assistants/pull/316) | @awinogradov |

### Documentation

* adopt github alert syntax for callouts ([151e57b](https://github.com/awinogradov/code-assistants/commit/151e57bd2694b5df626833d3243cdded6f77eef9))
## [1.1.2](https://github.com/awinogradov/code-assistants/compare/release-action@v1.1.1...release-action@v1.1.2) (2026-06-13)

## Release Notes

Release action now links to the correct documentation after the repository's doc restructuring.

## 📚 Documentation & Settings Updates

### Documentation links updated throughout release action
All documentation links have been updated to match the new numbered chapter structure. Error messages, automated release comments, and README references now point to the correct locations after the repository documentation was reorganized into numbered book chapters.

<details><summary>Related issues</summary>

- [#295: MAINTENANCE: Restructure docs into numbered book chapters](https://github.com/awinogradov/code-assistants/pull/295)
</details>


### Documentation

* update doc links in readmes and jsdoc ([8e468d2](https://github.com/awinogradov/code-assistants/commit/8e468d230fa333803a85665f0d26757c13e1350d))
## [1.1.1](https://github.com/awinogradov/code-assistants/compare/release-action@v1.1.0...release-action@v1.1.1) (2026-06-08)

## Release Notes

Documentation updates for release v1.1.1 that affect review bot formatting behavior.

## ✨ What's New

### Improved reference formatting in PR reviews
The release action now follows standardized reference formatting rules when generating review comments and replies. Commit SHAs are automatically linked for easy navigation, and document references follow consistent patterns that prevent broken links when files are moved or restructured.

<details><summary>Related issues</summary>

- [#259: Apply RFC-0001 reference formatting to PR review replies and comments](https://github.com/awinogradov/code-assistants/issues/259)
</details>

## 📚 Documentation & Settings Updates

### RFC-0001 updated with section anchor guidance
The reference formatting standard now clarifies how to link sections within the same document using anchors (e.g., `[Phase 6](#phase-6-reply-to-review-threads)`). Cross-document section references should include an inline summary instead of fragile anchor links that break when documents are restructured.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #259 | [#268](https://github.com/awinogradov/code-assistants/pull/268) | @awinogradov |

### Documentation

* **rfc:** allow same-document section anchors ([0cebbb6](https://github.com/awinogradov/code-assistants/commit/0cebbb6092e4a09a8412d485644bf99d9c683562))
## [1.1.0](https://github.com/awinogradov/code-assistants/compare/release-action@v1.0.2...release-action@v1.1.0) (2026-06-04)

## Release Notes

Release notes now follow consistent formatting rules that make file names, commit SHAs, and issue references clickable and easier to follow.

## ✨ What's New

### Standardized reference formatting
Generated release notes, code reviews, and other automated outputs now format references consistently — file names appear in backticks, commit SHAs and issues become clickable links, and RFC standards link to their stable versioned documents. This makes it much easier to trace references and navigate between related items.

<details><summary>Related issues</summary>

- [#236: Standardize reference formatting and readability in generated output](https://github.com/awinogradov/code-assistants/issues/236)
- [#246: Version the reference-formatting standard as a stable RFC](https://github.com/awinogradov/code-assistants/issues/246)
</details>

## 🐛 Bug Fixes

### Escaped backslashes in PR titles
Release notes no longer break when PR titles contain backslashes. Previously, a backslash in a title could corrupt the YAML formatting and cause parsing errors.

### Removed environment variable security vulnerability
The release publish workflow no longer writes untrusted PR filenames to environment variables, resolving a critical security alert. The action already had a safer method to detect changed files, making the vulnerable approach unnecessary.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #246 | [#249](https://github.com/awinogradov/code-assistants/pull/249) | @awinogradov |
| #236 | [#237](https://github.com/awinogradov/code-assistants/pull/237) | @awinogradov |

### Features

* **release-action:** format release-notes refs ([f081b76](https://github.com/awinogradov/code-assistants/commit/f081b7610160bcf34cf2e00d8afff4a367167ae5))
* **rfc:** version the reference-formatting standard ([cdd6c04](https://github.com/awinogradov/code-assistants/commit/cdd6c042605c3f28cd4b3299fa61bcec6a4f8c64))

### Bug Fixes

* **release-action:** escape backslash in titles ([85fcf34](https://github.com/awinogradov/code-assistants/commit/85fcf344a0216adbfa6c02766ef4271f0ebab455))
* **release-publish:** drop changed-files env step ([7185543](https://github.com/awinogradov/code-assistants/commit/7185543f5155702c043b7a083b89eda6e902f2c3))

### Tests

* **release-action:** add backslash-only title ([0904d5b](https://github.com/awinogradov/code-assistants/commit/0904d5bbcd260d19481734f96b6bc7d8c694f29e))
## [1.0.2](https://github.com/awinogradov/code-assistants/compare/release-action@v1.0.1...release-action@v1.0.2) (2026-05-31)

## Release Notes

The release-action service no longer shows misleading warnings about missing placeholders when creating release branches in monorepo projects.

## 🐛 Bug Fixes

### Cleaner monorepo release logs
When creating releases for packages in a monorepo, the action previously displayed a warning about missing `{member}` placeholder in the branch name template, even though the branches were created correctly. This noise has been eliminated — you'll only see warnings now if you explicitly configure a custom branch template that's missing required placeholders.

<details><summary>Related issues</summary>

- [#208: HOTFIX: Remove false release-branch warning on monorepo releases](https://github.com/awinogradov/code-assistants/pull/208)
</details>


### Bug Fixes

* **release-action:** treat release-{version} default as unset ([b55fffb](https://github.com/awinogradov/code-assistants/commit/b55fffb8cf75d95588d320fb8a8c90bca5bb30c0))
## [1.0.1](https://github.com/awinogradov/code-assistants/compare/release-action@v1.0.0...release-action@v1.0.1) (2026-05-29)

## Release Notes

The release action now properly respects manually-set versions in manifests, preventing regressions during multi-package releases.

## 🐛 Bug Fixes

### Version protection for multi-package releases
Release automation no longer overwrites higher version numbers that have been manually set in manifest files. Previously, if you bumped a package version in a manifest but hadn't created a tag yet, the release process would revert it to match the latest tag version. This protection ensures your carefully planned version updates remain intact throughout the release pipeline.

<details><summary>Related issues</summary>

- [#163: release-action regresses manually-set manifest versions (tag-only base) — add version floor + monotonicity guard](https://github.com/awinogradov/code-assistants/issues/163)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #163 | [#164](https://github.com/awinogradov/code-assistants/pull/164) | @awinogradov |

### Bug Fixes

* **release-action:** floor member version on manifest, not just tags ([08499a9](https://github.com/awinogradov/code-assistants/commit/08499a95108a71dd3c727ace9fe6f43925f17928))

### Refactoring

* **release-action:** share version readers, bound pyproject parse ([fe7a272](https://github.com/awinogradov/code-assistants/commit/fe7a272b9d92a0b41bcc68346c6dc31d9627c54e))

### Tests

* **release-action:** add unit tests for version-file readers ([f65ca5f](https://github.com/awinogradov/code-assistants/commit/f65ca5f7d157f6d9f9e1c18227c101d869d56ff5))
## [1.0.0](https://github.com/awinogradov/code-assistants/compare/release-action@v0.1.0...release-action@v1.0.0) (2026-05-29)

## Release Notes

Major update brings release auto-merge control, monorepo ticket tracking improvements, and simplified bot authentication configuration.

## ✨ What's New

### Auto-merge control for release PRs
Release PRs no longer merge automatically by default, giving teams control over when releases go live. Enable auto-merge by adding `"automerge": true` to the `release` section in your root `package.json`. Without this flag, release PRs stay approved but require manual merging, allowing final reviews or coordinated deployments.

<details><summary>Related issues</summary>

- [#112: Gate release auto-merge behind a release.automerge flag in package.json](https://github.com/awinogradov/code-assistants/issues/112)
</details>

### Monorepo ticket tables
Monorepo releases now show ticket information (GitHub Issues, Linear, Jira) for each package being released, making it easier to track what issues were fixed in which components. The tables appear automatically when the release action detects your configured ticket systems, scoped to show only tickets relevant to each package's changes.

<details><summary>Related issues</summary>

- [#102: Monorepo release notes are missing the GitHub Issues / Linear / Jira blocks](https://github.com/awinogradov/code-assistants/issues/102)
</details>

## 🐛 Bug Fixes

### Bot email generation
The release action now correctly generates GitHub's noreply email addresses for bot accounts by looking up the user ID through the API, ensuring commits show the proper bot identity instead of failing with invalid email formats.

### Action loading errors
Fixed composite actions failing to start due to invalid variable references in their configuration, which was preventing the sync and release workflows from running at all.

## ⚠️ Breaking Changes

### Bot token configuration
All action inputs named `token` or `github_token` are now `bot_token` for consistency. Update your workflow files to use the new input name. Additionally, workflows now expect `secrets.BOT_TOKEN` and `vars.BOT_USERNAME` instead of `secrets.GH_TOKEN`.

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>

**Migration steps:**
1. In your workflow files, change `token:` or `github_token:` to `bot_token:` in the `with:` section
2. Update secret references from `${{ secrets.GH_TOKEN }}` to `${{ secrets.BOT_TOKEN }}`
3. Optionally add `bot_username: ${{ vars.BOT_USERNAME }}` to customize the git author name

## 📚 Documentation & Settings Updates

### Release PR authentication
Added documentation explaining why release PRs must be authored by a different identity than the reviewer when using auto-approval. The release action's create mode now clearly shows which token to use for authoring versus reviewing, preventing the silent failure that occurred when the same account tried to approve its own PR.

### Auto-merge setup guide
New documentation in `docs/release-automerge.md` explains the complete auto-merge setup, including the identity requirements, the new `release.automerge` flag, and integration with the code review action's auto-approval feature.


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

### Documentation

* **release:** document distinct release-pr author identity ([eb99546](https://github.com/awinogradov/code-assistants/commit/eb995467a7fad1f4408c6cbf8736e8a4e8d2097c))
* **release:** note distinct create-mode token identity ([c270aaa](https://github.com/awinogradov/code-assistants/commit/c270aaaa543c5f1c78aaccc7b4b2198715e82a64))

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
