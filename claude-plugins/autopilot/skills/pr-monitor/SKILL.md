---
name: pr-monitor
description: Monitor a PR for review approval, CI check status, and merge conflicts, blocking until approved with all checks passing. Fixes CI failures, resolves review feedback, and rebases a conflicting branch onto its base. Use when waiting for PR approval.
argument-hint: "[--background]"
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Agent
  - Bash(git *)
  - Bash(gh *)
  - Bash(bun *)
  - Bash(sleep *)
  - AskUserQuestion
  - Skill(autopilot:pr-resolve)
  - Skill(autopilot:commits-create)
---

# PR Monitor

Monitor a pull request for review approval and CI check status. Polls review state and CI checks every minute, invokes `pr-resolve` when changes are requested, and automatically fixes CI failures (lint, type errors, test failures). Blocks until the PR is approved with all checks passing.

## When to Use

- When waiting for a PR to be approved before proceeding
- When a user invokes `/autopilot:pr-monitor` to launch a background monitor

## Input

Arguments: `$ARGUMENTS`

Expected flags (all optional):

- `--background` — launch as a background agent (non-interactive mode described below). When omitted and the skill is invoked directly by a user, run foreground mode. When invoked from another skill/agent (e.g., via the Agent tool with `run_in_background: true`), the calling context supplies the background signal — treat that equivalently to `--background`.

## Input resolution

Arguments are optional. Resolve each field:

- **Mode (foreground vs background)** — `$ARGUMENTS` flag → calling context (if invoked via Agent tool with `run_in_background: true`, use background) → default foreground. Do NOT prompt.
- **PR number** — detect via `gh pr view --json number,url,headRefName` on the current branch. Abort with a clear message if no PR exists.

## Phase 0: Mode Dispatch

If `$ARGUMENTS` contains `--background` AND the skill was invoked directly (not already running inside an Agent subprocess), re-launch itself as a background agent and exit the current turn:

```
Use the Agent tool with:
- `subagent_type`: "general-purpose"
- `prompt`: "Invoke Skill(autopilot:pr-monitor). Monitor the PR in background mode — poll for review approval AND CI check status but do NOT invoke pr-resolve interactively or fix CI checks. Instead, return immediately when changes are requested or checks fail with a structured summary."
- `description`: "Monitor PR reviews"
- `run_in_background`: true
```

