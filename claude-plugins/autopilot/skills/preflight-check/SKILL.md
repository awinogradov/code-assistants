---
name: preflight-check
description: Validate git working state before committing, branching, or opening a PR. Detects wrong branch, stale merged branches, uncommitted changes, and out-of-date main.
user-invocable: false
allowed-tools:
  - Bash(git *)
  - AskUserQuestion
---

Validate the git working environment before proceeding. This skill checks the current branch state, detects stale or merged branches, and — depending on mode — either prepares `main` for a new plan/branch or warns against committing/opening a PR directly on `main`.

## Context

This skill receives the following from conversation history:

- **Mode**: one of `plan`, `branch`, `commits`, `pr`. Defaults to `plan` when not present.
- **Issue ID** (optional): resolved issue identifier (e.g., `#42`). Used only in `plan` mode for branch comparison.

Pick the mode from these hints:

- Invoked from `/autopilot:plan` or `/autopilot:run` → `plan`
- Invoked from `Skill(autopilot:branch-create)` → `branch`
- Invoked from `Skill(autopilot:commits-create)` → `commits`
- Invoked from `Skill(autopilot:pr-create)` → `pr`

The action noun used in prompts below follows the mode:

| Mode      | Action noun     |
| --------- | --------------- |
| `plan`    | planning        |
| `branch`  | branch creation |
| `commits` | commit          |
| `pr`      | pull request    |

## Phase 1: Detect Current Branch

Run:

```bash
git branch --show-current
```

