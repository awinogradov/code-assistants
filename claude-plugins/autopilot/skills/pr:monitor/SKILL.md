---
name: pr:monitor
description: Monitor a PR for review approval and CI check status, blocking until approved with all checks passing. Fixes CI failures and resolves review feedback. Use when waiting for PR approval.
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

Monitor a pull request for review approval and CI check status. Polls review state and CI checks every minute, invokes `pr:resolve` when changes are requested, and automatically fixes CI failures (lint, type errors, test failures). Blocks until the PR is approved with all checks passing.

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
- `prompt`: "Invoke Skill(autopilot:pr-monitor). Monitor the PR in background mode — poll for review approval AND CI check status but do NOT invoke pr:resolve interactively or fix CI checks. Instead, return immediately when changes are requested or checks fail with a structured summary."
- `description`: "Monitor PR reviews"
- `run_in_background`: true
```

Output: "PR monitoring started in the background. You'll be notified when the review status changes." Then return — do NOT continue to Phase 1 in the launching turn.

Otherwise (no `--background` flag, or already inside an Agent subprocess), continue to Phase 1.

## Execution Modes

This skill supports two modes:

### Foreground Mode (default)

Interactive — blocks the conversation, invokes `pr:resolve` when changes are requested, and automatically fixes CI failures.

### Background Mode

When invoked via the Agent tool with `run_in_background: true` (spawned by Phase 0 of this skill), the skill operates non-interactively:

- **Do NOT invoke** `Skill(autopilot:pr-resolve)` — the user is not available for interaction
- **Do NOT attempt to fix CI checks** — the user is not available for interaction and fixes may require judgment calls
- **Do NOT use** `AskUserQuestion` — no user interaction in background mode
- When changes are requested or new actionable review comments are detected, **return immediately** with a structured summary instead of invoking pr:resolve:

  ```
  PR Monitor: Changes Requested

  PR #N has review feedback that needs attention.
  Status: CHANGES_REQUESTED
  URL: <pr-url>

  Run /pr:resolve to address the feedback.
  ```

- When CI checks fail, **return immediately** with a structured summary:

  ```
  PR Monitor: CI Checks Failed

  PR #N has failing CI checks.
  Failed: [check-name-1], [check-name-2]
  Status: CHECKS_FAILED
  URL: <pr-url>

  Fix the failing checks and push, or run /pr:monitor again.
  ```

- For approved/merged/closed, return the same Phase 3 exit message as foreground mode

**Detect background mode:** If the prompt contains "background mode" — use background behavior. Otherwise, use foreground behavior.

## Context

This skill receives the following from conversation history:

- **PR number** (optional): if provided, use directly; otherwise detect from current branch

## Phase 1: Detect PR

Auto-detect the PR from the current branch:

```bash
gh pr view --json number,title,url,state,baseRefName,headRefName,author,reviewDecision,reviewRequests,statusCheckRollup
```

If no PR found, abort: "No pull request found for the current branch. Create one first with `/autopilot:pr-create`."

Store PR number, owner/repo (extract from url), title, and state.

### 1.1 Early Exit Checks

**If `state` is `MERGED`:**

- Exit: "PR #N has already been merged."

**If `state` is `CLOSED`:**

- Exit: "PR #N has been closed."

**If `reviewDecision` is `APPROVED`:**

1. Record current HEAD: `git rev-parse HEAD` → store as `headBefore`
2. Invoke `Skill(autopilot:pr-resolve)` to evaluate unresolved suggestions and nitpicks. The skill will exit early if no actionable comments remain. For each suggestion:
   - If reasonable and improves the code → fix it
   - If not applicable or doesn't make sense → reply explaining why
3. Check if HEAD changed: `git rev-parse HEAD` → compare with `headBefore`
4. If HEAD changed (pr:resolve pushed new commits):
   - Output: "PR #N was approved but pr:resolve pushed fixes. Resuming monitoring for new CI and approval..."
   - Set `cooldownRemaining = 3`
   - Continue to Phase 1.2
5. If HEAD unchanged AND all checks in `statusCheckRollup` have `state === "SUCCESS"`:
   - Exit: "PR #N is already approved with all checks passing. No monitoring needed."
6. If HEAD unchanged AND checks are not all passing:
   - Output: "PR #N is approved but has failing CI checks. Attempting to fix..."
   - Run the **CI Fix Workflow** (see Phase 2.2a)
   - After fix, output: "CI fixes pushed. Starting monitoring..."
   - Continue to Phase 1.2

**If `reviewDecision` is `CHANGES_REQUESTED`:**

1. Output: "PR #N has changes requested. Invoking resolve-review..."
2. Invoke `Skill(autopilot:pr-resolve)`
3. After skill completes, output: "Review feedback addressed. Starting monitoring..."
4. Continue to Phase 1.2 (do not exit — the PR still needs approval after fixes)

**If checks are failing** (any check in `statusCheckRollup` with `state` that is not `SUCCESS` and not `PENDING` and not `EXPECTED`):

1. Output: "PR #N has failing CI checks. Attempting to fix..."
2. Run the **CI Fix Workflow** (see Phase 2.2a)
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

- `cooldownRemaining`: number of poll cycles to skip CI checks after a fix push (starts at 0)
- `fixAttempts`: map of `checkName → { attempts: number, lastRunId: string }` tracking CI fix attempts

### 2.1 Sleep

Wait for the poll interval (60 seconds = 1 minute):

```bash
sleep 60
```

### 2.2 Check PR State

```bash
gh pr view <PR_NUMBER> --json state,reviewDecision,statusCheckRollup
```

**If `state` is `MERGED`:**

- Exit to Phase 3 with status "merged"

**If `state` is `CLOSED`:**

- Exit to Phase 3 with status "closed"

**If `reviewDecision` is `APPROVED` AND all checks in `statusCheckRollup` have `state === "SUCCESS"`:**

1. Record current HEAD: `git rev-parse HEAD` → store as `headBefore`
2. Invoke `Skill(autopilot:pr-resolve)` to evaluate unresolved suggestions and nitpicks. The skill will exit early if no actionable comments remain. For each suggestion:
   - If reasonable and improves the code → fix it
   - If not applicable or doesn't make sense → reply explaining why
3. Check if HEAD changed: `git rev-parse HEAD` → compare with `headBefore`
4. If HEAD changed (pr:resolve pushed new commits):
   - Output: "pr:resolve pushed fixes. Resuming monitoring for new CI and approval..."
   - Set `cooldownRemaining = 3`
   - Continue polling loop (go to 2.1)
5. If HEAD unchanged:
   - Exit to Phase 3 with status "approved"

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

**If `reviewDecision` is `APPROVED` AND all checks pass:**

1. Record current HEAD: `git rev-parse HEAD` → store as `headBefore`
2. Invoke `Skill(autopilot:pr-resolve)` to evaluate unresolved suggestions and nitpicks. The skill will exit early if no actionable comments remain. For each suggestion:
   - If reasonable and improves the code → fix it
   - If not applicable or doesn't make sense → reply explaining why
3. Check if HEAD changed: `git rev-parse HEAD` → compare with `headBefore`
4. If HEAD changed (pr:resolve pushed new commits):
   - Output: "pr:resolve pushed fixes. Resuming monitoring for new CI and approval..."
   - Set `cooldownRemaining = 3`
   - Continue polling loop (go to 2.1)
5. If HEAD unchanged:
   - Exit to Phase 3 with status "approved"

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

---

## Edge Cases

- **No PR found** → abort with suggestion to create one
- **PR already approved with all checks passing** → invoke pr:resolve, then exit only if HEAD unchanged (no new commits pushed)
- **pr:resolve pushes new commits on approved PR** → resume polling loop with cooldown (new CI must pass, approval may be stale)
- **PR merged during monitoring** → exit with merge message
- **PR closed during monitoring** → exit with close message
- **No reviewers assigned** → warn user, offer to continue or cancel
- **pr:resolve fails** → report error, ask user via AskUserQuestion: "Resolve review encountered an error. How would you like to proceed?" with options: Retry / Continue monitoring / Cancel
- **CI checks pending** → wait for completion, do not act
- **CI checks cancelled** → treat as pending (new run likely starting due to `cancel-in-progress`)
- **CI fix attempt fails** → report error, ask user in foreground / return summary in background
- **Max fix attempts reached (2 per check)** → mark check as unfixable, ask user
- **Empty logs from cancelled run** → skip fix, wait for new run to complete
- **Fix causes a different failure** → counts as a new attempt for that check
- **Post-push cooldown active** → skip CI check phase, only check review status
- **GitHub API rate limit (403/429)** → increase sleep interval to 120 seconds (2 minutes), warn user: "GitHub API rate limit detected. Increasing poll interval to 2 minutes."
- **Network error** → retry API call once after 30 seconds; if still failing, warn user and ask whether to continue

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Prefer stable references that never rot; render the same kind of reference the same way everywhere:

- Code identifiers and file names — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked specimen names the thing without a link that breaks when a file moves or a doc is restructured.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Other docs and sections — do NOT link a doc name or a section anchor; those rot the moment the doc is restructured. Inline a short gist of the point you need instead.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
