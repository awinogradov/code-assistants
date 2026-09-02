# Mode: plan and branch

Reference for [`preflight-check/SKILL.md`](../SKILL.md) — the checks only `plan` and `branch` modes run. Read it when the invoking skill passed one of those two modes, and read [`mode-commits-pr.md`](./mode-commits-pr.md) instead for the other two. One invocation is always one mode, so the other file's bytes never enter the conversation.

Both modes run before the working branch exists, which is why neither checks the branch-name format and neither treats an uncommitted change as a hazard.

## Compare with plan-mode issue ID

Runs inside [Phase 2b](../SKILL.md#phase-2b-branch-has-unmerged-commits), after the branch issue ID has been extracted, and only in `plan` mode. `branch` mode has no target issue to compare against and skips it.

Read the plan issue ID from the `/autopilot:plan` or `/autopilot:run` input earlier in conversation history. Normalize both the branch issue ID and the plan issue ID to lowercase.

- If the plan input type is "plain description" (no issue ID resolved), skip the comparison.
- If the IDs match, take the "Matching branch" row of the [feature-branch decisions](../SKILL.md#feature-branch-decisions) table.
- If they do not match, take the "Issue mismatch" row of that table.

## On main: fetch and offer to pull

Runs as [Phase 3](../SKILL.md#phase-3-on-main)'s mode-specific handling, after the working-tree check.

Run `git fetch origin`. If fetch fails (e.g., no remote origin), output "No remote 'origin' found. Skipping remote update check." and exit skill.

**If `isWorktree` is true:**

Output "Fetched latest refs from origin. Branch creation deferred to Pre-Implementation." (plan mode) or "Fetched latest refs from origin." (branch mode) and exit skill.

**If `isWorktree` is false:**

Check if local main is behind remote:

```bash
git rev-list HEAD..origin/main --count
```

- If count is 0: output "Branch main is up to date with origin." and exit skill.
- If count > 0, ask (header "Updates available"): local main is `<N>` commit(s) behind origin/main — pull the latest changes before <action noun>?
  - **Pull updates** — run `git pull origin main` to get the latest changes, output "Pulled latest changes from origin/main." and exit skill.
  - **Continue without pulling** — proceed against current local state: output "Continuing with local state (<N> commits behind origin)." and exit skill.
