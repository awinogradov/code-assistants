# CI remediation

Reference for [`pr-monitor/SKILL.md`](../SKILL.md) — the CI Fix Workflow, reached only when a check reports `bucket === "fail"`. Its callers are [§1.1](../SKILL.md#11-early-exit-checks) and [§2.2a](../SKILL.md#22a-check-ci-status); read it at that point. On a pull request whose checks pass, it stays unread.

## CI Fix Workflow

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
   Read [`git-history-policy.md`](../../shared-rules/references/git-history-policy.md) before this push. A plain fast-forward is all this step is allowed to do: if the push is rejected as non-fast-forward, report it and stop rather than merging the base branch or force-pushing.
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
