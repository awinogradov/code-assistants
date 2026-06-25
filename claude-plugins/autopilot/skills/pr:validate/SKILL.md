---
name: pr:validate
description: Validate a PR title and branch name against repository contributing guidelines
argument-hint: 'PR_TITLE: "<title>" BRANCH_NAME: "<branch>" PR_AUTHOR: "<author-login>"'
allowed-tools:
  - Bash(gh *)
---

## Input

Arguments: `$ARGUMENTS`

Expected form (typically supplied by `awinogradov/code-review-action`):

- `PR_TITLE: "<title>" BRANCH_NAME: "<branch>" PR_AUTHOR: "<author-login>"`

## Input resolution

- **`PR_TITLE`** — `$ARGUMENTS` → `gh pr view --json title --jq .title` as a fallback when invoked interactively.
- **`BRANCH_NAME`** — `$ARGUMENTS` → `gh pr view --json headRefName --jq .headRefName` → `git branch --show-current` as a last resort. Empty is allowed for bot PRs (skip branch validation).
- **`PR_AUTHOR`** — `$ARGUMENTS` → `gh pr view --json author --jq .author.login`.

Do NOT prompt the user. If all fallbacks fail, return a structured validation error in the output JSON.

## Task

$ARGUMENTS

---

## Rules

You are validating the PR title and branch name provided above. Apply the following rules exactly. These rules are the canonical encoding of `CONTRIBUTING.md` — do not invent alternatives.

### Standard PR Title Format

```
<Business-valuable description>
```

**Standard title rules:**

1. Title is a business-readable description only. The GitHub issue number MUST NOT appear in the title — it is linked from the PR description via magic words.
2. Must start with an uppercase letter
3. Must be business-focused and understandable without reading the code
4. No period at the end
5. Total length must be under 120 characters
6. Must NOT use Conventional Commits format (e.g., `feat(scope): ...` is invalid as a PR title)

### Special Prefixes (bypass standard validation)

These prefixes are valid alternatives to a plain business description:

- `HOTFIX:` — Emergency production fixes
- `TRIVIAL:` — Changes not affecting production: typos, docs, comments, formatting
- `MAINTENANCE:` — Infrastructure updates: deps, CI, configs
- `PROPOSAL:` — Suggest a change without filing an issue first; discussion happens on the PR
- `SECURITY:` — Fixes for GitHub code-scanning alerts (alerts close on re-scan, not via PR magic words; no `Closes #`)

Special prefix rules:

- Prefix must be fully uppercase, followed by a colon and a space
- Description after the prefix follows the same rules (capitalized, no period, under 120 chars total)

### Release PR Titles (bypass standard validation)

Release PRs are created automatically by release workflows.

```
Release [<name>] <version>
```

Release title rules:

- `Release` keyword is required, capitalized exactly as shown
- `name` is the package or service name (optional for single-package repos, required for monorepos)
- `version` is a SemVer number (e.g., `1.2.0`, `22.0.0`) — no `v` prefix
- No colon after `Release`

### Branch Name Format

If BRANCH_NAME is provided and not empty, validate it against one of these formats:

**Standard format:**

```
issue-<number>-<short-description>
```

- `issue-` is the literal lowercase keyword
- `number` is the GitHub issue number (digits only, no `#`)
- `short-description` is required, lowercase, hyphens only (no underscores)
- Aim for under 60 characters; must be under 100

**Special prefix format:**

```
<prefix>-<short-description>
```

- `prefix` must be one of: `hotfix`, `trivial`, `maintenance`, `proposal`, `security` (all lowercase)
- `short-description` is required, lowercase, hyphens only (no underscores)
- Aim for under 60 characters; must be under 100

**Release branch format:**

```
release-<version>
```

- `version` is a SemVer number (e.g., `1.2.0`, `22.0.0`) — no `v` prefix
- No short description required
- Created automatically by release workflows

**Valid branch examples:**

- `issue-123-add-password-reset`
- `issue-123-update-dto`
- `issue-45-fix-editor-crash`
- `issue-789-update-proto`
- `hotfix-memory-leak-editor`
- `trivial-fix-typo-readme`
- `maintenance-upgrade-node-22`
- `proposal-add-vim-keybindings`
- `security-tainted-format-string`
- `release-1.2.0`

**Invalid branch examples:**

- `add-user-auth` — missing `issue-<number>` prefix or special prefix
- `issue_123_add_auth` — underscores not allowed
- `repo-123-add-auth` — only literal `issue-` prefix is allowed
- `wip` — no issue ref, no description
- `ISSUE-123-add-auth` — must be lowercase
- `release-v1.2.0` — no `v` prefix

If BRANCH_NAME is empty, skip branch name validation entirely (Dependabot and similar bots cannot follow branch naming conventions).

### Avoid

- Implementation details (those belong in PR body)
- Technical jargon without context
- Vague descriptions
- Including the issue number in the title (link via magic words in the body instead)

### Valid PR Title Examples

- `Allow editor theme selection per workspace`
- `Add annotation events for playback duration reporting`
- `Refactor annotation codec for streaming support`
- `Remove legacy plan-import endpoints`
- `HOTFIX: Memory leak in editor`
- `TRIVIAL: Fix typo in README`
- `MAINTENANCE: Upgrade Node to 22 LTS`
- `PROPOSAL: Add Vim keybindings`
- `SECURITY: Sanitize tainted format string in runClaude`
- `Release 1.2.0`
- `Release Symbiot Editor 1.2.0`

### Invalid PR Title Examples

- `feat(editor): add theme routing` — Conventional Commits format, not PR title format
- `#123: Add feature` — Issue numbers must NOT appear in the title
- `123: Add feature` — Same; link the issue via `Closes #123` in the body
- `Added theme options` — Vague, past tense, missing business value
- `Allow editor theme selection per workspace.` — Trailing period not allowed
- `chore: bump deps` — Conventional Commits format
- `release 1.2.0` — `Release` must be capitalized
- `Release v1.2.0` — no `v` prefix in version

---

## GitHub Issue Verification

For standard branch names (skip for HOTFIX/TRIVIAL/MAINTENANCE/PROPOSAL/SECURITY prefixes and Release branches), perform these additional checks:

1. **Extract the issue number** from the branch name (e.g., `123` from `issue-123-add-password-reset`).

2. **Check issue existence**:

   ```bash
   gh issue view <NUMBER> --json title,body,state
   ```

   If not found, mark invalid with reason: "GitHub issue #<NUMBER> referenced by branch does not exist"

3. **Validate relevance**: Compare the PR title against the issue title and body. The title must be meaningfully related to the issue — it should capture the essence of what's being done. Non-meaningful or generic titles that don't relate to the issue content are invalid.

If the `gh` call fails (auth/network), skip this section and validate format only.

---

## Comment Generation

When the PR is **invalid**, generate a full GitHub PR comment in the `comment` field. Be sarcastic and use emojis generously. Address the PR author by @-mentioning PR_AUTHOR. Explain what went wrong, show how to fix it, and link to the [contributing guidelines](<repo-blob-url>/CONTRIBUTING.md). When the PR is **valid**, set `comment` to an empty string.

---

## Output

Return structured JSON output with exactly these fields:

- `titleValid` (boolean): Whether the PR title passes all title rules
- `branchValid` (boolean): Whether the branch name passes all branch rules (always true when BRANCH_NAME is empty)
- `reason` (string): If any check failed, a brief technical summary of what failed. If all valid, an empty string.
- `comment` (string): If any check failed, the full GitHub PR comment body (markdown) as described in Comment Generation. If all valid, an empty string.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
