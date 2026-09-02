# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [1.5.0](https://github.com/awinogradov/code-assistants/compare/release-action@v1.4.1...release-action@v1.5.0) (2026-09-02)

## Release Notes

AI-generated release notes, PR descriptions, and review replies are now capped to one sentence per item across all autopilot outputs.

## ✨ What's New

- Release note bullets, PR descriptions, issue bodies, and review replies are each limited to one sentence — one fact and one reason — eliminating multi-paragraph prose from all autopilot outputs.

<details><summary>Related issues</summary>

- [#643: Make generated prose short and confident across autopilot outputs](https://github.com/awinogradov/code-assistants/issues/643)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #643 | [#644](https://github.com/awinogradov/code-assistants/pull/644) | @awinogradov |

### Features

* **autopilot:** make generated prose short and confident ([5e6895e](https://github.com/awinogradov/code-assistants/commit/5e6895e7de5da63671a76808fa6341c2bbbb7d29))
* **release-action:** emit one-sentence release note bullets ([ac51009](https://github.com/awinogradov/code-assistants/commit/ac510098965d3f39ed78d4568088845686896c75))
## [1.4.1](https://github.com/awinogradov/code-assistants/compare/release-action@v1.4.0...release-action@v1.4.1) (2026-08-29)

## Release Notes

The npm publish auth path for `pull_request_target`-triggered workflows is now correctly documented and wired — OIDC does not work on this trigger, and the `npm_token` input must be passed explicitly.

## 🐛 Bug Fixes

### npm Publish Auth on `pull_request_target` Triggers

The first live npm publish run (claude-plugin 7.2.0) failed at the auth gate because the publish workflow was relying on OIDC token auth, which GitHub does not issue to `pull_request_target`-triggered runs. No `npm_token` was being passed either, leaving the publish step with no valid auth path. The fail-fast gate worked correctly — no tag or GitHub Release was created for that version — but the publish itself never completed.

The workflow now explicitly passes `NPM_TOKEN` to the release action. Any repository using this action to publish npm packages must have `NPM_TOKEN` configured as a repository secret and passed via the `npm_token` input on the publish step.

## 📋 Protocol & Contract Changes

### npm Auth: Token Required for `pull_request_target` Publish Workflows

OIDC (`id-token: write`) is no longer the documented auth path for publish jobs triggered by `pull_request_target`. Token auth via `npm_token` is the operative path for this trigger. The `id-token: write` permission remains declared so a future migration to an OIDC-capable trigger (e.g. `push`) requires no permissions change.

**Before:**
```yaml
# publish workflow passed no npm_token input
# id-token: write was implied as the auth path
- uses: awinogradov/code-assistants/.github/actions/release-action@v1
  with:
    mode: publish
    bot_token: ${{ secrets.BOT_TOKEN }}
    bot_username: ${{ vars.BOT_USERNAME }}
    slack_token: ${{ secrets.SLACK_TOKEN }}
```

**After:**
```yaml
# npm_token is now required for npm-publishing repositories
- uses: awinogradov/code-assistants/.github/actions/release-action@v1
  with:
    mode: publish
    bot_token: ${{ secrets.BOT_TOKEN }}
    bot_username: ${{ vars.BOT_USERNAME }}
    npm_token: ${{ secrets.NPM_TOKEN }}
    slack_token: ${{ secrets.SLACK_TOKEN }}
```

## ⚙️ Configuration Required

### `NPM_TOKEN` Secret for npm-Publishing Repositories

Any repository using release-action to publish npm packages must have `NPM_TOKEN` configured as a repository secret and wired into the publish workflow via the `npm_token` input. This was always required for token-based auth but was previously undocumented and omitted from the reference workflow — the omission caused a live publish failure. OIDC cannot substitute for this on `pull_request_target` triggers. See the updated [release-action README](https://github.com/awinogradov/code-assistants/blob/main/.github/actions/release-action/README.md) and [docs/06-release-field.md](https://github.com/awinogradov/code-assistants/blob/main/docs/06-release-field.md) for the full inputs table.

## 📚 Documentation & Settings Updates

### Corrected npm Auth Claims Across Release Docs

The [release-action README](https://github.com/awinogradov/code-assistants/blob/main/.github/actions/release-action/README.md), [docs/06-release-field.md](https://github.com/awinogradov/code-assistants/blob/main/docs/06-release-field.md), and the [release-publish.yml](https://github.com/awinogradov/code-assistants/blob/main/.github/workflows/release-publish.yml) workflow header have all been updated to accurately reflect that token auth is required for `pull_request_target` publish jobs. References to OIDC as a usable auth path on this trigger have been removed.


### Documentation

* correct npm auth claims for release publish ([ae69284](https://github.com/awinogradov/code-assistants/commit/ae69284e81826d1b4e39910ec808b777ed97491f))
## [1.4.0](https://github.com/awinogradov/code-assistants/compare/release-action@v1.3.1...release-action@v1.4.0) (2026-08-27)

## Release Notes

The release pipeline now automatically publishes public Claude plugins to npm as versioned packages, starting with Autopilot shipping as `@code-assistants/autopilot`.

## ✨ What's New

### Claude Plugin npm Publishing

Public Claude plugins in the monorepo are now published to npm as part of the standard release flow. When a plugin's `package.json` marks it as non-private with a `claude-plugin` release type, the publish phase will push it to the npm registry — preferring OIDC trusted publishing over long-lived token secrets where the registry supports it.

This means Autopilot is now available as `@code-assistants/autopilot` on npm. Consumers can pin an exact version in their `package.json` and let lockfiles track registry integrity, rather than relying on Claude's plugin cache. The npm package also doubles as a local Claude Code marketplace entry point, so the plugin installs directly from `node_modules`.

As part of this change, the release pipeline now validates that version numbers are consistent across a plugin's npm manifest, Claude plugin manifest, and release manifest — a mismatch will fail the release before anything is published.

<details><summary>Related issues</summary>

- [#630: Publish Autopilot as a versioned npm package](https://github.com/awinogradov/code-assistants/issues/630)
- [#632: Publish Autopilot as a versioned npm package](https://github.com/awinogradov/code-assistants/pull/632)
</details>

## 📚 Documentation & Settings Updates

### Claude Plugin npm Publishing & Install Guide

Documentation has been added covering how Claude plugin npm publishing works, how to configure a plugin for public release, and how to install a published plugin from `node_modules`. See the updated docs for the full setup walkthrough.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #630 | [#632](https://github.com/awinogradov/code-assistants/pull/632) | @awinogradov |

### Features

* **release-action:** publish public claude plugins to npm ([3cf5b63](https://github.com/awinogradov/code-assistants/commit/3cf5b63aea00530b5211a72a196003de99af7cd1))

### Documentation

* describe claude plugin npm publishing and install ([c32bb88](https://github.com/awinogradov/code-assistants/commit/c32bb88e61860d746b7b26984fc33f5f17f2184b))

### Tests

* cover npm publish gate and pack contract ([9de789a](https://github.com/awinogradov/code-assistants/commit/9de789a3dbd052ac50f27b18f13771b229f65170))
## [1.3.1](https://github.com/awinogradov/code-assistants/compare/release-action@v1.3.0...release-action@v1.3.1) (2026-08-01)

## Release Notes

Internal autopilot refactoring for Claude 5 compatibility — no user-facing changes in this release, but two breaking changes in agent output contracts require attention before deployment.

## ⚠️ Breaking Changes

### Agent Output Format: JSON Instead of Markdown

The `fetch-pr-reviews`, `analyze-pr-commits`, `analyze-staged-changes`, and `scan-and-analyze-todos` agents now emit bare JSON objects instead of markdown-wrapped blocks. Any downstream system, script, or integration that parses the text output from these agents by looking for markdown fences or template-formatted text will stop working correctly.

**Before:**
```
```json
{ "field": "value" }
```
```

**After:**
```
{ "field": "value" }
```

Update any parsing logic to read the schema fields directly from the raw JSON output.

### Expert Review Score Field Removed

The `expert-review` agent drops the `revision.rescore` field. The `score` value is now derived automatically from five scoring dimensions rather than being set as a single explicit value. Additionally, stored plan `Score:` lines now record individual per-reviewer verdicts instead of a single averaged score.

**Before:**
```
revision.rescore: <number>
Score: <averaged value>
```

**After:**
```
score: <derived from 5 dimensions>
Score: <reviewer1_verdict> / <reviewer2_verdict> / ...
```

Any tooling or scripts that read `revision.rescore` or expect a single numeric `Score:` line from stored plans must be updated.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

## ✨ What's New

### Claude 5 Skill Architecture

Autopilot skills have been restructured to work with Claude 5 generation models. Shared instruction blocks are now deduplicated under single ownership, bulk content is disclosed progressively, and instructions are written around intent rather than procedure. The practical effect is more consistent, lower-token autopilot runs with less redundancy across skill invocations.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

### Non-Interactive Autopilot Mode for `pr:update`

`pr:update` now accepts a `--autopilot` flag that allows skill callers to invoke it without requiring interactive input. This unblocks automated commit flows where autopilot needs to update a PR without human intervention at that step.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

### Rebase-Merge Branch Detection in Preflight

`preflight-check` can now detect branches whose commits have already landed upstream via rebase-merge — a pattern that previously went unnoticed and could cause confusing failures later in the release or review flow.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

### Reduced Token Cost for `pr:review`

`pr:review` now loads check-family details on demand rather than upfront, which reduces token consumption per review run while keeping every rule link resolvable when it's needed.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #535 | [#536](https://github.com/awinogradov/code-assistants/pull/536) | @awinogradov |

### Refactoring

* **autopilot:** dedupe shared instruction blocks across skills ([3f369ed](https://github.com/awinogradov/code-assistants/commit/3f369edcc032e056bf70b5c54087ff7abcedb7e9))
## [1.3.0](https://github.com/awinogradov/code-assistants/compare/release-action@v1.2.0...release-action@v1.3.0) (2026-07-02)

## Release Notes

Changelog and reference hygiene reach generated PR bodies, review replies, and issue content — every tracker ID, commit SHA, file path, and external resource now renders as a clickable link in the action's AI-generated output.

## ✨ What's New

### Linked Files and External Resources in Generated Issues

When the release action's autopilot generates a GitHub issue body, any repo files it mentions are now linked directly to their source, and any external resources it cites are linked to their canonical URLs. Previously these appeared as plain text, making it harder to navigate from an issue to the actual code or documentation being referenced.

<details><summary>Related issues</summary>

- [#386: Auto-link mentioned files and external resources in generated issue bodies](https://github.com/awinogradov/code-assistants/issues/386)
</details>

## 🐛 Bug Fixes

### Clickable Tracker IDs and Commit SHAs in Generated Output

Linear ticket references in AI-generated PR bodies and review output are now rendered as proper clickable links (using the plain issue URL form after `Closes`/`Fixes` magic words so GitHub's close-parsers still work). Review replies that cite a fixing commit now show a linked SHA instead of a bare hash. Both were technically valid text before but dead-ended the reader — you'd have to copy-paste to navigate anywhere.

<details><summary>Related issues</summary>

- [#387: PR bodies and review replies still emit unlinked references violating RFC-0001](https://github.com/awinogradov/code-assistants/issues/387)
</details>

## 📚 Documentation & Settings Updates

### Reference Formatting Standard Updated to v5

[RFC-0001](https://github.com/awinogradov/code-assistants/blob/main/rfc/0001-reference-formatting.md) has been updated with two new rules: an existence test for file mentions (only link a file path if the file actually exists in the repo — proposed files stay as code specimens in backticks), and an explicit external-resources rule governing how the action cites articles, vendor docs, and web standards. These changes tighten the contract that all generated output is expected to follow.

<details><summary>Related issues</summary>

- [#386: Auto-link mentioned files and external resources in generated issue bodies](https://github.com/awinogradov/code-assistants/issues/386)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #386 | [#407](https://github.com/awinogradov/code-assistants/pull/407) | @awinogradov |
| #387 | [#388](https://github.com/awinogradov/code-assistants/pull/388) | @awinogradov |

### Features

* **autopilot:** link file and external refs in issue bodies ([1fc148d](https://github.com/awinogradov/code-assistants/commit/1fc148d247ad6a33563f401a43f8d29218af6210))

### Bug Fixes

* link tracker ids and shas in generated output ([56e8668](https://github.com/awinogradov/code-assistants/commit/56e8668bfe800373f2cdaa0da4615924c8f87c67))

### Tests

* guard linked reference forms in skills ([078b9ed](https://github.com/awinogradov/code-assistants/commit/078b9ed55d08bfd223564605726322772fb80472))
## [1.2.0](https://github.com/awinogradov/code-assistants/compare/release-action@v1.1.3...release-action@v1.2.0) (2026-06-26)

## Release Notes

The AI-generated release notes are working again after the hardcoded deprecated model was replaced with a configurable input.

## ✨ What's New

### Custom Anthropic Host and Auth Token Support

The release action can now route its Anthropic SDK calls through a gateway, proxy, or any API-compatible endpoint. Two new optional inputs — `anthropic_base_url` and `anthropic_auth_token` — let you point the action at an internal endpoint and authenticate with a bearer token instead of the standard `x-api-key` header. When these inputs are left unset, the action behaves exactly as before.

<details><summary>Related issues</summary>

- [#27: Support a custom Anthropic host (base URL) for SDK-backed actions](https://github.com/awinogradov/code-assistants/issues/27)
</details>

### Configurable Release Notes Model

The AI model used to generate release notes is now an explicit input rather than a hardcoded value. You can override which Claude model the action calls without touching code — useful if you need to pin to a specific model version or roll forward when a model is retired.

<details><summary>Related issues</summary>

- [#369: Release notes fail to generate because the AI model is hardcoded and deprecated](https://github.com/awinogradov/code-assistants/issues/369)
</details>

## 🐛 Bug Fixes

### AI Release Notes Restored

Release note generation was silently failing because the action was calling a deprecated Claude model. The default model has been updated to `claude-sonnet-4-6` and the action now accepts a `release_notes_model` input so future model changes won't require a code release.

<details><summary>Related issues</summary>

- [#369: Release notes fail to generate because the AI model is hardcoded and deprecated](https://github.com/awinogradov/code-assistants/issues/369)
</details>

## ⚙️ Configuration Required

### `anthropic_base_url` (Optional)

Specifies a custom base URL for the Anthropic SDK — useful for routing through a corporate gateway, API proxy, or a self-hosted compatible endpoint. Leave unset to use the default Anthropic API host. Applies to `release-action`, `code-review-action`, and `code-review-cost-monitor`.

### `anthropic_auth_token` (Optional)

A bearer token used to authenticate against a custom Anthropic host. Required only when `anthropic_base_url` points to an endpoint that expects `Authorization: Bearer <token>` instead of the standard `x-api-key` header. Has no effect when `anthropic_base_url` is unset.

### `release_notes_model` (Optional)

Overrides the Claude model used during the **create** phase to generate the AI release summary. Defaults to `claude-sonnet-4-6`. Set this if you need to pin to a specific model version or want to test a newer model without waiting for an action release.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #369 | [#370](https://github.com/awinogradov/code-assistants/pull/370) | @awinogradov |
| #334 | [#335](https://github.com/awinogradov/code-assistants/pull/335) | @awinogradov |
| #27 | [#326](https://github.com/awinogradov/code-assistants/pull/326) | @awinogradov |

### Features

* **rfc:** link cross-document references ([46e5d6f](https://github.com/awinogradov/code-assistants/commit/46e5d6f7b5d6c7e62453f751c71faf6145499851))
* support custom anthropic host for sdk ([3f53bde](https://github.com/awinogradov/code-assistants/commit/3f53bde9f8dab8fabfa3f08c30addeac1bd8b097))

### Bug Fixes

* **release-action:** make release-notes model a configurable input ([9291872](https://github.com/awinogradov/code-assistants/commit/9291872515dc5a0fcd05e7669ae2ddd951059cac))

### Documentation

* document anthropic base-url and auth inputs ([f902894](https://github.com/awinogradov/code-assistants/commit/f902894ab4c791545b720152ee8d730485584b4a))

### Refactoring

* share anthropic auth-exclusion guard ([d207c07](https://github.com/awinogradov/code-assistants/commit/d207c070410ff1081c142255c4615a33a656b6a1))

### Tests

* cover sdk env and client-option helpers ([0a669d0](https://github.com/awinogradov/code-assistants/commit/0a669d01bb5c27bf51a250a18b244822c6fcf637))

### CI

* read version via redirection, not cat pipe ([0450108](https://github.com/awinogradov/code-assistants/commit/0450108bb23944ceb852c1c8f191782429107f93))
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
