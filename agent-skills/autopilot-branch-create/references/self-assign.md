# Self-Assign Execution Steps

Reference for [`branch:create/SKILL.md`](../SKILL.md) [Phase 2](../SKILL.md#phase-2-fetch-github-issue) step 5 — the command algorithm behind the self-assign status line.

<!-- The six-string status vocabulary stays in sync with [resolve-issue-context.md Phase 2](../../autopilot-resolve-issue-context/SKILL.md#phase-2-auto-assign-current-user-opt-in); the command steps below are this file's own. -->

Resolve it with these steps:

1. Resolve the authenticated login (cached 5 minutes):

   ```bash
   LOGIN=$(gh api user --cache 5m --jq .login 2>/dev/null)
   ```

   If `LOGIN` is empty → `unassigned — gh not authenticated`; continue to [Phase 3](../SKILL.md#phase-3-generate-branch-slug).

2. If the issue `state` from step 2 is `CLOSED` → `unassigned — issue closed`; continue to [Phase 3](../SKILL.md#phase-3-generate-branch-slug).

3. Check whether `LOGIN` is already assigned. GitHub logins are `[A-Za-z0-9-]`, so the login is safe to interpolate into a single `gh --jq` expression (gh's `--jq` cannot take `--arg`); `.assignees[]?` tolerates a null or absent array:

   ```bash
   ALREADY=$(gh issue view <ISSUE-NUMBER> -R "$REPO" --json assignees --jq "any(.assignees[]?; .login==\"$LOGIN\")" 2>/dev/null)
   ```

   If `ALREADY == "true"` → `@<LOGIN> (already assigned)`; continue to [Phase 3](../SKILL.md#phase-3-generate-branch-slug).

4. Otherwise attempt the assignment, capturing stderr and exit code (keep this order; read `$?` on the very next line):

   ```bash
   STDERR=$(gh issue edit <ISSUE-NUMBER> -R "$REPO" --add-assignee "$LOGIN" 2>&1 >/dev/null)
   EDIT_EXIT=$?
   ```

5. **Only when `EDIT_EXIT == 0`**, post-verify with a fresh read, because `gh issue edit --add-assignee` returns exit 0 even when GitHub silently drops the addition (caller lacks `triage`/`write` permission, or the issue is at the 10-assignee limit). When `EDIT_EXIT != 0` the edit never landed, so skip this read and emit `unassigned — gh edit error: <first line of $STDERR>` directly:

   ```bash
   VERIFIED=$(gh issue view <ISSUE-NUMBER> -R "$REPO" --json assignees --jq "any(.assignees[]?; .login==\"$LOGIN\")" 2>/dev/null)
   ```

   - `EDIT_EXIT == 0` AND `VERIFIED == "true"` → `@<LOGIN> (just assigned)`
   - `EDIT_EXIT == 0` AND `VERIFIED != "true"` → `unassigned — permission denied or assignee limit reached`
   - `EDIT_EXIT != 0` → `unassigned — gh edit error: <first line of $STDERR>`

In all cases, continue to [Phase 3](../SKILL.md#phase-3-generate-branch-slug).
