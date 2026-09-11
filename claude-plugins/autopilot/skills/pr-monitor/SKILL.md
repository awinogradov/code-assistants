---
name: pr-monitor
description: Monitor a PR for CI check status, review feedback, and merge conflicts until it is ready for human review, approved, or merged. A packaged watcher waits for the pull request and wakes the agent only for an actionable event, so the model stays dormant through ordinary pending CI. Fixes CI failures, resolves review feedback, and rebases a conflicting branch onto its base; pass --wait-for-approval to keep waiting until a human approves. Use when a pull request is open and needs to reach its hand-off.
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
  - AskUserQuestion
  - Skill(autopilot:pr-resolve)
  - Skill(autopilot:commits-create)
---

# PR Monitor

Monitor a pull request until the agent's obligations for its current head are complete. The waiting itself is done by a packaged watcher, [`watch-pr.ts`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/lib/github/watch-pr.ts), which fetches, classifies and sleeps inside one process and returns exactly one bounded JSON event. This skill launches it, acts on that event — running `pr-resolve` when feedback needs answering, fixing CI failures, rebasing a conflicting branch — acknowledges what it handled, and relaunches. It ends with a distinct **ready for human review** outcome once checks have settled for the head and no feedback stands against it. Approval and merge are asynchronous follow-ups, not part of the wait, unless `--wait-for-approval` asks for them. This skill never merges a pull request.

**The model does not poll.** There is no `sleep`, no periodic snapshot, and no agent watching a process: ordinary pending CI, unknown mergeability, a growing count of passing jobs and already-answered comments all stay inside the watcher, which returns only when something needs a decision. Every wake costs a full re-read of the conversation, so a wake that decides nothing is pure waste — that is the defect this design removes.

## When to Use

- After opening a PR, to carry it to the hand-off — the `run` chain invokes it this way
- When a user invokes `/autopilot:pr-monitor` to launch a background monitor
- With `--wait-for-approval`, when a session must block until a human approves

## Input

Arguments: `$ARGUMENTS`

Expected flags (all optional):

- `--background` — launch as a background agent (non-interactive mode described below). When omitted and the skill is invoked directly by a user, run foreground mode. When invoked from another skill/agent (e.g., via the Agent tool with `run_in_background: true`), the calling context supplies the background signal — treat that equivalently to `--background`.
- `--wait-for-approval` — completion policy, independent of the execution mode: keep waiting past readiness until the PR is approved with all checks passing, merged, or closed. Without it, `ready_for_review` is the terminal event; [`run`](../run/SKILL.md) never passes it. The flag is passed straight through to the watcher.

## Input resolution

Arguments are optional. Resolve each field:

