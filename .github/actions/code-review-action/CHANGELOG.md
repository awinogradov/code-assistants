# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

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
