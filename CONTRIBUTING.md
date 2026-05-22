<!--
Source: https://github.com/awinogradov/code-assistants/blob/main/CONTRIBUTING.md
This file is distributed to downstream repositories by an automated sync.
Edits made downstream are overwritten on the next run.
To change it, open a pull request against the source file above.
-->

# Contributing

Thank you for your interest in contributing! This guide will help you get started.

**Audience:** These guidelines apply to all contributors—human developers and AI coding assistants alike.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Quick Start](#quick-start)
- [How to Contribute](#how-to-contribute)
- [Git Workflow](#git-workflow)
- [PR Guidelines](#pr-guidelines)
- [Code Standards](#code-standards)
- [Getting Help](#getting-help)

## Code of Conduct

All contributors must adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before contributing.

## Quick Start

💡 If you are using Claude as code assistant, please use the `autopilot` plugin to get the best experience. It contains all the tools and knowledge to help you follow the standards and guidelines. Read original plugin documentation [here](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/README.md).

### Prerequisites

| Stack          | Requirements                                                     |
| -------------- | ---------------------------------------------------------------- |
| **TypeScript** | [Bun](https://bun.sh/) 1.x, [NodeJS](https://nodejs.org/) 22 LTS |

Use [README.md](./README.md) for development setup instructions.

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/awinogradov/code-assistants/issues).
2. [Open a new issue](https://github.com/awinogradov/code-assistants/issues/new?labels=bug) with:
   - Label: `bug`
   - Meaningful title
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details

### Suggesting Features

1. Start a [GitHub Discussion](https://github.com/awinogradov/code-assistants/discussions) for open-ended ideas, or [open an issue](https://github.com/awinogradov/code-assistants/issues/new?labels=feature) with the `feature` label for a concrete proposal.
2. Describe the use case and proposed solution.
3. Wait for feedback before starting implementation.

### Submitting Code

1. Create a branch from `main` following the [branch naming convention](#branches).
2. Make your changes following [code standards](#code-standards).
3. Write tests for new functionality.
4. Submit a PR following the [PR guidelines](#pr-guidelines).

## Git Workflow

Branch naming, commit messages, and PR titles are consistent across the repository so that automation can link changes to issues, generate changelogs, and keep history readable for humans and AI.

### Branches

Branch names link a GitHub PR to its issue automatically via the PR description (see [Magic Words](#magic-words)).

**Format:**

```
issue-<number>-<short-description>
```

**Rules:**

- `number` is the GitHub issue number (no `#`)
- `short-description` is required, lowercase, hyphens only (no underscores)
- Aim for under 60 characters (hard limit: 100)

**Examples:**

- ✅ `issue-123-add-password-reset`
- ✅ `issue-123-update-dto`
- ✅ `issue-45-fix-editor-crash`
- ✅ `issue-789-update-proto`
- ❌ `add-user-auth`
- ❌ `issue_123_add_auth`
- ❌ `wip`

**Special Prefix Branches:**

Some changes don't require an issue (see [Special PR Prefixes](#special-pr-prefixes)). Use the prefix as the branch identifier:

```
<prefix>-<short-description>
```

- `prefix` must be lowercase: `hotfix`, `trivial`, `maintenance`, or `proposal`
- Same rules apply: lowercase, hyphens only, aim for under 60 characters (hard limit: 100)

**Examples:**

- ✅ `hotfix-memory-leak-editor`
- ✅ `trivial-fix-typo-readme`
- ✅ `maintenance-upgrade-node-22`
- ✅ `proposal-add-vim-keybindings`

⚠️ Enforced locally by the `pre-push` git hook and in CI by [`deepakputhraya/action-branch-name`](https://github.com/deepakputhraya/action-branch-name). Invalid branch names block PR merge.

> TIP: Use the `/autopilot:branch-create` slash command to generate a branch name.

**Release Branches:**

Automated release workflows create branches that don't follow the standard `issue-<number>-<short-description>` format:

```
release-<version>
```

- `version` is a SemVer number (e.g., `1.2.0`, `22.0.0`) — no `v` prefix
- No short description required

**Examples:**

- ✅ `release-1.2.0`
- ✅ `release-10.0.1`
- ❌ `release-v1.2.0` — no `v` prefix
- ❌ `release` — missing version

⚠️ Release branches are created automatically by release workflows. Do not create them manually.

### Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/). Motivation behind this:

- It makes it easier to generate changelog and release notes
- It helps to understand the changes and context faster
- It helps to focus on important details
- It helps to avoid unnecessary discussions
- It helps to respect codeowners and reviewers time
- It helps to keep the commit history clear and readable by humans and AI
- It helps to speed up the review process
- It helps to investigate bugs in important changes, not in docs, tests, etc.

**Format:**

```
<type>(<scope>): <subject>

[body — required for feat/fix/refactor]

[optional footer(s)]
```

**Rules:**

- **Type**: Required. One of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **Scope**: Optional. Component or module name
- **Subject**: Required. Lowercase, imperative mood, no period. Must describe WHAT changed (the technical modification), not WHY (the motivation). Bad: "close coverage gaps". Good: "add null-check to auth handler"
- **Header length**: Total line (`type(scope): subject`) must not exceed 72 characters
- **Issue numbers**: Do NOT include in commit messages (the PR description links the issue via [Magic Words](#magic-words))
- **PR References**: Do NOT reference PRs, review comments, or feedback in commit messages. Commits must be self-contained and understandable without viewing any PR
- **AI Co-authorship**: Do NOT include AI agent `Co-authored-by` trailers (e.g., Claude, ChatGPT, Copilot, Codex). Disable co-authorship in your AI tool settings.

**Commit Types:**

| Type       | Description                             |
| ---------- | --------------------------------------- |
| `feat`     | New feature                             |
| `fix`      | Bug fix                                 |
| `docs`     | Documentation only                      |
| `style`    | Code style (formatting, semicolons)     |
| `refactor` | Code change that neither fixes nor adds |
| `perf`     | Performance improvement                 |
| `test`     | Adding or updating tests                |
| `build`    | Build system or dependencies            |
| `ci`       | CI/CD configuration                     |
| `chore`    | Maintenance tasks                       |
| `revert`   | Reverting a previous commit             |

**Examples:**

✅ Commit with body (required for feat/fix/refactor):

```
feat(auth): add jwt token refresh endpoint

- Added /auth/refresh endpoint for issuing new access tokens
- Added 7-day expiry validation for refresh tokens
```

✅ Commits where body may be omitted:

```
docs: add environment variables reference to readme
test(auth): add jwt refresh token expiry edge cases
chore(deps): upgrade zod from 3.21 to 3.23
```

✅ Commit message with description and breaking change footer:

```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.
```

❌ Bad commits examples:

```
#123: Add feature
Added new endpoint
fix: review updates
fix: resolve issue
feat: add new feature
refactor: address PR #107 review comments
docs(editor): update based on PR feedback
fix: changes requested in code review
wip
btw
```

❌ WHY-focused commits (state motivation instead of technical change):

```
fix: close coverage gaps
fix: address review feedback
refactor: ensure compliance with rules
feat: improve error handling
fix: cover edge cases in validation
```

✅ The WHAT-focused equivalents:

```
fix(auth): add null-check and token expiry validation
fix(parser): replace bcrypt with argon2 in hashPassword
refactor(lint): change nesting depth threshold from 5 to 2
feat(api): add retry with exponential backoff to fetchUser
fix(validator): handle null and empty-string inputs
```

⚠️ Enforced locally by [`commitlint`](./commitlint.config.mjs) on the `commit-msg` hook and in CI by [`wagoid/commitlint-github-action`](https://github.com/wagoid/commitlint-github-action). Invalid commits block PR merge.

#### Atomic Commits

When your changes span multiple categories (docs, tests, implementation), consider splitting them into separate commits. This practice improves:

- **Reverting**: Cleanly undo specific changes without affecting unrelated code
- **Code Review**: Smaller focused commits are easier to review
- **Git Bisect**: Pinpoint exactly which commit introduced a bug
- **Changelog**: Each commit type appears in the right changelog section

**Commit ordering principle:** Every commit in a PR must leave the branch in a stable state — CI passes, lint rules are satisfied, tests pass for the code present at that point. Undocumented or untested code is acceptable; broken CI/lint is not.

**Default commit order:**

1. `ci` — CI/CD pipeline changes (establish the rules first)
2. `chore`/`build` — Configuration and dependencies
3. `feat`/`fix`/`refactor` — Main implementation
4. `test` — Tests verify implementation
5. `docs` — Documentation (informational, never breaks stability)

This is the default for the common case. Deviate when specific changes require a different order to maintain stability at every checkout.

**Example:** If you add a feature with tests and docs, create 3 commits:

```
feat(auth): implement jwt validation
test(auth): add jwt validation tests
docs(auth): add jwt validation documentation
```

> TIP: Use the `/autopilot:commits-create` slash command to generate commit messages.

## PR Guidelines

**Why these rules are important:**

- They help to associate all changes related to the same issue across the project
- They help to generate changelog and release notes
- They help to understand the changes and context faster
- They help to avoid unnecessary discussions

### PR Title

**Format:**

```
<Business-valuable description>
```

**Rules:**

- Required, capitalized, business-focused, no period
- Under 120 characters total
- Do NOT include the issue number in the title — link it from the PR body via [Magic Words](#magic-words)
- NOT Conventional Commits format — that's the default for single-commit PRs, but reviewers and codeowners read the title first; keep it business-readable

**PR title should be understandable:**

- From just that single line
- By someone on their first day with the project
- By someone outside the project
- When reviewed a year from now
- Without needing to read the code changes

**Avoid:**

- Implementation details (use PR body for those)
- Technical jargon without context
- Vague descriptions

**Examples:**

- ✅ `Allow editor theme selection per workspace`
- ❌ `feat(editor): add theme routing`
- ❌ `Added theme options`

⚠️ Enforced in CI by [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request), configured to allow the special prefixes below. Invalid PR titles block PR merge.

### Special PR Prefixes

Some changes don't fit the standard business-description format — they are either urgent, too small for an issue, purely infrastructural, or an out-of-the-blue suggestion. Special prefixes bypass PR title and description validation while keeping the history readable.

| Prefix         | When to use                                                                  | Example                               |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `HOTFIX:`      | Emergency production fixes                                                   | `HOTFIX: Memory leak in editor`       |
| `TRIVIAL:`     | Changes not affecting production or CI/CD: typos, docs, comments, formatting | `TRIVIAL: Fix typo in README`         |
| `MAINTENANCE:` | Infrastructure updates: deps, CI, configs                                    | `MAINTENANCE: Upgrade Node to 22 LTS` |
| `PROPOSAL:`    | Suggest a change without filing an issue first; discussion happens on the PR | `PROPOSAL: Add Vim keybindings`       |

**Rules:**

- Prefix must be uppercase, followed by a colon and a space
- Description after the prefix follows the same rules as a standard PR title (capitalized, no period, under 120 chars total)
- Use sparingly — most PRs should reference an issue

### Release PR Titles

Release PRs are created by maintainers; contributors don't open them.

**Format:**

```
Release [<name>] <version>
```

**Rules:**

- `Release` keyword is required, capitalized
- `name` is the package name (optional for single-package repos, required for monorepos)
- `version` is a SemVer number — no `v` prefix

**Examples:**

- ✅ `Release 1.2.0`
- ✅ `Release Symbiot Editor 1.2.0`
- ✅ `Release 22.0.0`
- ❌ `Release v1.2.0` — no `v` prefix
- ❌ `release 1.2.0` — must be capitalized

### PR Description

**Include in PR description:**

- Brief description of what and why
- Bullet list for important details
- Release notes section (optional — for user-facing changes)
- Magic words to link issues (see [Magic Words](#magic-words))

**Example (without release notes):**

```markdown
Users can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.

- Added `editor_theme` per-workspace setting
- Falls back to the system theme if no preference is set

---

**Issues:**

Closes #123
```

**Example (with release notes):**

```markdown
Users can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.

- Added `editor_theme` per-workspace setting
- Falls back to the system theme if no preference is set

---

**Release notes:**

- Added per-workspace editor theme selection

---

**Issues:**

Closes #123
```

> **Format note:** The release notes heading in PR bodies must be `**Release notes:**` (bold, lowercase "notes", colon). Do not use `## Release Notes` — that format is for `.release_notes/*.md` files used in GitHub Releases.

#### Magic Words

Magic words link issues to the PR. Use them in the PR **description** (not the title, not comments). See the [GitHub docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue#linking-a-pull-request-to-an-issue-using-a-keyword) for the full behavior.

| Keyword      | Behavior                                | Example           |
| ------------ | --------------------------------------- | ----------------- |
| `Closes`     | Links, closes the issue on merge        | `Closes #123`     |
| `Fixes`      | Links, closes the issue on merge        | `Fixes #123`      |
| `Resolves`   | Links, closes the issue on merge        | `Resolves #123`   |
| `Part of`    | Plain reference (auto-linked, no close) | `Part of #789`    |
| `Related to` | Plain reference (auto-linked, no close) | `Related to #456` |

**Multiple issues:**

```markdown
**Issues:**

Closes #123
Closes #124
Part of #100
```

> TIP: Use the `/autopilot:pr-create` slash command to generate a PR title and description.

### Working with Draft PRs

If you need to work on a PR but it's not ready for human review, mark it as a draft. Why draft PRs are important:

- Draft PRs do not start the review process automatically
- Draft PRs don't enforce validation rules
- They let you experiment with changes before review
- They let you structure commits and the PR before review

⚠️ Mark the PR as ready for review only after all changes are complete and the PR is valid and fully tested.

### Merging Strategies

We use the following merging strategies:

- **Rebase**: When the branch is up to date with the base branch

Only one strategy is used per repository. Reasons:

- Avoid confusion and complexity in the review process
- Consistency in commit history and PR structure
- Predictable and stable release process
- Predictable changelog and release notes

💡 The available strategy is shown in the GitHub UI on the merge button dropdown.

### PR Checklist

**Before submitting:**

- [ ] Branch name starts with `issue-<number>-` or one of the special prefixes (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`)
- [ ] PR title is a business-valuable description (no `#<n>:` prefix) or uses a recognized special prefix
- [ ] PR description links the issue via `Closes #<n>` / `Fixes #<n>` / `Resolves #<n>` (when applicable)
- [ ] All commits follow Conventional Commits format
- [ ] No commits contain issue numbers in messages
- [ ] No commits contain AI agent `Co-authored-by` trailers
- [ ] Tests pass locally
- [ ] If release notes included, uses `**Release notes:**` format (not `## Release Notes`)
- [ ] Code follows standards

### Good PR examples

**Title:** `Allow editor theme selection per workspace`

```
Users can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.

- Added `editor_theme` per-workspace setting
- Falls back to the system theme if no preference is set

---

**Issues:**

Closes #123
```

**Title:** `Fix load balancing in plan-fetch requests`

```
Plan-fetch requests were all hitting the same worker due to a missing client option. This caused uneven load distribution and occasional timeouts.

---

**Issues:**

Closes #245
```

**Title:** `Add annotation events for playback duration reporting`

```
The viewer needs to report how much of a plan was actually read before the user resolved it. This data is required for accurate review analytics.

- AnnotationOpenedEvent
- AnnotationResolvedEvent

---

**Issues:**

Closes #312
```

**Title:** `Refactor annotation codec for streaming support`

```
Part of the wire-format migration. Annotation codec is now streaming-capable.

- No functional changes
- All existing tests pass

---

**Issues:**

Part of #300
Closes #305
```

**Title:** `Remove legacy plan-import endpoints`

```
Removed deprecated v1 plan-import endpoints. All consumers must migrate to v2.

- Removed `/api/v1/plans/*` routes
- Updated API documentation

---

**Release notes:**

- BREAKING: Removed legacy plan-import v1 endpoints — migrate to /api/v2

---

**Issues:**

Closes #400
```

## Code Standards

See [`CLAUDE.md`](./CLAUDE.md) for the full coding-standards matrix, and the Documentation section of [`README.md`](./README.md) for project-specific docs.

## Getting Help

- **Questions** — open a [GitHub Discussion](https://github.com/awinogradov/code-assistants/discussions)
- **Bugs / feature requests** — open a [GitHub Issue](https://github.com/awinogradov/code-assistants/issues)
- **Code of Conduct issues** — see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

## FAQ

### Why do we use Conventional Commits with Squash merging strategy?

We use AI agents to generate changelogs and release notes. When you squash-merge a PR, the commit messages are saved in the squashed commit message. That means anyone can easily understand the changes and context of the PR by reading the squashed commit message.

### What if someone bypasses commit-message validation and merges a PR with an invalid commit message?

Only maintainers can bypass PR checks. In general, and ideally, that commit will be reverted by codeowners.
