---
name: preflight-check
description: Validate git working state before committing, branching, or opening a PR. Detects wrong branch, invalid branch names, forbidden history-changing commands, stale merged branches, uncommitted changes, and out-of-date main.
user-invocable: false
allowed-tools:
  - Bash(git *)
  - Read
  - AskUserQuestion
---

Validate the git working environment before proceeding. This skill checks the current branch state, detects stale or merged branches, and — depending on mode — either prepares `main` for a new plan/branch or warns against committing/opening a PR directly on `main`.

The skill protects three invariants; the phases below implement them:

1. Never create a branch from a stale branch or a `main` that is behind its remote.
2. Never commit or open a PR on `main` without the user explicitly acknowledging it.
3. Never commit on a branch whose name violates the naming convention without the user explicitly acknowledging it — a violation caught at commit time costs a rename; caught on an open PR it costs the PR.
4. Never run a history-changing git command the repository forbids — merging the base branch into a topic branch, force-pushing without a lease, or rewriting a branch someone else owns. Unlike the three above, this one is not acknowledgeable: there is no prompt that makes it acceptable.

## Context

The invoking skill supplies these inputs in this conversation:

- **Mode** — one of `plan`, `branch`, `commits`, `pr`. Every caller passes it explicitly (`mode: <plan|branch|commits|pr>`); default to `plan` only when it is absent.
- **Issue ID** (optional, `plan` mode only) — the resolved issue identifier (e.g., `#42`), used for the branch-vs-issue comparison in [Phase 2b](#phase-2b-branch-has-unmerged-commits).

The action noun used in prompts below follows the mode:

| Mode      | Action noun     |
| --------- | --------------- |
| `plan`    | planning        |
| `branch`  | branch creation |
| `commits` | commit          |
| `pr`      | pull request    |

**Decision points.** Every user decision below uses AskUserQuestion. Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) once and apply it to every `question` you compose. Each decision point states the situation, a suggested header, the choices with their consequences, and the action each choice triggers — compose the dialog from that. The quoted output strings are the skill's contract with its callers (they parse them, e.g. for the word "cancelled") — emit them EXACTLY as written.

## Phase 0: History Policy Gate

Read [`git-history-policy.md`](../shared-rules/references/git-history-policy.md) and apply it verbatim for the rest of the session, not only for the checks below.

Evaluate every git command this session is about to run against the block's canonical regex before running it. On a match, refuse: report the matched command, name the permitted alternative from the block, and abort with "<Action noun> cancelled. <command> merges or rewrites history in a way CONTRIBUTING.md forbids — see the git history policy." This gate takes no AskUserQuestion, in every mode. The later phases ask the user to accept a risk; this one states a rule, and a prompt would only invite the acknowledgement that invariant 4 rules out.

Ownership is part of the same gate. When a rewrite is contemplated on a branch this session did not create — a shared branch, or one whose last commits carry another author — stop and report rather than guessing; the block's recovery procedure applies only to agent-owned branches.

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

### Check branch name format (commits mode only)

If mode is `commits`, read the canonical branch-name regex from [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md) and check `currentBranch` against it and against the length bounds beside it (5–100 characters) — an overlong name fails CI's `max_length` check just like a shape violation. `plan` and `branch` modes skip this check — they run before the working branch exists, including on harness-created worktree branches — and `pr` mode skips it because `pr-create` validates the branch itself in its Phase 1 (one owner per gate, no double prompt).

If the name does not match, ask (header "Branch name"): branch `<currentBranch>` does not follow the naming convention and would fail the contributing-check CI once a PR is open, where the only fix is a fresh branch and a fresh PR — how to proceed?

- **Continue anyway** — commit on this branch at the user's explicit request: continue to the merged-branch check below.
- **Cancel** — stop so the branch can be fixed while no PR exists and the rename is still free: output "Commit cancelled. Branch <currentBranch> does not follow the naming convention — re-create it with /autopilot:branch-create (uncommitted changes follow the checkout) or rename it with git branch -m, then retry." and abort.

### Check working tree (pr mode only)

If mode is `pr`, run:

```bash
git status --porcelain
```

If the output is non-empty, ask (header "Uncommitted"): uncommitted changes were detected on `<currentBranch>` — how to proceed before opening the pull request?

- **Commit first** — run `/autopilot:commits-create` before creating the PR: invoke `Skill(autopilot:commits-create)`, then continue below.
- **Continue anyway** — create the PR without committing these changes: continue below.
- **Cancel** — stop so the user can handle changes first: output "Pull request cancelled. Commit or stash changes first." and abort.