- **Mode (foreground vs background)** — `$ARGUMENTS` flag → calling context (if invoked via Agent tool with `run_in_background: true`, use background) → default foreground. Do NOT prompt.
- **Completion policy** — `$ARGUMENTS` flag → default ready-for-review hand-off. Do NOT prompt.
- **PR number** — detect via `gh pr view` on the current branch ([Phase 1](#phase-1-detect-pr)). Abort with a clear message if no PR exists.

## Phase 0: Mode Dispatch

If `$ARGUMENTS` contains `--background` AND the skill was invoked directly (not already running inside an Agent subprocess), re-launch itself as a background agent and exit the current turn:

```
Use the Agent tool with:
- `subagent_type`: "general-purpose"
- `prompt`: "Invoke Skill(autopilot:pr-monitor). Monitor the PR in background mode — launch the packaged watcher and report the event it returns, but do NOT invoke pr-resolve interactively, fix CI checks, or rebase. Return the structured summary for whatever event arrives."
- `description`: "Monitor PR reviews"
- `run_in_background`: true
```

Output: "PR monitoring started in the background. You'll be notified when the review status changes." Then return — do NOT continue to [Phase 1](#phase-1-detect-pr) in the launching turn.

Otherwise (no `--background` flag, or already inside an Agent subprocess), continue to [Phase 1](#phase-1-detect-pr).

## Execution Modes

This skill supports two modes. Both launch the same watcher with the same flags; they differ only in what happens to the event it returns.

### Foreground Mode (default)

Interactive — blocks the conversation, invokes `pr-resolve` when feedback needs answering, and automatically fixes CI failures, then relaunches the watcher.

### Background Mode

There is no user to interact with, so the skill reports instead of acting: it never invokes [`pr-resolve`](../pr-resolve/SKILL.md), never attempts a CI fix, never rewrites history, and never calls `AskUserQuestion`. On `checks_failed`, `review_action_required`, `conflict`, or `blocked` it returns immediately with a structured summary; `ready_for_review`, `approved`, `merged`, and `closed` return the same [Phase 4](#phase-4-exit) exit message as foreground mode.

Read [`references/background-mode.md`](./references/background-mode.md) for those summary formats before emitting one.

**Detect background mode** per [Phase 0](#phase-0-mode-dispatch): use background behavior when the skill was launched with `--background`, when it runs inside an Agent subprocess, or when this prompt contains "background mode"; otherwise use foreground behavior.

## Context

This skill receives the following from conversation history:

- **PR number** (optional): if provided, use directly; otherwise detect from current branch

## Phase 1: Detect PR

Auto-detect the PR from the current branch — one read, since the watcher owns every read after this:

```bash
gh pr view --json number,title,url,state,baseRefName,headRefName,headRefOid,headRepositoryOwner,author,mergeable
```

If no PR found, abort: "No pull request found for the current branch. Create one first with `/autopilot:pr-create`."

Store PR number, owner/repo (extract from url), title, `author.login`, and `headRepositoryOwner` — the [Conflict Sweep](#conflict-sweep-shared-procedure) needs the last two to tell a branch it may rewrite from one it may not. `state` and `mergeable` are read here only to abort early on a merged or closed pull request; every later reading of them comes from the watcher, which verifies them against the head it measured.

## Phase 2: Launch the Watcher

Launch once per event, never on a timer:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/github/watch-pr.ts" <OWNER>/<REPO> <PR_NUMBER> [--wait-for-approval] [--ack <event-id>]
```

`${CLAUDE_PLUGIN_ROOT}` is the plugin root Claude Code provides to plugin components; when it is unset, resolve the script from this skill's base directory instead: `<skill base directory>/../../lib/github/watch-pr.ts`.

**Run it in the background and wait for its completion notification.** Use the Bash tool with `run_in_background: true`, then let the turn end: the harness re-invokes the session when the process exits, and that notification is the wake. Do NOT set a foreground timeout and poll, do NOT run `sleep`, and do NOT delegate the wait to an Agent that checks on the process — each of those reintroduces the model-driven polling this skill exists to remove.

A wait can exceed any foreground tool timeout, so the background launch is the only supported form. If the runtime in use cannot deliver a completion notification for a background process, say so and fail loudly rather than falling back to polling: launch with `--timeout <seconds>` no greater than the foreground limit, report the resulting `blocked` event with reason `deadline` as an operational blocker, and let the caller decide. Never paper over a missing notification by waking on a timer.

The watcher performs **no writes**: no code edits, pushes, merges, CI reruns, review replies, or approval changes. Remediation is this skill's job, and it stays bound by [`git-history-policy.md`](../shared-rules/references/git-history-policy.md) — the [Conflict Sweep](#conflict-sweep-shared-procedure)'s rebase and lease-pinned push are the policy's one sanctioned synchronization path, and the CI fix push is a plain fast-forward or nothing. Neither may merge the base branch into the pull request.

### The Event Contract

The watcher prints one JSON object (`schemaVersion: 1`) carrying `event`, `eventId`, `reason`, `repo`, `pr`, `url`, `headSha`, `headVerified`, `base`, `checks` (`failed[]` with `name`/`runId`/`url`, `pending`, `passed`, `missing`, `note`, `truncated`), `feedback[]` (each with `key`, `kind`, `reviewer`, `path`, `line`, `body`, `url`, `edited`, `reopened`), `feedbackTruncated`, `review` (`decision`, `approvedBy`, `changesRequestedBy`, `humanApproval`), `mergeability`, `terminal`, and `state` (the state and log file paths). Full field semantics are in [the watcher chapter](https://github.com/awinogradov/code-assistants/blob/main/docs/20-pr-watcher.md).

Nine events, in the precedence the watcher applies to one snapshot:

| Event                    | Meaning                                                                          | Terminal |
| ------------------------ | -------------------------------------------------------------------------------- | -------- |
| `merged`                 | the pull request merged                                                          | yes      |
| `closed`                 | the pull request was closed unmerged                                             | yes      |
| `conflict`               | `mergeable_state` is `dirty` against the base                                    | no       |
| `checks_failed`          | one or more checks failed on the verified head                                   | no       |
| `review_action_required` | new or edited reviewer feedback, or a thread reopened                            | no       |
| `blocked`                | the watcher cannot continue; `reason` says why                                   | yes      |
| `approved`               | the base branch's required human approvals are satisfied (`--wait-for-approval`) | yes      |
| `ready_for_review`       | checks settled for the head and no feedback stands unanswered                    | yes      |

Two properties the caller depends on. **Evidence is per head**: `headSha` is re-read after collection and `headVerified` says the snapshot describes one commit, so a push mid-fetch can never produce a stale green or a stale red. **Events deduplicate**: a non-terminal event stays pending in the watcher's state file until this skill relaunches with `--ack <event-id>`, so a restart re-emits work nobody handled and never repeats work somebody did. Acknowledging is therefore how remediation ends, not an optional extra.

### Conflict Sweep (shared procedure)

Run on a `conflict` event. The procedure is in [`references/conflict-sweep.md`](./references/conflict-sweep.md); read it at that point. Only the follow-up outputs and continue targets differ between callers, and those stay with each caller.

Count the sweeps: they are capped at **2 per `pr-monitor` invocation**. The cap is run-scoped and deliberately **not** keyed to the base SHA: a per-SHA budget is refunded by every new commit to the base, so on an active repository it would fund unbounded force-pushes and CI reruns forever — this skill's original defect reappearing one layer up. Reaching the cap exits to [Phase 4](#phase-4-exit) with status "conflicted".

`mergeable` is `UNKNOWN`, not `CONFLICTING`, whenever GitHub has not finished computing mergeability. The watcher classifies that as pending and keeps waiting, so a `conflict` event is always a confirmed conflict and never needs a second opinion before sweeping.

## Phase 3: Handle the Event

Handle exactly the event that arrived, then either exit or relaunch. Background mode replaces every action below with the matching summary from [`references/background-mode.md`](./references/background-mode.md) and stops.

**`merged` / `closed` / `approved` / `ready_for_review`** — exit to [Phase 4](#phase-4-exit) with that status. Nothing is acknowledged: a terminal event ends the monitor.

**`blocked`** — exit to [Phase 4](#phase-4-exit) with status "blocked", naming `reason`. `auth` means credentials are gone, `rate-limited` and `transient-errors-exhausted` mean GitHub kept refusing reads, `policy-unreadable` means the base branch's required-check policy could not be read, `no-checks-registered` and `expected-check-missing` mean a head that should carry checks never got them, `deadline` and `cancelled` mean the wait ended without a verdict. None is retried automatically — an operational blocker is reported to a human.

**`conflict`** — output "PR #N conflicts with \<base\>. Running the conflict sweep…", increment the sweep count, then run the [Conflict Sweep](#conflict-sweep-shared-procedure). If it pushed a rebased branch, relaunch the watcher with `--ack <event-id>`; the new head is measured fresh. If it refused, aborted, or its push failed, exit to [Phase 4](#phase-4-exit) with status "conflicted".

**`checks_failed`** — run the CI Fix Workflow in [`references/ci-remediation.md`](./references/ci-remediation.md); read it now. It owns the per-check attempt accounting (keyed by each failed check's `runId` from the event), the log analysis and fix push, and the AskUserQuestion escalation once a check has failed two fix attempts. A check whose failure is about a stale or superseded event rather than about the code is reported to the user, never refreshed by changing the branch. After a fix push, relaunch with `--ack <event-id>`.

**`review_action_required`** — the event's `feedback[]` is the complete list of what is new; the watcher detected it deterministically from ids, versions and thread state, and judging what it means is this skill's job. Record `git rev-parse HEAD`, invoke `Skill(autopilot:pr-resolve)` to evaluate the suggestions — fix what improves the code, reply explaining why where it does not — then compare HEAD.

- If HEAD changed, relaunch with `--ack <event-id>`: new CI must pass and any approval may be stale.
- If HEAD did not change and every item was answered without code changes, relaunch with `--ack <event-id>` as well; the answers stand and the watcher moves on to readiness.
- If a `CHANGES_REQUESTED` review is still bound to the head after that pass, the reviewer's decision stands until they re-read: exit to [Phase 4](#phase-4-exit) with status "changes-requested" rather than looping on a verdict nothing can change.

Relaunching without `--ack` is a bug: the same evidence returns immediately and the loop spins.

## Phase 4: Exit

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

**Blocked:**

```
PR Monitor Stopped

PR #N monitoring cannot continue: <reason>.
Status: BLOCKED
Watcher state: <state-file>
URL: <pr-url>
```

---

## Edge Cases

Cases the phases do not already cover:

- **The watcher cannot be launched** (missing runtime, unresolved plugin root) → report the failure and stop; never substitute a hand-written polling loop
- **No completion notification for background processes** → report it and stop, per [Phase 2](#phase-2-launch-the-watcher); a timer-based wait is not an acceptable substitute
- **pr-resolve fails** → report error, ask user via AskUserQuestion: "Resolve review encountered an error. How would you like to proceed?" with options: Retry / Continue monitoring / Cancel
- **CI fix attempt fails** → report error, ask user in foreground / return summary in background
- **Fix causes a different failure** → counts as a new attempt for that check
- **Verdict on the head survives pr-resolve** → exit "changes-requested"; the same verdict must never re-trigger pr-resolve on the next launch
- **Rebase halts on conflicting content** → abort it, report the conflicted paths, and offer resolution in foreground only; never leave the tree mid-rebase
- **Push after a sweep fails for any reason** → report and exit to [Phase 4](#phase-4-exit) with status "conflicted"; never retry, and never retry without the lease
- **Conflicting PR on a fork, or one the agent does not own** → report and exit "conflicted"; the branch is not the agent's to rewrite
- **Conflict sweep cap reached** → report and exit "conflicted" rather than sweeping again
- **Rate limiting or a network outage** → the watcher backs off inside the process and returns `blocked` only once its budget is spent; report that, do not retry in a loop
- **A stale watcher state file** → the event's `state.file` names it; deleting it restarts acknowledgement from scratch and re-reports outstanding work, which is safe but noisy

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
