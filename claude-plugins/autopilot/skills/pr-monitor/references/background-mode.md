# Background mode

Reference for [`pr-monitor/SKILL.md`](../SKILL.md) — the behaviour that replaces the foreground flow when there is no user to interact with. Read it only once [Phase 0](../SKILL.md#phase-0-mode-dispatch) has resolved the run as background. [`run`](../../run/SKILL.md) invokes this skill in the foreground, so on the autopilot chain this file stays unread.

## Behaviour

When invoked via the Agent tool with `run_in_background: true` (spawned by [Phase 0](../SKILL.md#phase-0-mode-dispatch) of this skill), the skill operates non-interactively:

- **Do NOT invoke** `Skill(autopilot:pr-resolve)` — the user is not available for interaction
- **Do NOT attempt to fix CI checks** — the user is not available for interaction and fixes may require judgment calls
- **Do NOT rebase, resolve, or push** — a history rewrite has no one to authorize it here; the [Conflict Sweep](../SKILL.md#conflict-sweep-shared-procedure) returns the summary below instead of acting
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

- For approved/merged/closed, return the same [Phase 3](../SKILL.md#phase-3-exit) exit message as foreground mode
