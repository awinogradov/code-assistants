# Background mode

Reference for [`pr-monitor/SKILL.md`](../SKILL.md) — the behaviour that replaces the foreground flow when there is no user to interact with. Read it only once [Phase 0](../SKILL.md#phase-0-mode-dispatch) has resolved the run as background. [`run`](../../run/SKILL.md) invokes this skill in the foreground, so on the autopilot chain this file stays unread.

## Behaviour

When invoked via the Agent tool with `run_in_background: true` (spawned by [Phase 0](../SKILL.md#phase-0-mode-dispatch) of this skill), the skill operates non-interactively. It still launches the packaged watcher exactly as [Phase 2](../SKILL.md#phase-2-launch-the-watcher) describes, with the same flags and the same acknowledgement contract — the watcher performs no writes in either mode, so nothing about the wait changes. What changes is [Phase 3](../SKILL.md#phase-3-handle-the-event): every non-terminal event becomes a report instead of an action.

- **Do NOT invoke** `Skill(autopilot:pr-resolve)` — the user is not available for interaction
- **Do NOT attempt to fix CI checks** — the user is not available for interaction and fixes may require judgment calls
- **Do NOT rebase, resolve, or push** — a history rewrite has no one to authorize it here; the [Conflict Sweep](../SKILL.md#conflict-sweep-shared-procedure) returns the summary below instead of acting
- **Do NOT use** `AskUserQuestion` — no user interaction in background mode
- **Do NOT relaunch the watcher.** A background run reports one event and stops. Because it never acknowledges that event, the next run — foreground or background — re-emits it, so nothing is lost by returning early.
- On `review_action_required`, return immediately with a structured summary instead of invoking pr-resolve. The event's `feedback[]` is the list to summarize:

  ```
  PR Monitor: Changes Requested

  PR #N has review feedback that needs attention.
  Status: CHANGES_REQUESTED
  URL: <pr-url>

  Run /pr-resolve to address the feedback.
  ```

- On `checks_failed`, return immediately with a structured summary, naming the checks from the event's `checks.failed[]`:

  ```
  PR Monitor: CI Checks Failed

  PR #N has failing CI checks.
  Failed: [check-name-1], [check-name-2]
  Status: CHECKS_FAILED
  URL: <pr-url>
  ```

- On `conflict`, return immediately with a structured summary:

  ```
  PR Monitor: Merge Conflict

  PR #N conflicts with <base-branch> and cannot merge.
  Status: CONFLICTING
  URL: <pr-url>

  Run /autopilot:pr-monitor in the foreground to rebase the branch onto its base.
  ```

- On `blocked`, return the event's `reason` verbatim — an operational blocker is never retried here:

  ```
  PR Monitor: Blocked

  PR #N monitoring cannot continue: <reason>.
  Status: BLOCKED
  Watcher state: <state-file>
  URL: <pr-url>
  ```

- For ready (`Status: READY_FOR_REVIEW`), approved, merged, and closed, return the same [Phase 4](../SKILL.md#phase-4-exit) exit message as foreground mode
