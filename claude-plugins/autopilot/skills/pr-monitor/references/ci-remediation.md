# CI remediation

Reference for [`pr-monitor/SKILL.md`](../SKILL.md) — the CI Fix Workflow, reached only when the watcher returns a [`checks_failed` event](../SKILL.md#the-event-contract). Read it at that point. On a pull request whose checks pass, it stays unread. Background mode does not run it at all.

## CI Fix Workflow

The event carries `checks.failed[]` — each entry a `name`, the `runId` that produced the failure, and a `url`. That list is the complete set of failures on the verified head; no separate check read is needed, and a failure whose run id the state already acknowledged never reaches this file.

Maintain `fixAttempts` across launches in the conversation: a map of `checkName → { attempts, lastRunId }`. Compare the event's `runId` with `fixAttempts[checkName].lastRunId` — a different run id means a new run, so reset `attempts` to 0 for that check.

**If `attempts < 2` for the failing check** (foreground mode only):

1. Output: "CI check '\<name\>' failed. Attempting fix (attempt N/2)..."
2. Get failure logs (truncate to last 200 lines). The run id comes from the event entry, so no URL parsing is involved:
   ```bash
   gh run view <run-id> --log-failed 2>&1 | tail -200
   ```
   If output is empty (cancelled run), output: "No logs available for cancelled run. Waiting for a new run..." and relaunch the watcher with `--ack <event-id>` rather than fixing.
3. Analyze the error output to determine fix type:
   - Lint errors → read files, apply fixes with Edit tool
   - Type errors → read files, fix type issues with Edit tool
   - Test failures → read test files, fix assertions/logic with Edit tool
4. After fixes, commit via `Skill(autopilot:commits-create)` and push:
   ```bash
   git push
   ```
   Read [`git-history-policy.md`](../../shared-rules/references/git-history-policy.md) before this push. A plain fast-forward is all this step is allowed to do: if the push is rejected as non-fast-forward, report it and stop rather than merging the base branch or force-pushing.
5. Update `fixAttempts[checkName] = { attempts: N+1, lastRunId: <run-id> }`
6. Relaunch the watcher with `--ack <event-id>` per [Phase 2](../SKILL.md#phase-2-launch-the-watcher). The push moved the head, so the watcher measures the new commit's checks from scratch — there is no cooldown to manage and no stale failure to wait out.

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
   - If "Skip this check": relaunch with `--ack <event-id>`, which marks that failure handled so the watcher stops reporting it and continues toward its terminal event
   - If "Cancel": stop monitoring
