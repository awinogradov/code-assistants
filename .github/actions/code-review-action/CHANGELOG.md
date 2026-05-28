# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## 0.1.0 (2026-05-28)

## Release Notes

AI-powered code review is now available as a GitHub Action, automatically analyzing pull requests and responding to developer questions in PR comments.

## ✨ What's New

### AI-powered code review for GitHub pull requests
This composite GitHub Action integrates Claude Code to automatically review pull requests when they're opened or updated. Teams can now get consistent code reviews that catch issues, suggest improvements, and provide structured feedback (approve/request changes/comment) with inline findings. The action intelligently skips drafts, release branches, and dependabot PRs to avoid noise.

### Interactive PR discussions with AI
Developers can now mention the reviewer bot in PR comments to ask questions or request clarification about the code. The action automatically drafts contextual replies, resolves discussion threads when appropriate, and can update its existing review based on the conversation. This creates a more collaborative review experience where the AI assistant actively participates in code discussions.

### Smart event routing
The action automatically detects whether it's responding to a new PR (review mode) or a comment mention (react mode) without requiring manual configuration. It handles `pull_request`, `issue_comment`, and `pull_request_review_comment` events seamlessly, routing each to the appropriate review or response behavior.

## 🐛 Bug Fixes

### Technology stack detection
The action now correctly identifies project technology stacks by reading `agents.rules` files, ensuring reviews use appropriate language-specific best practices and conventions.

### Version detection from package.json
Version information is now properly extracted from `package.json` files, fixing an issue where version-dependent features weren't working correctly.

### Claude binary resolution in Bun cache
The action now reliably locates the Claude CLI binary within Bun's `.bun` cache directory, resolving execution failures on certain runner configurations.

### Consistent autopilot command prefix
All autopilot skills now use the standardized `/autopilot:` prefix, fixing command recognition issues that prevented some review features from activating.

## ⚙️ Configuration Required

### Bot credentials
You'll need to provide a GitHub token with `contents: read` and `pull-requests: write` permissions for the bot user, along with either an Anthropic API key or Claude OAuth token for AI capabilities.

### Concurrency group configuration
Add the recommended concurrency configuration to prevent multiple reviews from running simultaneously on the same PR, which could cause conflicting feedback or duplicate comments.


### Features

* **code-review-action:** add composite action for ai pr review ([c83e2d6](https://github.com/awinogradov/code-assistants/commit/c83e2d66a18e12afca4e8247ac7eab12fef169af))

### Bug Fixes

* **code-review-action:** detect stack via agents.rules ([8893136](https://github.com/awinogradov/code-assistants/commit/8893136104370ddc85382e57ec4693073105c444))
* **code-review-action:** read version from package.json ([93feb72](https://github.com/awinogradov/code-assistants/commit/93feb72a418eb882318418fcdf13c5d208d95cb0))
* **code-review-action:** resolve claude binary in bun .bun cache ([17f36b4](https://github.com/awinogradov/code-assistants/commit/17f36b4ffeec6e215e0935b62dca3eb2f84b1645))
* **pr-review:** align fan-out on autopilot prefix ([8e36b8b](https://github.com/awinogradov/code-assistants/commit/8e36b8be95e3312f7feda730d8bcd94b49429d81))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
