# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

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
