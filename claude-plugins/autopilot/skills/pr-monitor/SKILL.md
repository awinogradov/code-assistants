---
name: pr-monitor
description: Monitor a PR for CI check status, review feedback, and merge conflicts until it is ready for human review, approved, or merged. Fixes CI failures, resolves review feedback, and rebases a conflicting branch onto its base; pass --wait-for-approval to keep polling until a human approves. Use when a pull request is open and needs to reach its hand-off.
argument-hint: "[--background] [--wait-for-approval]"
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
  - Bash(node *)
  - Bash(sleep *)
  - AskUserQuestion
  - Skill(autopilot:pr-resolve)
  - Skill(autopilot:commits-create)
---

# PR Monitor

Monitor a pull request until the agent's obligations for its current head are complete. Polls review state and CI checks every minute, invokes `pr-resolve` when feedback needs answering, fixes CI failures (lint, type errors, test failures), and ends with a distinct **ready for human review** outcome once checks have settled and no feedback stands against the head. Approval and merge are asynchronous follow-ups, not part of the wait, unless `--wait-for-approval` asks for them. This skill never merges a pull request.

## When to Use

- After opening a PR, to carry it to the hand-off — the `run` chain invokes it this way
- When a user invokes `/autopilot:pr-monitor` to launch a background monitor
- With `--wait-for-approval`, when a session must block until a human approves

## Input

Arguments: `$ARGUMENTS`

Expected flags (all optional):

