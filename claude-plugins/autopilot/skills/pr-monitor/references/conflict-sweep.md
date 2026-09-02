# Conflict sweep

Reference for [`pr-monitor/SKILL.md`](../SKILL.md) — the shared procedure for a pull request whose `mergeable` is `CONFLICTING`. Read it at the moment either caller reports that state: the [§1.1](../SKILL.md#11-early-exit-checks) pre-loop check or the [§2.2](../SKILL.md#22-check-pr-state) per-cycle check. A pull request that never conflicts never reaches it.

## Procedure

Run whenever `mergeable` is `CONFLICTING` — from the [§1.1](../SKILL.md#11-early-exit-checks) pre-loop check or the [§2.2](../SKILL.md#22-check-pr-state) per-cycle check. Only the follow-up outputs and continue targets differ, and those stay with each caller.

`mergeable` is `UNKNOWN`, not `CONFLICTING`, whenever GitHub has not finished computing mergeability — which is the normal reading for the first cycle or two after any push. `UNKNOWN` is a pending state: leave it to the next poll and do not sweep on it.

Read [`git-history-policy.md`](../../shared-rules/references/git-history-policy.md) before running any command below. Every step of this sweep is the policy's sanctioned synchronization path and nothing else: a conflicting branch is the one condition under which a pull-request branch genuinely needs its base's changes, and it is taken by rebase, never by merging the base in.

1. **Background mode returns instead of acting.** Emit the `Status: CONFLICTING` summary from [background mode](./background-mode.md) and stop. A background run has no user to authorize a history rewrite, so it never fetches, rebases, or pushes.
2. **Refuse and exit when the sweep is not the agent's to run.** Each of these ends monitoring at [Phase 3](../SKILL.md#phase-3-exit) with status "conflicted", naming the reason — none is retried:
   - `git status --porcelain` is non-empty — a rebase would fail or silently strand the changes.
   - A rebase is already in progress (`git rev-parse --git-path rebase-merge` or `rebase-apply` exists) — never start a second one on top.
   - `headRepositoryOwner` differs from the pull request's own repository: a fork branch the agent cannot push to.
   - The pull request's `author.login` is not the login `gh api user --jq .login` reports. This is the policy's "never rewrite a branch you do not own" made checkable. Note that under a workflow `GITHUB_TOKEN` the authenticated identity is the bot rather than the account that opened the pull request, so the sweep is inert in CI by design.
3. **Pin the lease.** Record `git rev-parse origin/<headRefName>` as `preRebaseSha` before anything changes. The push in step 5 leases against this exact value; a bare `--force-with-lease` is anchored to whatever the local tracking ref happens to hold, and any unrelated fetch re-anchors it and quietly degrades the push to the unleased `--force` the policy forbids.
4. **Take the base changes by rebase:**
   ```bash
   git fetch origin <baseRefName>
   git rebase origin/<baseRefName>
   ```
5. **A rebase that completes cleanly** pushes with the pinned lease, sets `cooldownRemaining = 3`, and returns to the caller:
   ```bash
   git push --force-with-lease=<headRefName>:<preRebaseSha>
   ```
   Any push failure is terminal: report it and exit to [Phase 3](../SKILL.md#phase-3-exit) with status "conflicted". Never retry it, and never retry it without the lease.
6. **A rebase that halts aborts immediately** — the working tree is never left mid-rebase:
   ```bash
   git diff --name-only --diff-filter=U   # capture the conflicted paths first
   git rebase --abort
   ```
   Report the conflicted paths and `preRebaseSha`, then hand to step 7.
7. **Only in foreground mode**, offer the halted rebase to the user via AskUserQuestion — mirroring the CI-unfixable prompt in [§2.2a](../SKILL.md#22a-check-ci-status). Resolving conflicted hunks is a judgement call about intent, so it happens because the user asked for it, never because the sweep decided on its own. That is why step 6 aborts first.
   - `question`: "PR #N conflicts with \<baseRefName\> and the rebase could not complete.\n\nConflicted paths: \<paths\>\nBranch head before rebase: \<preRebaseSha\>"
   - `header`: "Conflict"
   - `options`: [
     { label: "Resolve conflicts", description: "Rebase again and resolve the conflicted hunks, then push" },
     { label: "Stop monitoring", description: "Leave the branch untouched and exit" }
     ]
   - `multiSelect`: false
   - If "Resolve conflicts": re-run step 4, resolve each conflicted path, `git add` it, `git rebase --continue` until the rebase finishes, then push per step 5.
   - If "Stop monitoring": exit to [Phase 3](../SKILL.md#phase-3-exit) with status "conflicted".