Output: "PR monitoring started in the background. You'll be notified when the review status changes." Then return — do NOT continue to [Phase 1](#phase-1-detect-pr) in the launching turn.

Otherwise (no `--background` flag, or already inside an Agent subprocess), continue to [Phase 1](#phase-1-detect-pr).

## Execution Modes

This skill supports two modes:

### Foreground Mode (default)

Interactive — blocks the conversation, invokes `pr-resolve` when changes are requested, and automatically fixes CI failures.

### Background Mode

When invoked via the Agent tool with `run_in_background: true` (spawned by [Phase 0](#phase-0-mode-dispatch) of this skill), the skill operates non-interactively:

- **Do NOT invoke** `Skill(autopilot:pr-resolve)` — the user is not available for interaction
- **Do NOT attempt to fix CI checks** — the user is not available for interaction and fixes may require judgment calls
- **Do NOT rebase, resolve, or push** — a history rewrite has no one to authorize it here; the [Conflict Sweep](#conflict-sweep-shared-procedure) returns the summary below instead of acting
- **Do NOT use** `AskUserQuestion` — no user interaction in background mode
- When changes are requested or new actionable review comments are detected, **return immediately** with a structured summary instead of invoking pr-resolve:

  ```
  PR Monitor: Changes Requested

  PR #N has review feedback that needs attention.
  Status: CHANGES_REQUESTED
  URL: <pr-url>

  Run /pr-resolve to address the feedback.
  ```

- When CI checks fail, **return immediately** with a structured summary:

  ```
  PR Monitor: CI Checks Failed

  PR #N has failing CI checks.
  Failed: [check-name-1], [check-name-2]
  Status: CHECKS_FAILED
  URL: <pr-url>

  Fix the failing checks and push, or run /pr-monitor again.
  ```

- When the pull request conflicts with its base, **return immediately** with a structured summary:

  ```
  PR Monitor: Merge Conflict

  PR #N conflicts with <base-branch> and cannot merge.
  Conflicted: [path-1], [path-2]
  Status: CONFLICTING
  URL: <pr-url>

  Run /autopilot:pr-monitor in the foreground to rebase the branch onto its base.
  ```

- For approved/merged/closed, return the same [Phase 3](#phase-3-exit) exit message as foreground mode

**Detect background mode** per [Phase 0](#phase-0-mode-dispatch): use background behavior when the skill was launched with `--background`, when it runs inside an Agent subprocess, or when this prompt contains "background mode"; otherwise use foreground behavior.

## Context

This skill receives the following from conversation history:

- **PR number** (optional): if provided, use directly; otherwise detect from current branch

## Phase 1: Detect PR

Auto-detect the PR from the current branch:

```bash
gh pr view --json number,title,url,state,baseRefName,headRefName,headRepositoryOwner,author,reviewDecision,reviewRequests,statusCheckRollup,mergeable
```

If no PR found, abort: "No pull request found for the current branch. Create one first with `/autopilot:pr-create`."

Store PR number, owner/repo (extract from url), title, and state.

### Approval Sweep (shared procedure)

Run whenever `reviewDecision` is `APPROVED` — from the [§1.1](#11-early-exit-checks) pre-loop check or the [§2.2](#22-check-pr-state) per-cycle check. Only the follow-up outputs and continue targets differ, and those stay with each caller.

1. Record current HEAD: `git rev-parse HEAD` → store as `headBefore`
2. Invoke `Skill(autopilot:pr-resolve)` to evaluate unresolved suggestions and nitpicks. The skill will exit early if no actionable comments remain. For each suggestion:
   - If reasonable and improves the code → fix it
   - If not applicable or doesn't make sense → reply explaining why
3. Check if HEAD changed: `git rev-parse HEAD` → compare with `headBefore`
4. If HEAD changed (pr-resolve pushed new commits — new CI must pass and the approval may be stale), set `cooldownRemaining = 3`; the caller resumes monitoring. If HEAD unchanged, the caller decides whether to exit.

### Conflict Sweep (shared procedure)

Run whenever `mergeable` is `CONFLICTING` — from the [§1.1](#11-early-exit-checks) pre-loop check or the [§2.2](#22-check-pr-state) per-cycle check. Only the follow-up outputs and continue targets differ, and those stay with each caller.

`mergeable` is `UNKNOWN`, not `CONFLICTING`, whenever GitHub has not finished computing mergeability — which is the normal reading for the first cycle or two after any push. `UNKNOWN` is a pending state: leave it to the next poll and do not sweep on it.

Read [`git-history-policy.md`](../shared-rules/references/git-history-policy.md) before running any command below. Every step of this sweep is the policy's sanctioned synchronization path and nothing else: a conflicting branch is the one condition under which a pull-request branch genuinely needs its base's changes, and it is taken by rebase, never by merging the base in.

1. **Background mode returns instead of acting.** Emit the `Status: CONFLICTING` summary from [Background Mode](#background-mode) and stop. A background run has no user to authorize a history rewrite, so it never fetches, rebases, or pushes.
2. **Refuse and exit when the sweep is not the agent's to run.** Each of these ends monitoring at [Phase 3](#phase-3-exit) with status "conflicted", naming the reason — none is retried:
   - `git status --porcelain` is non-empty — a rebase would fail or silently strand the changes.
   - A rebase is already in progress (`git rev-parse --git-path rebase-merge` or `rebase-apply` exists) — never start a second one on top.
   - `headRepositoryOwner` differs from the pull request's own repository: a fork branch the agent cannot push to.
   - The pull request's `author.login` is not the login `gh api user --jq .login` reports. This is the policy's "never rewrite a branch you do not own" made checkable. Note that under a workflow `GITHUB_TOKEN` the authenticated identity is the bot rather than the account that opened the pull request, so the sweep is inert in CI by design.
3. **Pin the lease.** Record `git rev-parse origin/<headRefName>` as `preRebaseSha` before anything changes. The push in step 5 leases against this exact value; a bare `--force-with-lease` is anchored to whatever the local tracking ref happens to hold, and any unrelated fetch re-anchors it and quietly degrades the push to the unleased `--force` the policy forbids.
4. **Take the base changes by rebase:**
   ```bash
   git fetch origin <baseRefName>
   git rebase origin/<baseRefName>
   ```
5. **A rebase that completes cleanly** pushes with the pinned lease, sets `cooldownRemaining = 3`, and returns to the caller:
   ```bash
   git push --force-with-lease=<headRefName>:<preRebaseSha>
   ```
   Any push failure is terminal: report it and exit to [Phase 3](#phase-3-exit) with status "conflicted". Never retry it, and never retry it without the lease.
6. **A rebase that halts aborts immediately** — the working tree is never left mid-rebase:
   ```bash
   git diff --name-only --diff-filter=U   # capture the conflicted paths first
   git rebase --abort
   ```
   Report the conflicted paths and `preRebaseSha`, then hand to step 7.
7. **Only in foreground mode**, offer the halted rebase to the user via AskUserQuestion — mirroring the CI-unfixable prompt in [§2.2a](#22a-check-ci-status). Resolving conflicted hunks is a judgement call about intent, so it happens because the user asked for it, never because the sweep decided on its own. That is why step 6 aborts first.
   - `question`: "PR #N conflicts with \<baseRefName\> and the rebase could not complete.\n\nConflicted paths: \<paths\>\nBranch head before rebase: \<preRebaseSha\>"
   - `header`: "Conflict"
   - `options`: [
     { label: "Resolve conflicts", description: "Rebase again and resolve the conflicted hunks, then push" },
     { label: "Stop monitoring", description: "Leave the branch untouched and exit" }
     ]
   - `multiSelect`: false
   - If "Resolve conflicts": re-run step 4, resolve each conflicted path, `git add` it, `git rebase --continue` until the rebase finishes, then push per step 5.
   - If "Stop monitoring": exit to [Phase 3](#phase-3-exit) with status "conflicted".

### 1.1 Early Exit Checks

**If `state` is `MERGED`:**

- Exit: "PR #N has already been merged."

**If `state` is `CLOSED`:**

- Exit: "PR #N has been closed."

**If `mergeable` is `CONFLICTING`:**

This branch is checked before the `reviewDecision` branches below, and the ordering is load-bearing: the `APPROVED` branch exits with "already approved with all checks passing" without consulting mergeability, so a conflicted-but-approved pull request would otherwise exit clean while it cannot merge.

1. Output: "PR #N conflicts with \<baseRefName\>. Running the conflict sweep..."
2. Increment `conflictSweeps`, then run the [Conflict Sweep](#conflict-sweep-shared-procedure)
3. If the sweep pushed a rebased branch: output "Conflict resolved by rebase. Starting monitoring..." and continue to Phase 1.2
4. If the sweep refused, aborted, or its push failed: exit to [Phase 3](#phase-3-exit) with status "conflicted"

**If `reviewDecision` is `APPROVED`:**

1. Run the [Approval Sweep](#approval-sweep-shared-procedure)
2. If HEAD changed:
   - Output: "PR #N was approved but pr-resolve pushed fixes. Resuming monitoring for new CI and approval..."
   - Continue to Phase 1.2
3. If HEAD unchanged AND all checks in `statusCheckRollup` have `state === "SUCCESS"`:
   - Exit: "PR #N is already approved with all checks passing. No monitoring needed."
4. If HEAD unchanged AND checks are not all passing:
   - Output: "PR #N is approved but has failing CI checks. Attempting to fix..."
   - Run the **CI Fix Workflow** (see [§2.2a](#22a-check-ci-status))
   - After fix, output: "CI fixes pushed. Starting monitoring..."
   - Continue to Phase 1.2

**If `reviewDecision` is `CHANGES_REQUESTED`:**

1. Output: "PR #N has changes requested. Invoking resolve-review..."
2. Invoke `Skill(autopilot:pr-resolve)`
3. After skill completes, output: "Review feedback addressed. Starting monitoring..."
4. Continue to Phase 1.2 (do not exit — the PR still needs approval after fixes)

**If checks are failing** (any check in `statusCheckRollup` with `state` that is not `SUCCESS` and not `PENDING` and not `EXPECTED`):

1. Output: "PR #N has failing CI checks. Attempting to fix..."
2. Run the **CI Fix Workflow** (see [§2.2a](#22a-check-ci-status))
3. After fix, output: "CI fixes pushed. Starting monitoring..."
4. Continue to Phase 1.2

### 1.2 Check for Reviewers

If `reviewRequests` is empty (no reviewers assigned), present using AskUserQuestion:

Tool parameters:

- `question`: "No reviewers assigned to PR #N. The monitor will wait but nobody can approve."
- `header`: "No reviewers"
- `options`: [
  { label: "Continue waiting", description: "Poll until reviewers are assigned and approve" },
  { label: "Cancel", description: "Stop monitoring" }
  ]
- `multiSelect`: false

If "Cancel", stop.

### 1.3 Start Monitoring

Output: "Monitoring PR #N: \<title\>\nPolling every 1 minute. Watching for review approval and CI check status..."

---

## Phase 2: Polling Loop

Enter a loop that repeats until the PR is approved with all checks passing, merged, or closed.

Maintain the following state across iterations:

- `cooldownRemaining`: number of poll cycles to skip CI checks after a fix push (starts at 0; a push sets it to 3 so fresh CI runs have time to replace the stale failures of the superseded commit before checks are read again)
- `fixAttempts`: map of `checkName → { attempts: number, lastRunId: string }` tracking CI fix attempts
- `conflictSweeps`: count of [Conflict Sweep](#conflict-sweep-shared-procedure) runs, capped at **2 per `pr-monitor` invocation**. The caller increments it before invoking the sweep, following the Approval Sweep precedent that caller-side bookkeeping stays with the caller. The cap is run-scoped and deliberately **not** keyed to the base SHA: a per-SHA budget is refunded by every new commit to the base, so on an active repository it would fund unbounded force-pushes and CI reruns forever — this skill's original defect reappearing one layer up. Reaching the cap exits to [Phase 3](#phase-3-exit) with status "conflicted".

### 2.1 Sleep

Wait for the poll interval (60 seconds = 1 minute):

```bash
sleep 60
```

### 2.2 Check PR State

```bash
gh pr view <PR_NUMBER> --json state,reviewDecision,statusCheckRollup,mergeable
```

**If `state` is `MERGED`:**

- Exit to [Phase 3](#phase-3-exit) with status "merged"

**If `state` is `CLOSED`:**

- Exit to [Phase 3](#phase-3-exit) with status "closed"

**If `mergeable` is `CONFLICTING`:**

Checked before the `reviewDecision` branches for the same load-bearing reason as [§1.1](#11-early-exit-checks). Every outcome below names its destination explicitly — a conflicting pull request must never fall through to [§2.3](#23-check-for-new-reviews), which would resume the silent polling this branch exists to end.

1. If `conflictSweeps` has reached 2, output "PR #N still conflicts with \<baseRefName\> after 2 sweeps." and exit to [Phase 3](#phase-3-exit) with status "conflicted"
2. Output: "PR #N conflicts with \<baseRefName\>. Running the conflict sweep..."
3. Increment `conflictSweeps`, then run the [Conflict Sweep](#conflict-sweep-shared-procedure)
4. If the sweep pushed a rebased branch: output "Conflict resolved by rebase. Resuming monitoring..." and continue the polling loop (go to 2.1)
5. If the sweep refused, aborted, or its push failed: exit to [Phase 3](#phase-3-exit) with status "conflicted"

**If `reviewDecision` is `APPROVED` AND all checks in `statusCheckRollup` have `state === "SUCCESS"`:**

1. Run the [Approval Sweep](#approval-sweep-shared-procedure)
2. If HEAD changed:
   - Output: "pr-resolve pushed fixes. Resuming monitoring for new CI and approval..."
   - Continue polling loop (go to 2.1)
3. If HEAD unchanged:
   - Exit to [Phase 3](#phase-3-exit) with status "approved"

**If `reviewDecision` is `CHANGES_REQUESTED`:**

1. Output: "Review feedback detected on PR #N. Invoking resolve-review..."
2. Invoke `Skill(autopilot:pr-resolve)`
3. After skill completes, output: "Review feedback addressed. Resuming monitoring..."
4. Continue polling loop (go to 2.1)

### 2.2a Check CI Status

If `cooldownRemaining > 0`, decrement it by 1 and skip this phase entirely (output: "Post-push cooldown: N cycles remaining. Skipping CI check.").

```bash
gh pr checks <PR_NUMBER> --json name,state,bucket,link,workflow
```

Parse the JSON output. For each check:

- `bucket === "pass"` → OK
- `bucket === "pending"` → still running, skip
- `bucket === "skipping"` → ignore
- `bucket === "cancel"` → treat as pending (likely cancelled by a new push)
- `bucket === "fail"` → CI failure detected

A check that reads a stale or superseded event — one whose failure is about the event and not about the code — is reported to the user, never refreshed by changing the branch. Do not merge or rebase base-branch changes into the PR to provoke a fresh `synchronize` event: the task did not require those changes, and the resulting diff misrepresents the pull request. This is the failure mode the git history policy exists to prevent.

**If any checks have `bucket === "fail"`:**

For each failing check, extract the run-id from the `link` field: parse the URL path segment after `/runs/` and before `/job/` (or end of path). Compare with `fixAttempts[checkName].lastRunId` — if the run-id is different, reset `attempts` to 0 for that check (new run detected).

**If `attempts < 2` for the failing check** (foreground mode only):

1. Output: "CI check '\<name\>' failed. Attempting fix (attempt N/2)..."
2. Get failure logs (truncate to last 200 lines):
   ```bash
   gh run view <run-id> --log-failed 2>&1 | tail -200
   ```
   If output is empty (cancelled run), output: "No logs available for cancelled run. Waiting for new run..." and skip fix.
3. Analyze the error output to determine fix type:
   - Lint errors → read files, apply fixes with Edit tool
   - Type errors → read files, fix type issues with Edit tool
   - Test failures → read test files, fix assertions/logic with Edit tool
4. After fixes, commit via `Skill(autopilot:commits-create)` and push:
   ```bash
   git push
   ```
   Read [`git-history-policy.md`](../shared-rules/references/git-history-policy.md) before this push. A plain fast-forward is all this step is allowed to do: if the push is rejected as non-fast-forward, report it and stop rather than merging the base branch or force-pushing.
5. Set `cooldownRemaining = 3` (skip CI checks for next 3 poll cycles)
6. Update `fixAttempts[checkName] = { attempts: N+1, lastRunId: <run-id> }`
7. Output: "CI fix pushed. Cooling down for 3 poll cycles before re-checking..."
8. Continue polling loop (go to 2.1)

**If `attempts >= 2`:**

1. Output to user via AskUserQuestion:
   - `question`: "CI check '\<name\>' has failed 2 fix attempts. The issue may require manual intervention.\n\nFailed check: \<name\>\nLast error: \<brief summary\>\nURL: \<link\>"
   - `header`: "CI unfixable"
   - `options`: [
     { label: "Retry once more", description: "Try one more fix attempt" },
     { label: "Skip this check", description: "Ignore this check and continue monitoring" },
     { label: "Cancel", description: "Stop monitoring" }
     ]
   - If "Retry once more": reset attempts to 0, run fix again
   - If "Skip this check": add check name to a skip list, continue monitoring
   - If "Cancel": stop monitoring

**If all checks have `bucket === "pass"`:**

1. Output: "PR #N: All CI checks passing."

Approval is handled once per cycle by [§2.2](#22-check-pr-state), which runs before this phase: when it sees `APPROVED` with all checks passing it evaluates suggestions and exits. If approval landed here while CI was still pending in §2.2, the next poll's §2.2 catches it — this phase needs no duplicate approval handler.

### 2.3 Check for New Reviews

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews
```

Analyze the reviews array. Track the timestamp of each poll iteration to identify new activity:

- Find reviews with `state: "CHANGES_REQUESTED"` submitted since the last check
- Find reviews with `state: "COMMENTED"` submitted since the last check

### 2.4 Check for New Comments

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments
```

Check for comments with `created_at` timestamps newer than the last poll iteration.

### 2.5 Act on Findings

**If CHANGES_REQUESTED or new actionable comments found:**

1. Output: "Review feedback detected on PR #N. Invoking resolve-review..."
2. Invoke `Skill(autopilot:pr-resolve)`
3. After skill completes, output: "Review feedback addressed. Resuming monitoring..."
4. Continue polling loop (go to 2.1)

**If PENDING (no new reviews or comments):**

1. Output: "PR #N: Still waiting for review. Next check in 1 minute."
2. Continue polling loop (go to 2.1)

---

## Phase 3: Exit

Output completion message based on exit status:

**Approved:**

```
PR Monitor Complete

PR #N approved. All CI checks passing.
Status: APPROVED
URL: <pr-url>
```

**Merged:**

```
PR Monitor Complete

PR #N has been merged.
URL: <pr-url>
```

**Closed:**

```
PR Monitor Complete

PR #N has been closed.
URL: <pr-url>
```

**Conflicted:**

```
PR Monitor Stopped

PR #N conflicts with <base-branch> and cannot merge.
Conflicted: [path-1], [path-2]
Reason: <rebase halted / push failed / not agent-owned / sweep cap reached>
Status: CONFLICTED
URL: <pr-url>
```

---

## Edge Cases

Cases the phases do not already cover:

- **pr-resolve fails** → report error, ask user via AskUserQuestion: "Resolve review encountered an error. How would you like to proceed?" with options: Retry / Continue monitoring / Cancel
- **CI fix attempt fails** → report error, ask user in foreground / return summary in background
- **Fix causes a different failure** → counts as a new attempt for that check
- **Rebase halts on conflicting content** → abort it, report the conflicted paths, and offer resolution in foreground only; never leave the tree mid-rebase
- **Push after a sweep fails for any reason** → report and exit to [Phase 3](#phase-3-exit) with status "conflicted"; never retry, and never retry without the lease
- **Conflicting PR on a fork, or one the agent does not own** → report and exit "conflicted"; the branch is not the agent's to rewrite
- **Conflict sweep cap reached** → report and exit "conflicted" rather than sweeping again
- **GitHub API rate limit (403/429)** → increase sleep interval to 120 seconds (2 minutes), warn user: "GitHub API rate limit detected. Increasing poll interval to 2 minutes."
- **Network error** → retry API call once after 30 seconds; if still failing, warn user and ask whether to continue

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
