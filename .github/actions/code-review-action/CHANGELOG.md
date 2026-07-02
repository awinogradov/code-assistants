# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [1.6.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.5.0...code-review-action@v1.6.0) (2026-07-02)

## Release Notes

The default AI review model is now Claude Sonnet 5, delivering sharper analysis out of the box alongside a set of quality and presentation improvements across review output.

## ✨ What's New

### Upgraded Default Model: Claude Sonnet 5

AI code reviews now run on Claude Sonnet 5 by default, with no configuration changes required. Teams that need to pin a specific model can still do so using the `model` input on the action. Expect noticeably more accurate and detailed review findings from this release onward.

<details><summary>Related issues</summary>

- [#392: Switch the code review default model to Claude Sonnet 5](https://github.com/awinogradov/code-assistants/issues/392)
</details>

### Repository RFC and Docs Standards Enforcement

The AI reviewer now reads a repository's own `rfc/` and `docs/` folders and enforces their conventions as part of every review. Violations of Accepted RFCs are flagged as blocking findings; conflicts with Draft RFCs or contradictions of documented conventions surface as suggestions. Two new RFC hygiene checks are also active: editing an Accepted RFC without a version bump is flagged, as is an RFC that is missing from the `rfc/README.md` index. Repositories that have no `rfc/` or `docs/` folders see no change in review behavior or cost.

<details><summary>Related issues</summary>

- [#403: Enforce consumer rfc/ and docs/ standards in code review](https://github.com/awinogradov/code-assistants/issues/403)
</details>

### Rotating Usage Tips (Occasional, Non-Repeating)

Roughly 1 in 20 reviews now includes a single rotating usage tip at the end of the comment. The tip pool is tracked per pull request so the same tip never appears twice on the same PR. Clean approvals never carry a tip. Duplicate-review suppression is unaffected. This replaces the static "ask the reviewer" hint that previously appeared on every review comment.

<details><summary>Related issues</summary>

- [#389: Show a random tip in 5% of AI review comments, never repeated within a PR](https://github.com/awinogradov/code-assistants/issues/389)
</details>

### Clickable References in Review Output

All file paths, doc references, RFC citations, Linear/GitHub tracker IDs, and fixing commit SHAs in generated review comments and PR bodies now render as real, clickable links rather than backticked dead text or bare hashes. File and doc references resolve to permalinks at the reviewed commit. This applies to both new reviews and reply comments from the `react` mode.

<details><summary>Related issues</summary>

- [#279: Apply RFC-0001 formatting to generated PR descriptions and release notes](https://github.com/awinogradov/code-assistants/issues/279)
- [#387: PR bodies and review replies still emit unlinked references violating RFC-0001](https://github.com/awinogradov/code-assistants/issues/387)
</details>

## 🐛 Bug Fixes

### Garbled Line Breaks in Review Comments

Review comments were rendering literal `\n` escape sequences instead of actual line breaks, making multi-point findings hard to read. Formatting now renders correctly in all review comment bodies.

### Repeated "Ask the Reviewer" Footer Removed

The static usage hint that appeared at the bottom of every review comment has been removed. That guidance now surfaces only through the rotating tip pool described above, keeping review footers clean and focused.

<details><summary>Related issues</summary>

- [#389: Show a random tip in 5% of AI review comments, never repeated within a PR](https://github.com/awinogradov/code-assistants/issues/389)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #389 | [#408](https://github.com/awinogradov/code-assistants/pull/408) | @awinogradov |
| #279 | [#406](https://github.com/awinogradov/code-assistants/pull/406) | @awinogradov |
| #403 | [#404](https://github.com/awinogradov/code-assistants/pull/404) | @awinogradov |
| #392 | [#394](https://github.com/awinogradov/code-assistants/pull/394) | @awinogradov |
| #387 | [#388](https://github.com/awinogradov/code-assistants/pull/388) | @awinogradov |

### Features

* **autopilot:** enforce repo rfc and docs standards in review ([1348297](https://github.com/awinogradov/code-assistants/commit/13482974363e8355dc488a23b1cfb61f51c8b6a1))
* **code-review-action:** show random tip in 5% of reviews ([f7f8401](https://github.com/awinogradov/code-assistants/commit/f7f84015cbda9f5f8d7759b7a628158b877175f0))
* **code-review:** switch default model to sonnet 5 ([1f8cb99](https://github.com/awinogradov/code-assistants/commit/1f8cb999486f34f091532930ef7718f9655773dc))

### Bug Fixes

* **code-review-action:** drop always-on usage hint from review footer ([c279ab2](https://github.com/awinogradov/code-assistants/commit/c279ab243134259228e2a72a6809d4d71c08bfd8))
* **code-review:** repair over-escaped newlines in review bodies ([1c2c653](https://github.com/awinogradov/code-assistants/commit/1c2c6539e580c484a1995409bd5d2ffe71f4f7bc))

### Tests

* **code-review:** guard linked review body references ([9a802f6](https://github.com/awinogradov/code-assistants/commit/9a802f67047e8c08846c526a640667b3c07110e4))
* guard linked reference forms in skills ([078b9ed](https://github.com/awinogradov/code-assistants/commit/078b9ed55d08bfd223564605726322772fb80472))
## [1.5.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.4.1...code-review-action@v1.5.0) (2026-06-26)

## Release Notes

The biggest change in this release is the new plugin and marketplace system, which lets you point the code reviewer at custom skills from your own repositories without forking the action.

## ✨ What's New

### Custom Review and React Prompts

The code-review action now accepts `review_prompt` and `react_prompt` inputs, so you can run a completely different skill for review or comment-reply without forking or modifying the action itself. The defaults are unchanged, so existing deployments continue to work as-is.

<details><summary>Related issues</summary>

- [#349: Make the code-review-action review prompt a configurable action input](https://github.com/awinogradov/code-assistants/issues/349)
</details>

### Plugin Marketplaces Support

Two new inputs — `marketplaces` and `plugins` — let a workflow register any plugin source and install specific plugins before the review runs. This is what makes `review_prompt`/`react_prompt` point at consumer-owned skills (like `/platform:pr-review`) work in practice. Without this, the SDK would run in cache-only mode and fail with "Unknown command" for any skill not bundled with autopilot.

`marketplaces` takes one `name=source` entry per line, where the source can be the checked-out repo (`.`), a GitHub repo (`owner/repo[@ref]`), a URL, or an npm package. `plugins` takes one `plugin@marketplace` entry per line.

Example configuration for a consumer workflow:

```yaml
with:
  review_prompt: "/platform:pr-review"
  react_prompt: "/platform:pr-react"
  marketplaces: |
    platform-engineering=.
  plugins: |
    platform@platform-engineering
```

### Private Plugin Marketplace Authentication

When a `marketplaces` entry points at a private GitHub repository, the SDK now has a git credential helper configured before it attempts to clone the plugin source. Previously, with no SSH key in CI, the clone would fail with an authentication error. The action uses the existing `bot_token` to set up credentials, so no additional secrets are needed.

<details><summary>Related issues</summary>

- [#336: Add pdf:create autopilot skill for beautiful, brand-themed PDFs](https://github.com/awinogradov/code-assistants/issues/336)
</details>

### Custom Anthropic Host / Gateway Support

The action now accepts two optional inputs — `anthropic_base_url` and `anthropic_auth_token` — for routing API calls through a proxy, gateway, or any Anthropic-compatible endpoint. `anthropic_auth_token` covers hosts that use a bearer token instead of the standard `x-api-key` header. When neither input is set, behaviour is identical to before.

<details><summary>Related issues</summary>

- [#27: Support a custom Anthropic host (base URL) for SDK-backed actions](https://github.com/awinogradov/code-assistants/issues/27)
</details>

## 🐛 Bug Fixes

### Bot-Authored PRs Are Now Fully Skipped

The reviewer previously only skipped PRs with a `ci-skip-review` label when a bot authored them. It now skips every PR authored by the configured bot, which prevents unnecessary review runs on automated PRs (dependency updates, release commits, etc.).

<details><summary>Related issues</summary>

- [#339: Support Linear as an issue tracker across the autopilot skills](https://github.com/awinogradov/code-assistants/issues/339)
</details>

### PR Author Passed Correctly to Comment-Reply Flow

When the action responded to a PR comment (the `react` mode), it wasn't passing the PR author's login to the reply skill. This could produce replies that misidentified or omitted the original author. The author context is now correctly forwarded.

<details><summary>Related issues</summary>

- [#347: Autopilot review replies show CHECK rule codes as bare text instead of links](https://github.com/awinogradov/code-assistants/issues/347)
</details>

### Rule Codes in Review Replies Now Link to Their Definitions

When the autopilot replied to a review thread, `CHECK-` rule codes appeared as plain text. They now render as clickable links to their rule definition, matching the behaviour already present in main review comments.

<details><summary>Related issues</summary>

- [#347: Autopilot review replies show CHECK rule codes as bare text instead of links](https://github.com/awinogradov/code-assistants/issues/347)
</details>

### "Ask the Reviewer" Tip Removed from Clean Approvals

A usage-hint tip ("you can ask the reviewer…") was being appended to approval reviews even when there were no issues at all, which looked out of place on a clean pass. Approvals with no findings no longer include it.

### Settings File Now Validated Before Being Applied

The action validates the repo's settings JSON with a strict schema check before merging it with action defaults. Previously a malformed settings file could cause silent misconfiguration; now it produces a clear error early in the run.

## ⚙️ Configuration Required

### `review_prompt` (Optional)

The skill command the action runs for pull request reviews. Defaults to the current built-in autopilot review skill. Set this if you want to use a custom or team-specific review skill from your own plugin.

### `react_prompt` (Optional)

The skill command the action runs when replying to a PR comment. Defaults to the current built-in autopilot reply skill. Set this alongside `review_prompt` when switching to a custom skill set.

### `marketplaces` (Optional)

A newline-separated list of `name=source` entries declaring plugin marketplaces the action should register before running. Required when `plugins` or your custom prompts reference skills that aren't part of the bundled autopilot plugin.

### `plugins` (Optional)

A newline-separated list of `plugin@marketplace` entries declaring which plugins to install. The marketplace name must match an entry in `marketplaces`. Consumers with no custom plugins are unaffected — this is a no-op when left unset.

### `anthropic_base_url` (Optional)

The base URL for the Anthropic SDK client. Leave unset to use the standard Anthropic API. Set this when routing through an internal gateway or a compatible third-party endpoint.

### `anthropic_auth_token` (Optional)

A bearer token used instead of `x-api-key` for hosts that require it. Only needed alongside `anthropic_base_url` when the target endpoint uses bearer-token authentication.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #347 | [#351](https://github.com/awinogradov/code-assistants/pull/351) | @awinogradov |
| #349 | [#350](https://github.com/awinogradov/code-assistants/pull/350) | @awinogradov |
| #340 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #341 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #342 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #339 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #336 | [#337](https://github.com/awinogradov/code-assistants/pull/337) | @awinogradov |
| #334 | [#335](https://github.com/awinogradov/code-assistants/pull/335) | @awinogradov |
| #27 | [#326](https://github.com/awinogradov/code-assistants/pull/326) | @awinogradov |

### Features

* **code-review-action:** add review_prompt and react_prompt inputs ([d4f4158](https://github.com/awinogradov/code-assistants/commit/d4f415868b87c66ad2fa14c6147b040a4400afc6))
* **code-review:** add plugins and marketplaces inputs ([67d38d6](https://github.com/awinogradov/code-assistants/commit/67d38d6f0bacf19ba04a2179708ed61f0abeccbd))
* support custom anthropic host for sdk ([3f53bde](https://github.com/awinogradov/code-assistants/commit/3f53bde9f8dab8fabfa3f08c30addeac1bd8b097))

### Bug Fixes

* **autopilot:** link rule codes in review replies ([657d8e0](https://github.com/awinogradov/code-assistants/commit/657d8e03f606d853b2fd4f1c46ba18aba09a7d70))
* **code-review-action:** pass author login to react step prompt ([318282a](https://github.com/awinogradov/code-assistants/commit/318282a6368c3224edf7a22908f77181d9cc1c5d))
* **code-review:** authenticate git for private plugin marketplaces ([9263bbe](https://github.com/awinogradov/code-assistants/commit/9263bbe5bdae2d8e9eb1e67e26b39c2f6787f2c1))
* **code-review:** drop usage-hint tip on clean approvals ([4f23ef7](https://github.com/awinogradov/code-assistants/commit/4f23ef78aa6c8a48d56cb79e8d7473a53efb091d))
* **code-review:** install enabled plugins in headless review ([842e7d9](https://github.com/awinogradov/code-assistants/commit/842e7d976a069c1dc0cbe4294634cba4893a3029))
* **code-review:** skip ai review for all bot-authored prs ([a980413](https://github.com/awinogradov/code-assistants/commit/a98041330877fc8b1dc4bd8a7176a84f2c3dec5d))
* **code-review:** validate settings json with zod before merge ([5cbb209](https://github.com/awinogradov/code-assistants/commit/5cbb2093af948ebfcd9e6df26a21edfecd3bff37))

### Documentation

* **code-review-action:** document review_prompt and react_prompt inputs ([c9c92a7](https://github.com/awinogradov/code-assistants/commit/c9c92a7a9d098d836f4d928cd61010f46c210975))
* document anthropic base-url and auth inputs ([f902894](https://github.com/awinogradov/code-assistants/commit/f902894ab4c791545b720152ee8d730485584b4a))

### Refactoring

* share anthropic auth-exclusion guard ([d207c07](https://github.com/awinogradov/code-assistants/commit/d207c070410ff1081c142255c4615a33a656b6a1))

### Tests

* **code-review-action:** assert prompt input defaults and wiring ([a3a4cc0](https://github.com/awinogradov/code-assistants/commit/a3a4cc09cf227344cf6483b9ea74a007e8a63771))
* **code-review:** add linear:create to format guard ([8eb1228](https://github.com/awinogradov/code-assistants/commit/8eb1228f35e001f59afb4e0adefd38d9cf30d0f1))
* **code-review:** cover blank name and unresolved source skips ([c0414e6](https://github.com/awinogradov/code-assistants/commit/c0414e6e84912a9f205537f523c215f682511839))
* **code-review:** guard link resolution ([591330a](https://github.com/awinogradov/code-assistants/commit/591330a4a2a2f116ace34d02967b4f1f16510461))
* **code-review:** skip node_modules in link walk ([1208232](https://github.com/awinogradov/code-assistants/commit/120823228f998782643d510d65ba8887ad0b8094))
* cover sdk env and client-option helpers ([0a669d0](https://github.com/awinogradov/code-assistants/commit/0a669d01bb5c27bf51a250a18b244822c6fcf637))
## [1.4.1](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.4.0...code-review-action@v1.4.1) (2026-06-15)

## Release Notes

Documentation callouts and AI review footer hints now render as native GitHub alerts for better visibility.

## ✨ What's New

### Native GitHub alerts for documentation
Documentation callouts throughout the contributing guides and action READMEs now use GitHub's alert syntax instead of custom formatting. These render as proper colored alert boxes on GitHub, making important information more visible and consistent with GitHub's design language.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>

## 🐛 Bug Fixes

### AI review footer displays as GitHub tip
The usage hint at the bottom of AI code reviews now appears as a native GitHub "Tip" alert instead of plain text. This makes the instructions for interacting with the review bot more noticeable and visually consistent with GitHub's UI patterns.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #315 | [#316](https://github.com/awinogradov/code-assistants/pull/316) | @awinogradov |

### Bug Fixes

* **code-review-action:** render footer hint as github tip alert ([3d7ea5a](https://github.com/awinogradov/code-assistants/commit/3d7ea5a4bf9e3c8c476fcbf5f68ea14ebbd46e55))

### Documentation

* adopt github alert syntax for callouts ([151e57b](https://github.com/awinogradov/code-assistants/commit/151e57bd2694b5df626833d3243cdded6f77eef9))
## [1.4.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.3.0...code-review-action@v1.4.0) (2026-06-13)

## Release Notes

Review run metrics now travel in machine-readable comments, making cost monitoring resilient to format changes while footers show model details in cleaner, smaller text.

## ✨ What's New

### Review Cost Monitoring Protection
The code review cost monitor no longer breaks when repositories have few reviews or when footer formats change. Instead of parsing visible footers, it now reads metrics from dedicated machine-readable comments that survive any visual redesign. This ensures your cost monitoring stays operational regardless of how review footers evolve.

<details><summary>Related issues</summary>

- [#305: Cost-monitor can't distinguish footer drift from insufficient footer history](https://github.com/awinogradov/code-assistants/issues/305)
</details>

### Model Transparency in Review Summaries
Each code review now displays which Claude model served the request in the run summary table. This helps teams track model usage patterns and understand performance variations between different AI models.

### Cleaner Review Footer Design
Review run summaries now render in smaller text, keeping the visual focus on the actual review findings while still providing all the metrics your team needs. The table remains fully parseable for automated monitoring tools.

<details><summary>Related issues</summary>

- [#281: Use smaller text for the review run summary footer](https://github.com/awinogradov/code-assistants/issues/281)
</details>

## 📚 Documentation & Settings Updates

### Updated Documentation Links
All documentation links throughout the codebase have been updated to reflect the new chapter-based documentation structure. This affects README files and inline code documentation (JSDoc comments), ensuring all references point to the correct locations.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #305 | [#306](https://github.com/awinogradov/code-assistants/pull/306) | @awinogradov |
| #281 | [#298](https://github.com/awinogradov/code-assistants/pull/298) | @awinogradov |

### Features

* add model row to the run-summary table ([4f62199](https://github.com/awinogradov/code-assistants/commit/4f62199589049647bf9bc078039c671a2d080615))
* **code-review:** add run-summary data comment ([18d9e3e](https://github.com/awinogradov/code-assistants/commit/18d9e3e42774130901b2cc63c216f69824b5c05c))
* wrap run-summary table cells in <sub> ([3f56272](https://github.com/awinogradov/code-assistants/commit/3f562722e63348091a0520464e11c85173a0a0ca))

### Reverts

* wrap run-summary table cells in <sub> ([21475ee](https://github.com/awinogradov/code-assistants/commit/21475ee21219061dd1d6a76f4bb248864cde1915))

### Documentation

* update doc links in readmes and jsdoc ([8e468d2](https://github.com/awinogradov/code-assistants/commit/8e468d230fa333803a85665f0d26757c13e1350d))
## [1.3.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.2.0...code-review-action@v1.3.0) (2026-06-08)

## Release Notes

Code review action now explains AI review failures with direct links to check logs and automatically approves PRs when requested changes are addressed.

## ✨ What's New

### Smarter review failure explanations
When the AI can't review your PR, you'll now get a detailed explanation with direct links to the failing check logs. The comment includes a clear summary of what went wrong, making it easy for your team to troubleshoot without digging through workflows.

<details><summary>Related issues</summary>

- [#280: Add check log links and an AI failure summary to the code-review skip comment](https://github.com/awinogradov/code-assistants/issues/280)
</details>

### Multi-line findings stay in context
Review findings that span multiple lines now remain inline with your code even when they cross gaps in the diff. If a finding still needs to move to the main review body, it includes the suggested fix so you don't have to scroll back to the code to understand the recommendation.

<details><summary>Related issues</summary>

- [#265: Keep multi-line findings inline when their range crosses a hunk gap](https://github.com/awinogradov/code-assistants/issues/265)
</details>

### Concise AI agent prompts
The "Prompt for AI agents" blocks in reviews are now copy-paste ready with focused context. Instead of including entire code hunks and review formatting, they show just the relevant diff window and clean instructions that AI agents can directly process.

<details><summary>Related issues</summary>

- [#258: Make the "Prompt for AI agents" review block concise and prompt-shaped](https://github.com/awinogradov/code-assistants/issues/258)
</details>

### Standardized reference formatting
All generated PR descriptions, release notes, and review comments now follow a consistent reference formatting standard. Commit SHAs are always linked, RFC references point to stable versioned documents, and section anchors work reliably within the same document.

<details><summary>Related issues</summary>

- [#279: Apply RFC-0001 formatting to generated PR descriptions and release notes](https://github.com/awinogradov/code-assistants/issues/279)
- [#259: Apply RFC-0001 reference formatting to PR review replies and comments](https://github.com/awinogradov/code-assistants/issues/259)
</details>

## 🐛 Bug Fixes

### Automatic approval when changes are addressed
The review bot now properly approves PRs when an author confirms they've addressed the requested changes and the bot agrees. Previously, the bot would acknowledge the fix in a comment but leave its blocking review status unchanged, requiring manual intervention or a "re-review" command.

<details><summary>Related issues</summary>

- [#275: Approve a blocked PR when the reviewer bot agrees its blockers are resolved](https://github.com/awinogradov/code-assistants/issues/275)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #280 | [#285](https://github.com/awinogradov/code-assistants/pull/285) | @awinogradov |
| #265 | [#283](https://github.com/awinogradov/code-assistants/pull/283) | @awinogradov |
| #279 | [#282](https://github.com/awinogradov/code-assistants/pull/282) | @awinogradov |
| #275 | [#278](https://github.com/awinogradov/code-assistants/pull/278) | @awinogradov |
| #259 | [#268](https://github.com/awinogradov/code-assistants/pull/268) | @awinogradov |
| #258 | [#269](https://github.com/awinogradov/code-assistants/pull/269) | @awinogradov |

### Features

* **code-review-action:** bound prompt context and strip finding chrome ([e9dfc97](https://github.com/awinogradov/code-assistants/commit/e9dfc972cd2ce99df23012a1cb874ef5e6672ff2))
* **code-review-action:** clamp out-of-diff finding ranges ([707d105](https://github.com/awinogradov/code-assistants/commit/707d1050b75b2e29b2592c907c0650f08e69b3df))
* **code-review-action:** reuse review engine for skip reasons ([f62cc9c](https://github.com/awinogradov/code-assistants/commit/f62cc9cad7b2f78a188904712a1beb273bf0dbeb))

### Bug Fixes

* **code-review-action:** arm re-verdict on author ack ([3eb4bd2](https://github.com/awinogradov/code-assistants/commit/3eb4bd2dcf54c88605226f72b746e88b0c807ec5))
* **code-review-action:** drop incomplete html-comment sanitizer regex ([053891b](https://github.com/awinogradov/code-assistants/commit/053891bdd62f3833b957f46fca0b15deae7615dc))

### Refactoring

* **code-review-action:** simplify explain prompt building ([67bf3f9](https://github.com/awinogradov/code-assistants/commit/67bf3f9de93325241be5985d0ab1ce1775e906da))

### Tests

* **code-review-action:** cover reused-engine skip flow ([fb3ded5](https://github.com/awinogradov/code-assistants/commit/fb3ded59b50abcb4147b8c9845938e0163ac1aeb))
* **code-review-action:** guard reply formatting ([1559a23](https://github.com/awinogradov/code-assistants/commit/1559a234f6a9ac0e6fbc97cc3843662edf9381c9))
* **code-review:** guard pr body reference formatting ([eada5e0](https://github.com/awinogradov/code-assistants/commit/eada5e0ff592428077d8244ad58b9439c555881e))
## [1.2.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.1.0...code-review-action@v1.2.0) (2026-06-04)

## Release Notes

The AI code reviewer no longer edits PR descriptions, providing cleaner workflows and more accurate review status tracking.

## ✨ What's New

### Reference formatting standard
All generated output — from code reviews to release notes — now follows a documented standard for formatting references. File names appear in backticks (`example.ts`), commits and RFCs link to stable URLs that won't break when files move, and issue references use full descriptive links. This ensures your team can always resolve references to their sources.

<details><summary>Related issues</summary>

- [#246: Version the reference-formatting standard as a stable RFC](https://github.com/awinogradov/code-assistants/issues/246)
- [#236: Standardize reference formatting and readability in generated output](https://github.com/awinogradov/code-assistants/issues/236)
</details>

### Enhanced code review context
The AI reviewer now gathers comprehensive project context before analyzing pull requests, including project documentation (`CLAUDE.md`, `README`), related TODOs, and domain-specific standards. Reviews also load prior inline comments to provide accurate follow-up feedback. The reviewer performs 14 distinct checks covering task alignment, dead code detection, input validation, and platform-specific standards for logging, documentation, and service integration.

<details><summary>Related issues</summary>

- [#233: Improve the code review skill: context parity, inline history, and rule checks](https://github.com/awinogradov/code-assistants/issues/233)
</details>

## 🐛 Bug Fixes

### Cleaner PR workflows without description edits
The AI reviewer no longer adds "Available commands" footers to pull request descriptions. Instead, usage instructions appear directly in the review comment where they're more discoverable. This eliminates duplicate review runs and ensures the review status accurately reflects whether a review was posted — no more "skipped" status when a review actually ran.

<details><summary>Related issues</summary>

- [#245: Drop the code-review-action PR-body footer that self-triggers reviews](https://github.com/awinogradov/code-assistants/issues/245)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #245 | [#252](https://github.com/awinogradov/code-assistants/pull/252) | @awinogradov |
| #246 | [#249](https://github.com/awinogradov/code-assistants/pull/249) | @awinogradov |
| #236 | [#237](https://github.com/awinogradov/code-assistants/pull/237) | @awinogradov |
| #233 | [#234](https://github.com/awinogradov/code-assistants/pull/234) | @awinogradov |

### Features

* **rfc:** version the reference-formatting standard ([cdd6c04](https://github.com/awinogradov/code-assistants/commit/cdd6c042605c3f28cd4b3299fa61bcec6a4f8c64))

### Bug Fixes

* **code-review:** remove pr-body help footer ([bab0546](https://github.com/awinogradov/code-assistants/commit/bab0546152c8040ef1b3febfec39a4b78d36b625))
* **code-review:** stop bot self-edit from skipping ai-review ([17666fc](https://github.com/awinogradov/code-assistants/commit/17666fc51904d234f7016f16409ad573fd1dde87))

### Tests

* **code-review:** add ref-format drift guard ([a846a41](https://github.com/awinogradov/code-assistants/commit/a846a411601aec37d2a2a834f96239002564f9c8))
* **code-review:** rescope rules_doc_url check ([4f3b7e0](https://github.com/awinogradov/code-assistants/commit/4f3b7e0a48444a1cbdf36e9999b59b3d01bec947))

### CI

* **code-review:** allow read-only gh api gets ([3259a63](https://github.com/awinogradov/code-assistants/commit/3259a630c47bec7323d581cbb34168914856b2d6))
## [1.1.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.0.0...code-review-action@v1.1.0) (2026-06-01)

## Release Notes

Code review findings now include one-click fix suggestions and AI-agent prompts for easier remediation.

## ✨ What's New

### One-click fix suggestions in code reviews
The AI code reviewer now generates GitHub suggestion blocks that let you apply proposed fixes with a single click. Whether it's a typo, a missing import, or a logic improvement, you can accept the suggestion directly from the PR interface without manual editing. Both single-line and multi-line suggestions are supported.

<details><summary>Related issues</summary>

- [#217: Add one-click suggestions and AI-agent prompts to code review comments](https://github.com/awinogradov/code-assistants/issues/217)
</details>

### AI-agent prompts for complex findings
Each code review finding now includes a collapsible "Prompt for AI agents" section. This gives AI coding assistants like GitHub Copilot or Cursor the full context they need to understand and fix the issue. The prompt includes the specific finding details and surrounding code diff, making it easy to get targeted help for more complex problems that can't be fixed with a simple suggestion.

<details><summary>Related issues</summary>

- [#217: Add one-click suggestions and AI-agent prompts to code review comments](https://github.com/awinogradov/code-assistants/issues/217)
</details>

## 📚 Documentation & Settings Updates

### Inline suggestions documentation
The README now includes documentation about the new inline suggestion feature, explaining how the code review action generates one-click fixes and AI-agent prompts within review comments.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #217 | [#218](https://github.com/awinogradov/code-assistants/pull/218) | @awinogradov |

### Features

* **code-review:** add suggestion and agent blocks ([18de884](https://github.com/awinogradov/code-assistants/commit/18de8845ebc8a0b3b9df3590324794b12e807143))

### Documentation

* **code-review:** document inline suggestions ([93273dc](https://github.com/awinogradov/code-assistants/commit/93273dc151abb0a664748453db0a5ec1a201cde1))

### Tests

* **code-review:** cover suggestion rendering and ranges ([f0c3394](https://github.com/awinogradov/code-assistants/commit/f0c339435ecd38d4f6947b8aeadfbcb3e4fd8349))

### CI

* **code-review:** add suggestion fields to schema ([9f35aa9](https://github.com/awinogradov/code-assistants/commit/9f35aa961b2aee7bd369a3cdfd5870b499bbd7bf))
## [1.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v0.3.0...code-review-action@v1.0.0) (2026-05-31)

## Release Notes

Major improvements to AI code review speed and reliability, with transparent run metrics on every review.

## ✨ What's New

### Single-pass code review architecture
AI code reviews now complete in one efficient pass, eliminating the multi-agent fan-out that could leave empty reviews when sub-agents failed. The system processes the entire pull request at once, providing more consistent and reliable results.

<details><summary>Related issues</summary>

- [#177: Simplify code-review-action to one pr:review pass with anchored rule links](https://github.com/awinogradov/code-assistants/issues/177)
- [#174: Code-review fan-out fails: all review sub-agents return no findings object](https://github.com/awinogradov/code-assistants/issues/174)
- [#161: Phase 6: cut code review per-agent and aggregation latency](https://github.com/awinogradov/code-assistants/issues/161)
</details>

### Review run metrics in every comment
Each AI review now includes detailed performance metrics in a collapsible footer, showing exactly how much the review cost, how long it took, token usage, and cache efficiency. This transparency helps teams track AI usage costs and identify performance bottlenecks.

<details><summary>Related issues</summary>

- [#162: Include the per-run summary report in the footer (under the cut) of every review comment](https://github.com/awinogradov/code-assistants/issues/162)
</details>

### Smart rule code linking
Code review findings now generate proper markdown links to rule documentation directly, without post-processing. Each CHECK-* rule code links straight to its detailed explanation in the skill documentation.

<details><summary>Related issues</summary>

- [#179: Generate CHECK rule links inside the review skill instead of a resolver script](https://github.com/awinogradov/code-assistants/issues/179)
</details>

## 🐛 Bug Fixes

### Clear feedback on clean pull requests
When the AI approves a PR with no issues, it now posts a clear "✅ No issues found." message alongside the metrics footer, instead of what appeared to be an empty or broken review containing only statistics.

<details><summary>Related issues</summary>

- [#196: Code review posts a stats-only comment on clean approvals](https://github.com/awinogradov/code-assistants/issues/196)
</details>

### Accurate token usage reporting
The run summary now correctly shows total input tokens including cached content, fixing the previously implausible near-zero values that made cost tracking unreliable.

<details><summary>Related issues</summary>

- [#175: Revalidate run-summary metrics: implausible token counts and likely undercounted cost](https://github.com/awinogradov/code-assistants/issues/175)
</details>

### Review metrics footer deployment
The PR help footer containing review metrics now posts correctly instead of failing silently due to missing environment configuration.

## ⚠️ Breaking Changes

### Removed configuration options
The `parallel_fanout` and `review_model_overrides` action inputs have been removed as part of the single-pass architecture. If you were using these inputs to customize review behavior, remove them from your workflow configuration. The new single-pass system provides better performance without requiring these options.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #196 | [#197](https://github.com/awinogradov/code-assistants/pull/197) | @awinogradov |
| #179 | [#180](https://github.com/awinogradov/code-assistants/pull/180) | @awinogradov |
| #177 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #174 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #175 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #161 | [#169](https://github.com/awinogradov/code-assistants/pull/169) | @awinogradov |
| #162 | [#168](https://github.com/awinogradov/code-assistants/pull/168) | @awinogradov |

### ⚠ BREAKING CHANGES

* **code-review:** removed the parallel_fanout and review_model_overrides action inputs

### Features

* **code-review:** add per-run summary footer to review comments ([0a169d4](https://github.com/awinogradov/code-assistants/commit/0a169d4275bda84db4a0740b06c56dfe7d7c94aa))

### Bug Fixes

* **code-review:** log agent errors and flatten aggregation loop ([47937cf](https://github.com/awinogradov/code-assistants/commit/47937cfddfec97f3fce836099dce395fe490bfe2))
* **code-review:** pass reviewer env to footer step ([e95d144](https://github.com/awinogradov/code-assistants/commit/e95d14417fa620aaba87f44248f2d35d08dcf27c))
* **code-review:** post a no-issues line on clean approvals ([6c03c51](https://github.com/awinogradov/code-assistants/commit/6c03c5126be8064ddcff5cf92c1fdaffefd8aeae))

### Performance

* **code-review:** aggregate findings in code via structured output ([4b53af9](https://github.com/awinogradov/code-assistants/commit/4b53af9c77da054ffe0a7e0fd583c352fb560416))

### Documentation

* **code-review:** document run-summary footer flow ([776741f](https://github.com/awinogradov/code-assistants/commit/776741f53e76baa31d66cd19fb13c33d99a80b69))

### Refactoring

* **code-review:** build rule-code links in the review skill ([db457ff](https://github.com/awinogradov/code-assistants/commit/db457ff08007ad0cb3c73f0155cc76ea30d041f5))
* **code-review:** extract shared marked-details footer builder ([8665adb](https://github.com/awinogradov/code-assistants/commit/8665adbddb0cfa2e08faacbdfe4a2017b693b851))
* **code-review:** replace fan-out with single-pass review skill ([44b3c98](https://github.com/awinogradov/code-assistants/commit/44b3c9836414a2d3fcff57308d6312fa03b0520f))
* **code-review:** simplify finding sort and cover fanout paths ([5107033](https://github.com/awinogradov/code-assistants/commit/510703378b326f9bed5cb63d56f96c7bc791f5f8))

### Tests

* **code-review:** cover run-summary footer and fan-out stats ([13b4ba6](https://github.com/awinogradov/code-assistants/commit/13b4ba6837fd830ffb18848ba341b7c543c8cb25))

### CI

* **code-review:** pass run_summary output to submit review step ([7f6b3e7](https://github.com/awinogradov/code-assistants/commit/7f6b3e73cb4c9bae64471616e2cd493845df2c3c))
## [0.3.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v0.2.0...code-review-action@v0.3.0) (2026-05-29)

## Release Notes

The code review action now runs faster and smarter, with specialized security reviews and detailed performance tracking.

## ✨ What's New

### Security and performance review agents
Code reviews now include dedicated security checks that catch common vulnerabilities like hardcoded secrets, SQL injection risks, and insecure cryptography usage. Performance reviews also flag inefficient algorithms and resource leaks. You can customize which AI model handles each type of review through the new `review_model_overrides` configuration.

<details><summary>Related issues</summary>

- [#148: Right-size review model tiers and add security/performance review checks](https://github.com/awinogradov/code-assistants/issues/148)
</details>

### Performance instrumentation
Each code review run now logs detailed metrics including execution time, token usage, API costs, and the number of AI interactions required. This data appears in your action logs as structured "Run summary" entries, making it easy to track performance and costs over time.

<details><summary>Related issues</summary>

- [#143: Add per-run instrumentation to code-review-action (timing, tokens, cost)](https://github.com/awinogradov/code-assistants/issues/143)
</details>

### Smarter follow-up responses
When developers reply to review comments with questions or clarifications, the action now responds much faster by skipping the full re-review unless explicitly requested. This makes conversational back-and-forth during code review feel more natural and responsive.

<details><summary>Related issues</summary>

- [#144: Fix code-review follow-up reply flow and submission-logic correctness](https://github.com/awinogradov/code-assistants/issues/144)
</details>

## 🐛 Bug Fixes

### Review submission reliability
The action now correctly handles pull requests with more than 100 comment threads and prevents duplicate reviews when multiple instances run simultaneously. Review formatting is preserved exactly as the AI generates it, fixing cases where whitespace changes caused reviews to be incorrectly identified as duplicates.

<details><summary>Related issues</summary>

- [#144: Fix code-review follow-up reply flow and submission-logic correctness](https://github.com/awinogradov/code-assistants/issues/144)
- [#149: Make the code-review submission pipeline testable and add tests](https://github.com/awinogradov/code-assistants/issues/149)
</details>

### Configuration validation
Invalid model override configurations now generate clear warning messages instead of silently failing. The action also properly counts AI interactions for accurate cost tracking.

<details><summary>Related issues</summary>

- [#159: Address code review suggestions and nitpicks from the optimization epic](https://github.com/awinogradov/code-assistants/issues/159)
- [#142: Optimize code-review-action: latency, tokens, follow-up flow, models, tests](https://github.com/awinogradov/code-assistants/issues/142)
</details>

## ⚙️ Configuration Required

### Model overrides
You can now customize which AI models handle different types of code review through the `review_model_overrides` input. This allows you to use faster, cheaper models for simple checks while reserving more powerful models for complex security analysis.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #142 | [#160](https://github.com/awinogradov/code-assistants/pull/160) | @awinogradov |
| #159 | [#160](https://github.com/awinogradov/code-assistants/pull/160) | @awinogradov |
| #144 | [#158](https://github.com/awinogradov/code-assistants/pull/158) | @awinogradov |
| #149 | [#158](https://github.com/awinogradov/code-assistants/pull/158) | @awinogradov |
| #148 | [#157](https://github.com/awinogradov/code-assistants/pull/157) | @awinogradov |
| #147 | [#154](https://github.com/awinogradov/code-assistants/pull/154) | @awinogradov |
| #143 | [#150](https://github.com/awinogradov/code-assistants/pull/150) | @awinogradov |

### Features

* **code-review:** add security agent and model overrides ([31282af](https://github.com/awinogradov/code-assistants/commit/31282af6f3f9a9b5d5dad3bffca00421617bffb8))
* **code-review:** log per-run phase timings, tokens, and round-trips ([d28a2ce](https://github.com/awinogradov/code-assistants/commit/d28a2ce2f36f3d5e426489d27a124b3e9a32818f))

### Bug Fixes

* **code-review:** count tool round-trips by turn, not by block ([36a9cd0](https://github.com/awinogradov/code-assistants/commit/36a9cd0454de8257765d7da799d083d1971de43a))
* **code-review:** gate verdict re-eval and harden review submission ([79cafc6](https://github.com/awinogradov/code-assistants/commit/79cafc62919ad63dfdd36aa58456eb7899866121))
* **code-review:** inject logger so override warning fires ([c0150bc](https://github.com/awinogradov/code-assistants/commit/c0150bc8efbf35fee41053192222573e24f81d54))

### Performance

* **code-review:** resolve rule links in code, not in the model ([8adb856](https://github.com/awinogradov/code-assistants/commit/8adb8561b2675624b0c6c1641d37f85e38e38858))

### Refactoring

* **code-review:** extract review-output module for tests ([2987044](https://github.com/awinogradov/code-assistants/commit/2987044aac4b5bddd7acf0c3c9782699518fb665))
* **code-review:** validate output with zod and reuse helpers ([a4f5f94](https://github.com/awinogradov/code-assistants/commit/a4f5f942442bb38e40f237861f24c64717c866ef))
## [0.2.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v0.1.0...code-review-action@v0.2.0) (2026-05-29)

## Release Notes

The code review action now handles rapid-fire PR comments and stops replying unnecessarily to acknowledgements.

## ✨ What's New

### Automatic release PR merging
Approved release PRs with passing CI checks now merge automatically, eliminating the manual merge step before publication. The release pipeline workflows (create, publish, and auto-merge) synchronize together to downstream repositories, streamlining your entire release process.

<details><summary>Related issues</summary>

- [#107: Add release-automerge composite action with downstream sync workflow](https://github.com/awinogradov/code-assistants/issues/107)
</details>

### Smarter acknowledgement handling
The AI reviewer recognizes when you're just acknowledging its feedback (like "Fixed —") and reacts with a 👍 instead of generating a new reply. It still responds to questions and explicit re-review requests, reducing notification noise while keeping the conversation flow natural.

<details><summary>Related issues</summary>

- [#111: Code review react mode replies to every review-thread acknowledgement](https://github.com/awinogradov/code-assistants/issues/111)
</details>

## 🐛 Bug Fixes

### Concurrent comment handling
The code review bot no longer misses @-mentions when multiple PR comments arrive at the same time. Each comment now gets its own processing queue, ensuring every mention gets a response regardless of timing.

<details><summary>Related issues</summary>

- [#71: Code review action drops bot mentions when comments arrive in quick succession](https://github.com/awinogradov/code-assistants/issues/71)
</details>

### Release PR approval flow
Release PRs now properly trigger auto-approval by using different identities for the PR author and reviewer. Previously, release PRs were stuck because GitHub prevents users from approving their own PRs — the bot was trying to approve PRs it created itself.

## ⚙️ Configuration Required

### Release PR author identity
Your release workflow must use a different token for creating release PRs than the one used for code review. Update your `release-create.yml` workflow to use a personal access token (like `secrets.GH_TOKEN`) instead of `secrets.BOT_TOKEN` to ensure the reviewer bot can approve the PR.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #111 | [#113](https://github.com/awinogradov/code-assistants/pull/113) | @awinogradov |
| #107 | [#110](https://github.com/awinogradov/code-assistants/pull/110) | @awinogradov |
| #71 | [#105](https://github.com/awinogradov/code-assistants/pull/105) | @awinogradov |

### Features

* **release-automerge:** add release auto-merge action and workflow ([1863ee9](https://github.com/awinogradov/code-assistants/commit/1863ee92945dcbe381b4ccd12ce51d6b4748eceb))

### Bug Fixes

* **code-review-action:** require a positive token to skip ack replies ([930479a](https://github.com/awinogradov/code-assistants/commit/930479a15604294c9532285cb8123509d9528fa2))
* **code-review-action:** skip react reply for author acknowledgements ([ea88093](https://github.com/awinogradov/code-assistants/commit/ea8809340f3273c43067074fed43ec2da2dc6b54))
* **code-review:** scope concurrency group per comment id ([05ab7f8](https://github.com/awinogradov/code-assistants/commit/05ab7f83cc68a37f89492014e84f38fae79bd57b))
* **release:** author release prs with a distinct identity ([fc6b266](https://github.com/awinogradov/code-assistants/commit/fc6b266a2d926a13876778be2ea848f9ec349382))

### Documentation

* **release:** document distinct release-pr author identity ([eb99546](https://github.com/awinogradov/code-assistants/commit/eb995467a7fad1f4408c6cbf8736e8a4e8d2097c))

### Refactoring

* **checks:** extract shared check-status poll loop ([8987c37](https://github.com/awinogradov/code-assistants/commit/8987c379894c8ddf5a77e1fae0d495fd17341b92))
## 0.1.0 (2026-05-28)

## Release Notes

## 0.1.0

Initial release of the GitHub Action for AI-powered code reviews using Claude Code.

## ✨ What's New

### AI Code Review for Pull Requests
Teams can now add automated AI code reviews to their PRs with a single GitHub Action. The bot analyzes code changes and submits structured reviews with approve/request changes/comment verdicts, including inline findings when relevant. Simply add the reviewer as a PR reviewer or @mention them in a comment to trigger a review.

### Interactive PR Conversations
The bot responds to questions and feedback on pull requests, creating a conversational review experience. When mentioned in PR comments, it drafts contextual replies, can resolve conversation threads, and updates its existing review based on the discussion.

### Smart Auto-Approve for Release PRs
Release pull requests from authorized bot accounts are automatically approved to streamline your deployment pipeline. This prevents release automation from getting blocked waiting for manual approvals while maintaining security by checking PR authorship.

### Project Context Detection
The action automatically detects your project's technology stack and context through `agents.rules` files, ensuring reviews are tailored to your specific codebase and conventions.

## ⚙️ Configuration Required

### Required Secrets
Set up these GitHub secrets in your repository:
- `BOT_TOKEN`: GitHub token for the bot account (needs `contents: read` and `pull-requests: write` permissions)
- `ANTHROPIC_API_KEY` or `CLAUDE_OAUTH_TOKEN`: Authentication for Claude Code API

### Required Variables
- `BOT_USERNAME`: GitHub username of your review bot (used for reviewer assignment and mention detection)

### Workflow Configuration
Add the provided workflow file to `.github/workflows/ai-review.yml` to enable:
- Automatic reviews on new PRs and updates
- Interactive responses to PR comments
- Proper concurrency handling to prevent duplicate reviews


### Features

* **code-review-action:** add composite action for ai pr review ([c83e2d6](https://github.com/awinogradov/code-assistants/commit/c83e2d66a18e12afca4e8247ac7eab12fef169af))

### Bug Fixes

* **code-review-action:** detect stack via agents.rules ([8893136](https://github.com/awinogradov/code-assistants/commit/8893136104370ddc85382e57ec4693073105c444))
* **code-review-action:** read version from package.json ([93feb72](https://github.com/awinogradov/code-assistants/commit/93feb72a418eb882318418fcdf13c5d208d95cb0))
* **code-review-action:** resolve claude binary in bun .bun cache ([17f36b4](https://github.com/awinogradov/code-assistants/commit/17f36b4ffeec6e215e0935b62dca3eb2f84b1645))
* **code-review:** auto-approve release prs on skip ([73d62fb](https://github.com/awinogradov/code-assistants/commit/73d62fb02a9e486d2f4aa6f0fbfb29b1ced0e505))
* **code-review:** escalate approve failure to error ([5f5d4f6](https://github.com/awinogradov/code-assistants/commit/5f5d4f6c89c0cdfae3f1347821a602408807de37))
* **code-review:** gate release approve by author ([f41b35f](https://github.com/awinogradov/code-assistants/commit/f41b35fa3a3fa39e64e2abaad223abdf9607f9b9))
* **code-review:** match release authors literally ([162af36](https://github.com/awinogradov/code-assistants/commit/162af36f01b4bbeb62a8a61156398f9814f5e715))
* **pr-review:** align fan-out on autopilot prefix ([8e36b8b](https://github.com/awinogradov/code-assistants/commit/8e36b8be95e3312f7feda730d8bcd94b49429d81))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