- `--background` — launch as a background agent (non-interactive mode described below). When omitted and the skill is invoked directly by a user, run foreground mode. When invoked from another skill/agent (e.g., via the Agent tool with `run_in_background: true`), the calling context supplies the background signal — treat that equivalently to `--background`.
- `--wait-for-approval` — completion policy, independent of the execution mode: keep polling past readiness until the PR is approved with all checks passing, merged, or closed. Without it the [Readiness Check](#readiness-check-shared-procedure) is the terminal test; [`run`](../run/SKILL.md) never passes it.

## Input resolution

Arguments are optional. Resolve each field:

- **Mode (foreground vs background)** — `$ARGUMENTS` flag → calling context (if invoked via Agent tool with `run_in_background: true`, use background) → default foreground. Do NOT prompt.
- **Completion policy** — `$ARGUMENTS` flag → default ready-for-review hand-off. Do NOT prompt.
- **PR number** — detect via `gh pr view --json number,url,headRefName` on the current branch. Abort with a clear message if no PR exists.

## Phase 0: Mode Dispatch

If `$ARGUMENTS` contains `--background` AND the skill was invoked directly (not already running inside an Agent subprocess), re-launch itself as a background agent and exit the current turn:

```
Use the Agent tool with:
- `subagent_type`: "general-purpose"
- `prompt`: "Invoke Skill(autopilot:pr-monitor). Monitor the PR in background mode — poll for readiness, review approval AND CI check status but do NOT invoke pr-resolve interactively or fix CI checks. Instead, return immediately when changes are requested or checks fail with a structured summary."
- `description`: "Monitor PR reviews"
- `run_in_background`: true
```

Output: "PR monitoring started in the background. You'll be notified when the review status changes." Then return — do NOT continue to [Phase 1](#phase-1-detect-pr) in the launching turn.

Otherwise (no `--background` flag, or already inside an Agent subprocess), continue to [Phase 1](#phase-1-detect-pr).

## Execution Modes

This skill supports two modes:

### Foreground Mode (default)

Interactive — blocks the conversation, invokes `pr-resolve` when feedback needs answering, and automatically fixes CI failures.

### Background Mode

There is no user to interact with, so the skill reports instead of acting: it never invokes [`pr-resolve`](../pr-resolve/SKILL.md), never attempts a CI fix, never rewrites history, and never calls `AskUserQuestion`. On changes requested, unanswered actionable comments, failing checks, or a conflict it returns immediately with a structured summary; ready, approved, merged, and closed return the same [Phase 3](#phase-3-exit) exit message as foreground mode.

Read [`references/background-mode.md`](./references/background-mode.md) for those summary formats before emitting one.

**Detect background mode** per [Phase 0](#phase-0-mode-dispatch): use background behavior when the skill was launched with `--background`, when it runs inside an Agent subprocess, or when this prompt contains "background mode"; otherwise use foreground behavior.

## Context

This skill receives the following from conversation history:

- **PR number** (optional): if provided, use directly; otherwise detect from current branch

## Phase 1: Detect PR

Auto-detect the PR from the current branch:

```bash
gh pr view --json number,title,url,state,baseRefName,headRefName,headRefOid,headRepositoryOwner,author,reviewDecision,reviewRequests,statusCheckRollup,mergeable
```

If no PR found, abort: "No pull request found for the current branch. Create one first with `/autopilot:pr-create`."

Store PR number, owner/repo (extract from url), title, state, and `headRefOid`.

### Approval Sweep (shared procedure)

Run whenever `reviewDecision` is `APPROVED` — from the [§1.1](#11-early-exit-checks) pre-loop check or the [§2.2](#22-check-pr-state) per-cycle check — and from the [Readiness Check](#readiness-check-shared-procedure) when feedback is actionable. Only the follow-up outputs and continue targets differ, and those stay with each caller.

1. Record current HEAD: `git rev-parse HEAD` → store as `headBefore`
2. Invoke `Skill(autopilot:pr-resolve)` to evaluate unresolved suggestions and nitpicks. The skill will exit early if no actionable comments remain. For each suggestion:
   - If reasonable and improves the code → fix it
   - If not applicable or doesn't make sense → reply explaining why
3. Check if HEAD changed: `git rev-parse HEAD` → compare with `headBefore`
4. If HEAD changed (pr-resolve pushed new commits — new CI must pass and the approval may be stale), set `cooldownRemaining = 3`; the caller resumes monitoring. If HEAD unchanged, the caller decides whether to exit.

### Conflict Sweep (shared procedure)

Run whenever `mergeable` is `CONFLICTING` — from the [§1.1](#11-early-exit-checks) pre-loop check or the [§2.2](#22-check-pr-state) per-cycle check. The procedure is in [`references/conflict-sweep.md`](./references/conflict-sweep.md); read it at that point. Only the follow-up outputs and continue targets differ between callers, and those stay with each caller.

Every command this skill runs is bound by [`git-history-policy.md`](../shared-rules/references/git-history-policy.md) — the sweep's rebase and lease-pinned push are the policy's one sanctioned synchronization path, and the [§2.2a](#22a-check-ci-status) fix push is a plain fast-forward or nothing. Neither the sweep nor a CI fix may merge the base branch into the pull request.

`mergeable` is `UNKNOWN`, not `CONFLICTING`, whenever GitHub has not finished computing mergeability — the normal reading for the first cycle or two after any push. `UNKNOWN` is a pending state: leave it to the next poll and do not sweep on it.

### Readiness Check (shared procedure)

The default terminal test, run from the [§1.1](#11-early-exit-checks) tail and from [§2.5](#25-act-on-findings) every cycle. It proves the agent's obligations for the **current head** are complete, or names the blocker so the caller keeps polling. Evidence is per head: `headRefOid` from the state read, each review's `commit_id` from the [§2.3](#23-check-for-new-reviews) read, and thread state from the review-thread helper (`fetch-pr-reviews.ts`, invoked per [`github-review-fetch.md`](../shared-rules/references/github-review-fetch.md)). The proof is never the aggregate `reviewDecision`, which carries verdicts from superseded commits.

1. **Fresh** — `cooldownRemaining` is 0 and `mergeable` is not `UNKNOWN`; otherwise not ready.
2. **Feedback answered** — actionable feedback is a `CHANGES_REQUESTED` review whose `commit_id` equals `headRefOid`, a thread the helper lists with `authorReplied` false, or one whose newest reply in the [§2.4](#24-check-for-new-comments) list is not the PR author's; a non-null `fetchError` is not ready, never "no feedback". On anything actionable, foreground runs [Approval Sweep](#approval-sweep-shared-procedure) steps 1–4 (a push sets the cooldown and the caller keeps polling); when nothing was pushed and a `CHANGES_REQUESTED` review is still bound to the head, the reviewer's decision stands until they re-read: exit to [Phase 3](#phase-3-exit) with status "changes-requested", never loop on it. Background returns its Changes Requested summary instead.
3. **Checks settled** — two consecutive readings of `gh pr checks` at least 60 seconds apart list the same check names, every one `pass` or `skipping`; [§1.1](#11-early-exit-checks) has no earlier reading, so it takes one, sleeps 60 seconds, and takes another. A "no checks reported" error is an empty reading; when `.github/workflows/` exists, five consecutive empty readings settle as empty and the exit says so. This is also the automated-review proof: a review workflow registers a check on the head, so a review in flight is a pending check and a completed one has posted the verdict step 2 read.
4. **Ready** — exit to [Phase 3](#phase-3-exit) with status "ready-for-review". Under `--wait-for-approval`, output "PR #N is ready for human review. Waiting for approval as requested." once and keep polling.

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
   - Run the **CI Fix Workflow** in [`references/ci-remediation.md`](./references/ci-remediation.md)
   - After fix, output: "CI fixes pushed. Starting monitoring..."
   - Continue to Phase 1.2

**If checks are failing** (any check in `statusCheckRollup` with `state` that is not `SUCCESS` and not `PENDING` and not `EXPECTED`):

1. Output: "PR #N has failing CI checks. Attempting to fix..."
2. Run the **CI Fix Workflow** in [`references/ci-remediation.md`](./references/ci-remediation.md)
3. After fix, output: "CI fixes pushed. Starting monitoring..."
4. Continue to Phase 1.2

**Otherwise** (including `reviewDecision` of `CHANGES_REQUESTED`, whose feedback the check's step 2 answers): run the [Readiness Check](#readiness-check-shared-procedure). A ready or changes-requested result exits; otherwise output the blocker and continue to Phase 1.2

### 1.2 Check for Reviewers

Only under `--wait-for-approval` — without it the monitor completes on its own and the ready exit names the missing reviewer. If `reviewRequests` is empty, ask via AskUserQuestion (header "No reviewers"): no reviewers are assigned to PR #N, so the monitor will wait but nobody can approve — **Continue waiting** (poll until reviewers are assigned and approve) or **Cancel** (stop monitoring). Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) before composing it.

### 1.3 Start Monitoring

Output: "Monitoring PR #N: \<title\>\nPolling every 1 minute. Watching for readiness, review feedback and CI check status..."

---

## Phase 2: Polling Loop

Enter a loop that repeats until the [Readiness Check](#readiness-check-shared-procedure) exits, or the PR is approved with all checks passing, merged, closed, or conflicted.

Maintain the following state across iterations:

- `cooldownRemaining`: number of poll cycles to skip CI checks after a fix push (starts at 0; a push sets it to 3 so fresh CI runs have time to replace the stale failures of the superseded commit before checks are read again)
- `fixAttempts`: map of `checkName → { attempts: number, lastRunId: string }` tracking CI fix attempts
- `lastCheckNames` and `emptyCheckReadings`: the previous cycle's `gh pr checks` names and the count of consecutive empty readings, for the Readiness Check's settled test
- `conflictSweeps`: count of [Conflict Sweep](#conflict-sweep-shared-procedure) runs, capped at **2 per `pr-monitor` invocation**. The caller increments it before invoking the sweep, following the Approval Sweep precedent that caller-side bookkeeping stays with the caller. The cap is run-scoped and deliberately **not** keyed to the base SHA: a per-SHA budget is refunded by every new commit to the base, so on an active repository it would fund unbounded force-pushes and CI reruns forever — this skill's original defect reappearing one layer up. Reaching the cap exits to [Phase 3](#phase-3-exit) with status "conflicted".

### 2.1 Sleep

Wait for the poll interval (60 seconds = 1 minute):

```bash
sleep 60
```

### 2.2 Check PR State

```bash
gh pr view <PR_NUMBER> --json state,reviewDecision,statusCheckRollup,mergeable,headRefOid
```

**If `state` is `MERGED`:**

- Exit to [Phase 3](#phase-3-exit) with status "merged"

**If `state` is `CLOSED`:**

- Exit to [Phase 3](#phase-3-exit) with status "closed"

**If `mergeable` is `CONFLICTING`:**

Checked before the `reviewDecision` branch for the same load-bearing reason as [§1.1](#11-early-exit-checks). Every outcome below names its destination explicitly — a conflicting pull request must never fall through to [§2.3](#23-check-for-new-reviews), which would resume the silent polling this branch exists to end.

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

Changes requested are not a branch here: the [Readiness Check](#readiness-check-shared-procedure) at [§2.5](#25-act-on-findings) answers them once per cycle, against the head they were made on.

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

**If any checks have `bucket === "fail"`:** run the CI Fix Workflow in [`references/ci-remediation.md`](./references/ci-remediation.md) — read it now. It owns the per-check attempt accounting, the log analysis and fix push, the post-push cooldown, and the AskUserQuestion escalation once a check has failed two fix attempts. Background mode does not run it at all.

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

Check for comments with `created_at` timestamps newer than the last poll iteration, and keep the list: the Readiness Check reads each thread's newest reply from it.

### 2.5 Act on Findings

Run the [Readiness Check](#readiness-check-shared-procedure): the [§2.3](#23-check-for-new-reviews) and [§2.4](#24-check-for-new-comments) findings are its step 2 input, and this cycle's `gh pr checks` reading is compared with `lastCheckNames` for step 3. A ready or changes-requested result exits to [Phase 3](#phase-3-exit). Otherwise:

1. Output: "PR #N: not ready — \<blocker\>. Next check in 1 minute."
2. Continue polling loop (go to 2.1)

---

## Phase 3: Exit

Output completion message based on exit status:

**Ready for review:**

```
PR Monitor Complete

PR #N is ready for human review. Checks settled for <head-sha> (<n> passed, <m> skipped); no unanswered feedback.
Status: READY_FOR_REVIEW
Reviewers: <requested logins, or "none requested — request one">
URL: <pr-url>

Approval and merge are asynchronous follow-ups. Later feedback is handled by /autopilot:pr-resolve, or by running /autopilot:pr-monitor again.
```

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

**Changes requested:**

```
PR Monitor Stopped

PR #N has changes requested on <head-sha> by <login>. Every thread was answered without code changes, so the reviewer's decision stands until they re-review.
Status: CHANGES_REQUESTED
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
- **Verdict on the head survives pr-resolve** → exit "changes-requested"; the same verdict must never re-trigger pr-resolve on the next cycle
- **Rebase halts on conflicting content** → abort it, report the conflicted paths, and offer resolution in foreground only; never leave the tree mid-rebase
- **Push after a sweep fails for any reason** → report and exit to [Phase 3](#phase-3-exit) with status "conflicted"; never retry, and never retry without the lease
- **Conflicting PR on a fork, or one the agent does not own** → report and exit "conflicted"; the branch is not the agent's to rewrite
- **Conflict sweep cap reached** → report and exit "conflicted" rather than sweeping again
- **GitHub API rate limit (403/429)** → increase sleep interval to 120 seconds (2 minutes), warn user: "GitHub API rate limit detected. Increasing poll interval to 2 minutes."
- **Network error** → retry API call once after 30 seconds; if still failing, warn user and ask whether to continue

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
