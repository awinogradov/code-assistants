# The PR watcher

> Chapter 20 of the [repository docs](../README.md#repository-docs).

Why PR monitoring no longer runs in the model, what the packaged watcher returns, and the acknowledgement contract that keeps a restart from losing or repeating work.

> Source of truth: [`lib/github/watch-pr.ts`](../claude-plugins/autopilot/lib/github/watch-pr.ts) (the CLI), [`prWatchLoop.ts`](../claude-plugins/autopilot/lib/github/prWatchLoop.ts) (the loop), [`prWatch.ts`](../claude-plugins/autopilot/lib/github/prWatch.ts) (the pure transforms), and [`pr-monitor/SKILL.md`](../claude-plugins/autopilot/skills/pr-monitor/SKILL.md) (the adapter).

## The problem: waking to decide nothing

The monitor used to poll from inside the model: sleep a minute, read the pull request, read the checks, decide nothing, sleep again. Every one of those wakeups re-read the whole conversation as input. A downstream audit of a single autopilot session measured seven isolated no-actionable-event wakeups accounting for 2,974 output tokens and 2,572,963 cache-read tokens — all of it spent to learn that CI was still running.

The cost is structural, not a tuning problem. A model that waits is charged for its context on every tick, so the fix is to move the waiting somewhere that has no context to re-read. A 30-second interval inside a process costs nothing; a 30-second interval across turns costs a conversation.

```
before                                   after
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ model: sleep 60               │        │ model: launch watcher         │
│ model: gh pr view   ← charged │        │   … waits inside one process  │
│ model: gh pr checks ← charged │        │       fetch → classify →      │
│ model: decide nothing         │        │       compare → sleep         │
│ … ×N, each re-reading context │        │ model: one JSON event ← wake  │
└───────────────────────────────┘        └───────────────────────────────┘
  N wakeups, N × context                   1 wakeup, 1 × context
```

## What the watcher does

One invocation is one wait. The loop repeats — read, verify, classify, decide, back off — and returns the moment a decision exists:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/github/watch-pr.ts" <owner/repo> <pr> \
  [--wait-for-approval] [--ack <event-id>] [--timeout <s>] [--interval <s>] \
  [--check-grace <s>] [--state-dir <dir>] [--expect-check <name>]...
```

It always exits 0 and always prints one JSON object, mirroring the other bundled helpers ([`fetch-issue.ts`](../claude-plugins/autopilot/lib/github/fetch-issue.ts), [`fetch-pr-reviews.ts`](../claude-plugins/autopilot/lib/github/fetch-pr-reviews.ts), [`digest-branch.ts`](../claude-plugins/autopilot/lib/git/digest-branch.ts)): a failure is a value in the payload, never a non-zero exit the caller has to interpret. Telemetry goes to stderr as one line; per-cycle diagnostics go to a pruned log beside the state file, never to stdout.

Every read is a read-only `gh api` call — `pulls/{n}`, `commits/{sha}/check-runs`, `commits/{sha}/status`, `pulls/{n}/reviews`, a paginated GraphQL `reviewThreads` query, `rules/branches/{base}`, and `contents/.github/workflows`. `gh pr checks --json` is deliberately not used: the audited CLI rejected that flag, and the REST endpoints carry strictly more information anyway. The watcher **never writes**: no pushes, merges, reruns, replies, or approval changes. Remediation stays in the skill, where the git history policy and the human are.

## The events

Nine events, in the precedence one snapshot resolves through. The first that applies is the one returned:

| Event                    | Meaning                                                              | Terminal |
| ------------------------ | -------------------------------------------------------------------- | -------- |
| `merged`                 | the pull request merged                                              | yes      |
| `closed`                 | closed without merging                                               | yes      |
| `conflict`               | `mergeable_state` is `dirty` against the base                        | no       |
| `checks_failed`          | one or more checks failed on the verified head                       | no       |
| `blocked`                | cannot continue; `reason` says why                                   | yes      |
| `review_action_required` | new or edited reviewer feedback, or a reopened thread                | no       |
| `approved`               | required human approvals satisfied (under `--wait-for-approval`)     | yes      |
| `ready_for_review`       | checks settled for the head, nothing unanswered (the default finish) | yes      |

`conflict` sits above `checks_failed` and both sit above approval for the same reason the old skill checked `CONFLICTING` before `APPROVED`: a conflicted pull request cannot merge however green or approved it looks, so exiting clean on it would hide the only thing that matters.

The payload is bounded — at most 20 failed checks, at most 20 feedback items with 400-character excerpts, `truncated` flags when a cap dropped something — so a busy pull request cannot flood the conversation it wakes.

## What counts as settled

The classification rules exist because every one of them is a way a naive reading gets it wrong:

- **Reruns supersede.** `check-runs` returns every attempt, so a cancelled or failed first run sits beside its green rerun. Runs reconcile to the newest per `(name, app)`; without that, a rerun repository reports permanent failure.
- **Cancelled is not failed, at first.** A cancelled run usually means a new push superseded it. It reads as pending until the check grace elapses (10 minutes by default), then as a failure — so a genuinely abandoned run does not hang the wait forever.
- **`skipped` and `neutral` pass; `failure`, `timed_out`, `action_required` and `stale` fail.** Queued and in-progress runs are pending, and so is `mergeable: null` / `mergeable_state: "unknown"`, which is the normal reading for a minute or two after any push.
- **Green is never inferred from an empty answer.** A head with no checks is settled only with explicit evidence that the repository has none — no `.github/workflows` on the base and no required-check policy. Otherwise it waits the grace period and then returns `blocked` with `no-checks-registered`, because "no checks reported" and "no checks configured" are different facts and only one of them is green.
- **Expected checks can be named.** `--expect-check <name>` adds a check the head must register, on top of whatever the base branch's ruleset requires. A ruleset read that fails is unknown, not empty: after five consecutive failures the watcher returns `blocked` with `policy-unreadable` rather than passing on a policy it could not read.
- **The head is verified twice.** Per-head reads are issued against the SHA from the opening read and the pull request is read again afterwards; if the head moved in between, the whole snapshot is discarded. This is what makes a stale green impossible — a push landing mid-collection can otherwise mix an old commit's checks with a new commit's identity.
- **Approval is human and counted.** Only the latest binding review per non-bot login counts, GraphQL `reviewDecision` must agree, and the base ruleset's `required_approving_review_count` sets the bar. A bot approval never satisfies a required human approval. A `CHANGES_REQUESTED` review stays binding — and is reported with the commit it was made on — until that same reviewer reviews again.

## Feedback detection

Waking on the wrong comment is as expensive as waking on nothing. Feedback is therefore derived from identity and versions rather than from timestamps of the poll:

- A review wakes when it is `CHANGES_REQUESTED`, or `COMMENTED` with a body, from a human other than the pull request author.
- A thread wakes when it is unresolved and its newest human activity is newer than the author's latest reply — `updatedAt`, so an **edited** comment counts as new — or when a thread previously seen resolved is unresolved again.
- Bots, the author's own replies, resolved threads, and linkback noise never wake anything.

Each item carries a deterministic key (`review:<id>`, `thread:<id>:<updatedAt>`, `thread:<id>:reopened:<commentId>`). Identical snapshots produce identical keys, which is what makes deduplication possible at all.

## State and acknowledgement

State lives at `<git common dir>/autopilot/pr-watch/<owner>__<repo>__<pr>.json` (override with `--state-dir`), beside a `.log` and a `.event.json` mirror of the last event. It holds the head and when it was first seen, the handled keys, the resolved threads, and the pending event.

The contract is two-step on purpose:

1. A non-terminal event is **delivered** and stored as pending. A restart before it is handled re-emits the same event, with the same `eventId`, without touching GitHub.
2. The caller relaunches with `--ack <event-id>` once it has acted. Only then do the event's keys become handled, and only handled evidence stops waking anyone.

Distinguishing delivered from handled is what makes a crash mid-remediation safe: nothing is lost, and nothing is reported twice. The handled-key list is pruned to 200 entries, so a long-lived pull request cannot grow the file without bound. Relaunching without `--ack` is a bug — the same evidence returns immediately and the loop spins.

## Failure, backoff, and cancellation

Waiting forever is its own failure mode, so every non-answer is budgeted. The interval starts at 30 seconds and backs off to 120 when consecutive snapshots are identical, resetting the moment anything changes. Rate limiting sleeps 300 seconds and blocks after six such cycles; consecutive transient errors block after eight; auth loss blocks immediately, because no amount of waiting fixes a missing credential. A recoverable network failure is never a failed check. `--timeout` (six hours by default) bounds the whole wait, and `SIGINT`/`SIGTERM` end the current sleep, flush state, and return `blocked` with `cancelled`.

## How the skill uses it

[`pr-monitor`](../claude-plugins/autopilot/skills/pr-monitor/SKILL.md) is now an adapter: detect the pull request once, launch the watcher with the Bash tool in the background, and let the turn end. The harness re-invokes the session when the process exits, and that notification is the wake — a foreground launch would be capped by the tool timeout, and polling the process from the model would restore the exact cost this removes. If a runtime cannot deliver a completion notification, the skill says so and fails loudly instead of falling back to a timer.

Then it acts on the one event: the Conflict Sweep on `conflict`, the CI fix workflow on `checks_failed`, `pr-resolve` on `review_action_required` — each followed by a relaunch carrying `--ack`. Background mode reports the event and stops without acknowledging, so the next run picks the work up where it was left.

## Tests

The three test files map to the three layers, and the split is what keeps the assertions honest:

| File                                                                                | Proves                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`prWatch.test.ts`](../claude-plugins/autopilot/lib/github/prWatch.test.ts)         | classification and decision: reruns, cancellations, empty and missing checks, pagination, mergeability, feedback keys, bounds, state |
| [`prWatchLoop.test.ts`](../claude-plugins/autopilot/lib/github/prWatchLoop.test.ts) | the wait itself, on a fake clock: one event per run, hours of simulated waiting, backoff, error budgets, cancellation, restart       |
| [`watchPr.test.ts`](../claude-plugins/autopilot/lib/github/watchPr.test.ts)         | the real process against a `gh` shim: one stdout object, the state files, the `--ack` round trip                                     |

The loop test is the one that speaks to the issue directly: a pending → pending → ready run advances a fake clock past an hour and asserts a single returned event and zero intermediate output. What CI cannot prove is the token bill; what it can prove is that the process returns once, which is the mechanism the bill depends on.