Store the result as `currentBranch`. An empty value means detached HEAD — treat it as not-`main` with no branch issue ID. Continue to [Phase 1.5](#phase-15-detect-git-worktree); the main-vs-feature decision happens there.

## Phase 1.5: Detect Git Worktree

Run both commands in parallel:

```bash
git rev-parse --git-dir
```

```bash
git rev-parse --git-common-dir
```

If the two values differ, the session is running inside a **git worktree**. Store `isWorktree = true`. Otherwise `isWorktree = false`.

- If `currentBranch` is `main` or `master`, go to [Phase 3](#phase-3-on-main).
- Otherwise, go to [Phase 2](#phase-2-on-feature-branch).

## Phase 2: On Feature Branch

### Check working tree (pr mode only)

If mode is `pr`, run:

```bash
git status --porcelain
```

If the output is non-empty, use AskUserQuestion:

Tool parameters:

- `question`: "Uncommitted changes detected on <currentBranch>.\n\nHow would you like to proceed before opening the pull request?"
- `header`: "Uncommitted"
- `options`: [
  { label: "Commit first", description: "Run /autopilot:commits-create before creating PR" },
  { label: "Continue anyway", description: "Create PR without committing these changes" },
  { label: "Cancel", description: "Stop so I can handle changes first" }
  ]
- `multiSelect`: false

- If "Commit first": invoke `Skill(autopilot:commits-create)`, then continue below.
- If "Cancel": output "Pull request cancelled. Commit or stash changes first." and abort.
- If "Continue anyway": continue below.

For all other modes (`plan`, `branch`, `commits`), skip this check — uncommitted changes are expected in `commits` mode, irrelevant in `plan`/`branch` mode before branch creation.

### Check if branch is merged into main

Run:

```bash
git log origin/main..HEAD --oneline
```

- If the output is empty (no unmerged commits), the branch IS merged — go to Phase 2a.
- If the output is non-empty, the branch has unmerged commits — go to Phase 2b.

### Phase 2a: Branch Is Merged

**If `isWorktree` is true:**

This is a worktree with no unmerged commits — likely a fresh worktree or a merged feature branch.

- `plan` mode: output "Worktree detected on branch <currentBranch>. No unmerged commits. Branch creation deferred to Pre-Implementation." and exit skill.
- Other modes: output "Worktree detected on branch <currentBranch>. No unmerged commits. Proceed with <action noun>." and exit skill.

**If `isWorktree` is false:**

Use AskUserQuestion:

Tool parameters:

- `question`: "You are on branch <currentBranch> which is already merged into main.\n\nThis branch appears stale. Switch to main before <action noun>?"
- `header`: "Merged branch"
- `options`: [
  { label: "Switch to main", description: "Checkout main and continue with <action noun>" },
  { label: "Stay on this branch", description: "Continue with <action noun> on the current branch" }
  ]
- `multiSelect`: false

- If "Switch to main": run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- If "Stay on this branch": output "Continuing on branch <currentBranch>" and exit skill.

### Phase 2b: Branch Has Unmerged Commits

#### Extract branch issue ID

Parse the branch name to extract an issue number:

- Pattern: `^issue-([0-9]+)-` for standard issue branches
- If the branch name starts with a special prefix (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`, `security-`), there is no issue number to extract

#### Compare with plan-mode issue ID

If mode is not `plan`, skip the comparison entirely and proceed to the "matching" prompt below.

If mode is `plan`:

Read the plan issue ID from the `/autopilot:plan` or `/autopilot:run` input earlier in conversation history. Normalize both the branch issue ID and the plan issue ID to lowercase.

- If the plan input type is "plain description" (no issue ID resolved), skip comparison.

**If issue IDs do NOT match (plan mode only):**

Use AskUserQuestion:

Tool parameters:

- `question`: "You are on branch <currentBranch> (issue: <branchIssueId>) but planning for <planIssueId>.\n\nThe branch does not match the target issue. How to proceed?"
- `header`: "Branch mismatch"
- If `isWorktree` is true, use these `options`: [
  { label: "Continue on this branch", description: "Plan for <planIssueId> on branch <currentBranch> — branch creation available after planning" },
  { label: "Cancel", description: "Stop planning" }
  ]
- If `isWorktree` is false, use these `options`: [
  { label: "Continue on this branch", description: "Plan for <planIssueId> on branch <currentBranch>" },
  { label: "Switch to main", description: "Checkout main before planning" },
  { label: "Cancel", description: "Stop planning" }
  ]
- `multiSelect`: false

Handle user choice:

- "Continue on this branch": output "Continuing on branch <currentBranch>" and exit skill.
- "Switch to main" (non-worktree only): run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- "Cancel": output "Planning cancelled by user." and abort.

**Matching branch (plan mode) or any mode other than plan:**

Use AskUserQuestion:

Tool parameters:

- `question`: "You are on branch <currentBranch> with <N> unmerged commit(s).\n\nContinue with <action noun> on this branch?"
- `header`: "Feature branch"
- If `isWorktree` is true, use these `options`: [
  { label: "Continue on this branch", description: "Proceed with <action noun> on the current feature branch" },
  { label: "Cancel", description: "Stop <action noun>" }
  ]
- If `isWorktree` is false, use these `options`: [
  { label: "Continue on this branch", description: "Proceed with <action noun> on the current feature branch" },
  { label: "Switch to main", description: "Checkout main and start fresh" },
  { label: "Cancel", description: "Stop <action noun>" }
  ]
- `multiSelect`: false

- "Continue on this branch": output "Continuing on branch <currentBranch>" and exit skill.
- "Switch to main" (non-worktree only): run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- "Cancel": output "<Action noun> cancelled by user." and abort.

## Phase 3: On Main

### Check working tree

Run:

```bash
git status --porcelain
```

If the output is non-empty:

Use AskUserQuestion:

Tool parameters:

- `question`: "You have uncommitted changes on main.\n\nUncommitted changes may interfere with <action noun>. How to proceed?"
- `header`: "Uncommitted changes"
- `options`: [
  { label: "Continue anyway", description: "Proceed with <action noun> despite uncommitted changes" },
  { label: "Cancel", description: "Stop so I can handle changes first" }
  ]
- `multiSelect`: false

- If "Cancel": output "<Action noun> cancelled. Commit or stash changes first." and abort.
- If "Continue anyway": continue below.

### Mode-specific handling

**Mode `plan` or `branch`:**

Run `git fetch origin`. If fetch fails (e.g., no remote origin), output "No remote 'origin' found. Skipping remote update check." and exit skill.

**If `isWorktree` is true:**

Output "Fetched latest refs from origin. Branch creation deferred to Pre-Implementation." (plan mode) or "Fetched latest refs from origin." (branch mode) and exit skill.

**If `isWorktree` is false:**

Check if local main is behind remote:

```bash
git rev-list HEAD..origin/main --count
```

- If count is 0: output "Branch main is up to date with origin." and exit skill.
- If count > 0:

Use AskUserQuestion:

Tool parameters:

- `question`: "Your local main is <N> commit(s) behind origin/main.\n\nPull the latest changes before <action noun>?"
- `header`: "Updates available"
- `options`: [
  { label: "Pull updates", description: "Run git pull to get latest changes" },
  { label: "Continue without pulling", description: "Proceed against current local state" }
  ]
- `multiSelect`: false

- If "Pull updates": run `git pull origin main`, output "Pulled latest changes from origin/main." and exit skill.
- If "Continue without pulling": output "Continuing with local state (<N> commits behind origin)." and exit skill.

**Mode `commits` or `pr`:**

Creating a commit or PR directly from `main` is almost always wrong. Do not fetch or pull. Warn the user:

Use AskUserQuestion:

Tool parameters:

- `question`: "You are on main. Creating a <action noun> directly on main is usually wrong.\n\nTo switch to a feature branch, cancel and run /autopilot:branch-create before retrying. How to proceed?"
- `header`: "On main"
- `options`: [
  { label: "Continue on main", description: "Proceed anyway (hotfix/maintenance/trivial cases)" },
  { label: "Cancel", description: "Stop so I can run /autopilot:branch-create first" }
  ]
- `multiSelect`: false

- If "Continue on main": output "Continuing on main." and exit skill.
- If "Cancel": output "<Action noun> cancelled. Run /autopilot:branch-create to switch to a feature branch, then retry." and abort.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as `[title](url)` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
