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

Evaluate every git command this session is about to run against the block's canonical regex before running it, **whenever HEAD is on a topic branch**. On a match, refuse: report the matched command, name the permitted alternative from the block, and abort with "<Action noun> cancelled. <command> merges or rewrites history in a way CONTRIBUTING.md forbids — see the git history policy." This gate takes no AskUserQuestion, in every mode. The later phases ask the user to accept a risk; this one states a rule, and a prompt would only invite the acknowledgement that invariant 4 rules out.

The branch condition is load-bearing, and this skill owns it: the regex is shape-only and cannot see which branch is checked out, so a gate that fired unconditionally would refuse [Phase 3](#phase-3-on-main)'s own "Pull updates" action — `git pull origin main` while standing on `main` — which fast-forwards the base branch rather than pulling it into other work. On `main` or `master` itself the gate does not fire.

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

### Mode-specific entry check

Every invocation is one mode, so read the one file your mode names and nothing else — the other file's checks cannot apply to this run.

- `commits` — check the branch-name format now, per [`mode-commits-pr.md`](./references/mode-commits-pr.md).
- `pr` — check the working tree now, per [`mode-commits-pr.md`](./references/mode-commits-pr.md).
- `plan` and `branch` — no entry check; both run before the branch holds work. Their mode file, [`mode-plan-branch.md`](./references/mode-plan-branch.md), is read later: at [Phase 2b](#phase-2b-branch-has-unmerged-commits) for `plan`, at [Phase 3](#phase-3-on-main) for either.

Then continue to the merged-branch check below.

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

**If `isWorktree` is false:** take the "Merged branch" row of [Feature-branch decisions](#feature-branch-decisions).

### Phase 2b: Branch Has Unmerged Commits

#### Extract branch issue ID

Parse the branch name to extract an issue number:

- Pattern: `^issue-([0-9]+)-` for standard issue branches
- If the branch name starts with a special prefix (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`, `security-`), there is no issue number to extract

#### Choose the decision row

In `plan` mode, compare the branch issue ID against the target issue first — the procedure is in [`mode-plan-branch.md`](./references/mode-plan-branch.md#compare-with-plan-mode-issue-id), which also says which row a match or mismatch selects.

In every other mode, skip the comparison and take the "Matching branch" row of [Feature-branch decisions](#feature-branch-decisions).

### Feature-branch decisions

Three situations reach a decision on a feature branch. They share one set of choices, so compose the AskUserQuestion from the shared choices plus the matching situation line. Offer **Switch to main** only when `isWorktree` is false — on a worktree there is no local `main` checkout to switch to.

Choices:

- **Continue on this branch** — proceed with <action noun> on the current branch: output "Continuing on branch <currentBranch>" and exit skill. In `plan` mode on a mismatched branch, add that branch creation is available after planning when `isWorktree` is true.
- **Switch to main** — run `git checkout main`, then go to [Phase 3](#phase-3-on-main).
- **Cancel** — stop <action noun>: output "<Action noun> cancelled by user." and abort. In `plan` mode that reads "Planning cancelled by user." — the string `plan` and `run` parse for the word "cancelled".

Situations:

- **Merged branch**, `isWorktree` false, from [Phase 2a](#phase-2a-branch-is-merged) — header "Merged branch": branch `<currentBranch>` is already merged into main and appears stale — switch to main before <action noun>? Offers **Switch to main** and **Continue on this branch** only: a stale branch is a reason to move, never a reason to stop.
- **Issue mismatch**, `plan` mode only — header "Branch mismatch": the current branch `<currentBranch>` (issue `<branchIssueId>`) does not match the target issue `<planIssueId>` — how to proceed? Offers all three.
- **Matching branch**, or any mode other than `plan` — header "Feature branch": you are on branch `<currentBranch>` with `<N>` unmerged commit(s) — continue with <action noun> on this branch? Offers all three.

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

Read the file for your mode, as in [Phase 2](#phase-2-on-feature-branch):

- `plan` or `branch` — fetch `origin` and offer to pull a behind `main`: [`mode-plan-branch.md`](./references/mode-plan-branch.md#on-main-fetch-and-offer-to-pull).
- `commits` or `pr` — warn that committing or opening a PR on `main` is almost always wrong, and do not fetch: [`mode-commits-pr.md`](./references/mode-commits-pr.md#on-main-warn-instead-of-pulling).

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
