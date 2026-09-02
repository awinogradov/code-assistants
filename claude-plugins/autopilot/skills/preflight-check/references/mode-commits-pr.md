# Mode: commits and pr

Reference for [`preflight-check/SKILL.md`](../SKILL.md) — the checks only `commits` and `pr` modes run. Read it when the invoking skill passed one of those two modes, and read [`mode-plan-branch.md`](./mode-plan-branch.md) instead for the other two. One invocation is always one mode, so the other file's bytes never enter the conversation.

Both modes run against a branch that already holds work, so both guard the branch itself rather than the base.

## Check branch name format (commits mode only)

Runs at the top of [Phase 2](../SKILL.md#phase-2-on-feature-branch), before the merged-branch check.

If mode is `commits`, read the canonical branch-name regex from [`pr-title-grammar.md`](../../shared-rules/references/pr-title-grammar.md) and check `currentBranch` against it and against the length bounds beside it (5–100 characters) — an overlong name fails CI's `max_length` check just like a shape violation. `pr` mode skips this check because `pr-create` validates the branch itself in its Phase 1 (one owner per gate, no double prompt).

If the name does not match, ask (header "Branch name"): branch `<currentBranch>` does not follow the naming convention and would fail the contributing-check CI once a PR is open, where the only fix is a fresh branch and a fresh PR — how to proceed?

- **Continue anyway** — commit on this branch at the user's explicit request: continue to the merged-branch check.
- **Cancel** — stop so the branch can be fixed while no PR exists and the rename is still free: output "Commit cancelled. Branch <currentBranch> does not follow the naming convention — re-create it with /autopilot:branch-create (uncommitted changes follow the checkout) or rename it with git branch -m, then retry." and abort.

## Check working tree (pr mode only)

Runs at the top of [Phase 2](../SKILL.md#phase-2-on-feature-branch), before the merged-branch check.

If mode is `pr`, run:

```bash
git status --porcelain
```

If the output is non-empty, ask (header "Uncommitted"): uncommitted changes were detected on `<currentBranch>` — how to proceed before opening the pull request?

- **Commit first** — run `/autopilot:commits-create` before creating the PR: invoke `Skill(autopilot:commits-create)`, then continue to the merged-branch check.
- **Continue anyway** — create the PR without committing these changes: continue to the merged-branch check.
- **Cancel** — stop so the user can handle changes first: output "Pull request cancelled. Commit or stash changes first." and abort.

`commits` mode skips this check — uncommitted changes are what it exists to commit.

## On main: warn instead of pulling

Runs as [Phase 3](../SKILL.md#phase-3-on-main)'s mode-specific handling, after the working-tree check.

Creating a commit or PR directly from `main` is almost always wrong. Do not fetch or pull. Ask (header "On main"): creating a <action noun> directly on main is usually wrong; to switch to a feature branch, cancel and run `/autopilot:branch-create` before retrying — how to proceed?

- **Continue on main** — proceed anyway (hotfix/maintenance/trivial cases): output "Continuing on main." and exit skill.
- **Cancel** — stop so the user can run `/autopilot:branch-create` first: output "<Action noun> cancelled. Run /autopilot:branch-create to switch to a feature branch, then retry." and abort.