For all other modes (`plan`, `branch`, `commits`), skip this check — uncommitted changes are expected in `commits` mode, irrelevant in `plan`/`branch` mode before branch creation.

### Check if branch is merged into main

Run:

```bash
git cherry origin/main HEAD
```

- If every line starts with `-` (or the output is empty), the branch IS merged — go to Phase 2a. `git cherry` compares patches, not SHAs, so a branch whose commits landed upstream rewritten by a rebase-merge is still detected as merged; a `git log origin/main..HEAD` emptiness test misses exactly that case.
- If any line starts with `+`, the branch has unmerged commits — go to Phase 2b.

### Phase 2a: Branch Is Merged

**If `isWorktree` is true:**

This is a worktree with no unmerged commits — likely a fresh worktree or a merged feature branch.

- `plan` mode: output "Worktree detected on branch <currentBranch>. No unmerged commits. Branch creation deferred to Pre-Implementation." and exit skill.
- Other modes: output "Worktree detected on branch <currentBranch>. No unmerged commits. Proceed with <action noun>." and exit skill.

**If `isWorktree` is false:**

Ask (header "Merged branch"): branch `<currentBranch>` is already merged into main and appears stale — switch to main before <action noun>?

- **Switch to main** — checkout main and continue with <action noun>: run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- **Stay on this branch** — continue with <action noun> on the current branch: output "Continuing on branch <currentBranch>" and exit skill.

### Phase 2b: Branch Has Unmerged Commits

#### Extract branch issue ID

Parse the branch name to extract an issue number:

- Pattern: `^issue-([0-9]+)-` for standard issue branches
- If the branch name starts with a special prefix (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`, `security-`), there is no issue number to extract

#### Compare with plan-mode issue ID

If mode is not `plan`, skip the comparison entirely and proceed to the "matching" decision point below.

If mode is `plan`:

Read the plan issue ID from the `/autopilot:plan` or `/autopilot:run` input earlier in conversation history. Normalize both the branch issue ID and the plan issue ID to lowercase.

- If the plan input type is "plain description" (no issue ID resolved), skip comparison.

**If issue IDs do NOT match (plan mode only):**

Ask (header "Branch mismatch"): the current branch `<currentBranch>` (issue `<branchIssueId>`) does not match the target issue `<planIssueId>` — how to proceed?

- **Continue on this branch** — plan for <planIssueId> on branch <currentBranch> (when `isWorktree` is true, note that branch creation is available after planning): output "Continuing on branch <currentBranch>" and exit skill.
- **Switch to main** (offer only when `isWorktree` is false) — checkout main before planning: run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- **Cancel** — stop planning: output "Planning cancelled by user." and abort.

**Matching branch (plan mode) or any mode other than plan:**

Ask (header "Feature branch"): you are on branch `<currentBranch>` with `<N>` unmerged commit(s) — continue with <action noun> on this branch?

- **Continue on this branch** — proceed with <action noun> on the current feature branch: output "Continuing on branch <currentBranch>" and exit skill.
- **Switch to main** (offer only when `isWorktree` is false) — checkout main and start fresh: run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- **Cancel** — stop <action noun>: output "<Action noun> cancelled by user." and abort.

## Phase 3: On Main

### Check working tree

Run:

```bash
git status --porcelain
```

If the output is non-empty, ask (header "Uncommitted changes"): there are uncommitted changes on main that may interfere with <action noun> — how to proceed?

- **Continue anyway** — proceed with <action noun> despite uncommitted changes: continue below.
- **Cancel** — stop so the user can handle changes first: output "<Action noun> cancelled. Commit or stash changes first." and abort.

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
- If count > 0, ask (header "Updates available"): local main is `<N>` commit(s) behind origin/main — pull the latest changes before <action noun>?
  - **Pull updates** — run `git pull origin main` to get the latest changes, output "Pulled latest changes from origin/main." and exit skill.
  - **Continue without pulling** — proceed against current local state: output "Continuing with local state (<N> commits behind origin)." and exit skill.

**Mode `commits` or `pr`:**

Creating a commit or PR directly from `main` is almost always wrong. Do not fetch or pull. Ask (header "On main"): creating a <action noun> directly on main is usually wrong; to switch to a feature branch, cancel and run `/autopilot:branch-create` before retrying — how to proceed?

- **Continue on main** — proceed anyway (hotfix/maintenance/trivial cases): output "Continuing on main." and exit skill.
- **Cancel** — stop so the user can run `/autopilot:branch-create` first: output "<Action noun> cancelled. Run /autopilot:branch-create to switch to a feature branch, then retry." and abort.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
