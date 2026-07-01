---
name: commits:restructure
description: Restructure messy draft commits into proper conventional commits
argument-hint: "[--base <branch>]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Read
  - AskUserQuestion
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-update)
---

Restructure messy draft commits (wip, fix, btw, etc.) into properly structured conventional commits following repository conventions.

## Input

Arguments: `$ARGUMENTS`

Expected flag (optional):

- `--base <branch>` — base branch to compare against. Default: `main`.

## Input resolution

- **`--base`** — `$ARGUMENTS` → detect the repo's default branch from `git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null` (returns `origin/main` or `origin/master`) → fall back to `main`. Do NOT prompt.
- **Repository conventions** — read `CONTRIBUTING.md` directly.
- **Current branch / remote tracking / existing PR** — detected via git and `gh pr view`. No prompts.

## Phase 1: Parse Arguments

Parse the argument string:

| Argument | Required | Default | Description                    |
| -------- | -------- | ------- | ------------------------------ |
| --base   | No       | main    | Base branch to compare against |

## Phase 2: Read Repository Conventions

1. Check if `CONTRIBUTING.md` exists in the repository root
2. If exists, read it to understand commit message conventions
3. Adapt to repository-specific rules

## Phase 3: Analyze Branch Commits

1. Run `git log <base>..HEAD --oneline` to get commits since base branch
2. If no commits found, abort with message: "No commits to restructure. Current branch is up to date with <base>."
3. Display the commits that will be restructured
4. Get the current branch name: `git branch --show-current`
5. If the branch name is empty (detached HEAD), store `remoteBranchExists = false` and skip step 6
6. Check if the branch exists on the remote: `git ls-remote --heads origin <branch>`. If the command returns output, store `remoteBranchExists = true`. If no output, store `remoteBranchExists = false`.
7. Verify the working tree is clean before restructuring: `git status --porcelain`. The soft reset in [Phase 5](#phase-5-soft-reset) restages the whole `<base>..HEAD` diff and [Phase 6](#phase-6-invoke-commitscreate) re-commits it, so any pre-existing uncommitted change would be mixed into the restructured commits. If the output is non-empty, abort: "You have uncommitted changes that would be mixed into the restructured commits. Commit or stash them first, then re-run."

## Phase 4: Confirm Reset

Use **AskUserQuestion tool** to confirm.

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in the `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

Present the commits found:

```
Found N commits to restructure:
- abc1234 wip
- def5678 fix
- ghi9012 btw

This will soft reset to <base> and restage all changes.
All changes will be preserved, only commits will be removed.
```

Tool parameters:

- `question`: "Found N commits to restructure. This will soft reset to <base> and restage all changes. All changes will be preserved."
- `header`: "Restructure"
- `options`: [
  { label: "Restructure commits", description: "Soft reset to base and restage changes" },
  { label: "Cancel", description: "Abort without changes" }
  ]
- `multiSelect`: false

- **If "Cancel" selected:** Abort with message "Operation cancelled."
- **If "Restructure commits" selected:** Continue to [Phase 5](#phase-5-soft-reset)

## Phase 5: Soft Reset

Execute soft reset to preserve all changes:

```bash
git reset --soft <base>
```

All changes are now staged.

## Phase 6: Invoke commits:create

Use the **Skill tool** to invoke the commits:create skill:

```
Skill(autopilot:commits-create)
```

This handles:

- Categorizing staged files by conventional commit type (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `style`, `perf`, `revert`)
- Offering grouped vs single commit strategy
- Creating proper conventional commit messages
- User confirmation for each commit

**Commit message rules:** `commits:create` owns and enforces the full set — subject (text after `type(scope): `) ≤ 50 and whole header ≤ 100 (commitlint `subject-max-length` / `header-max-length`), lowercase imperative no-period title, WHAT-not-WHY subject, body required for `feat`/`fix`/`refactor`, no issue/PR numbers, no AI `Co-authored-by` trailers. See [commits:create Rules](../commits:create/SKILL.md#rules); this skill restages the changes and delegates the message creation to it.

## Phase 7: Success Output

After the commits:create skill completes, output summary:

```
✓ Restructured N original commits into M new commits.
```

## Phase 8: Force Push (conditional)

**Only execute this phase if `remoteBranchExists` is true** (detected in [Phase 3](#phase-3-analyze-branch-commits)). If false, skip to [Phase 9](#phase-9-offer-pr-update).

The original commits were on the remote before the soft reset. The new restructured commits have different SHAs, so a regular push will be rejected.

Use **AskUserQuestion tool** to confirm.

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in the `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

Tool parameters:

- `question`: "The original commits were already pushed to the remote. The restructured commits rewrote history, so a force push is required to update the remote branch."
- `header`: "Force push"
- `options`: [
  { label: "Force push", description: "Run git push --force-with-lease to update the remote branch safely" },
  { label: "Skip", description: "Leave the remote branch as-is (you can push manually later)" }
  ]
- `multiSelect`: false

- **If "Force push" selected:** Run `git push --force-with-lease`. If successful, store `forcePushDone = true`. If it fails, output the error and store `forcePushDone = false`.
- **If "Skip" selected:** Store `forcePushDone = false`.

## Phase 9: Offer PR Update

**Only execute this phase if `remoteBranchExists` is false OR `forcePushDone` is true.** If the remote branch exists but force push was skipped or failed, skip this phase silently.

After restructuring completes successfully:

1. Check if a PR exists for the current branch: `gh pr view --json number,url 2>/dev/null`
2. If the command fails (no PR), skip silently — do not show any message
3. If a PR exists, ask using **AskUserQuestion tool**:

   **Formatting Note:** Do not use markdown formatting (bold, italic, headers) in the `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

   Tool parameters:
   - `question`: "A pull request exists for this branch: #<N>. Would you like to update it to reflect the restructured commits?"
   - `header`: "Update PR"
   - `options`: [
     { label: "Update PR", description: "Refresh PR title and description from all commits" },
     { label: "Skip", description: "Keep the PR as-is" }
     ]
   - `multiSelect`: false

   - If "Update PR" selected: invoke `Skill(autopilot:pr-update)`
   - If "Skip" selected: finish normally

## Error Handling

### No commits to restructure

```
No commits to restructure. Current branch is up to date with <base>.
```

### Working directory has uncommitted changes

Before starting, check `git status`. If there are unstaged changes:

```
Warning: You have uncommitted changes. Please commit or stash them first.
```

### Base branch doesn't exist

```
Error: Base branch '<base>' does not exist.
```

### Force push rejected

If `git push --force-with-lease` fails (e.g., remote was updated by someone else):

```
Error: Force push was rejected. The remote branch has been updated since your last fetch.
Run `git fetch origin` and try again.
```

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
