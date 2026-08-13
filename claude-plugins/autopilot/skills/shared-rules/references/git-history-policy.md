<!-- git-history:start -->

### Git history policy

The canonical encoding of `CONTRIBUTING.md` for updating a pull-request branch — do not invent alternatives. Read it before running any command that changes history or rewrites a remote branch.

#### Never merge the base branch into a pull-request branch

Do not run `git merge main`, `git merge origin/main`, `git pull origin main`, or an equivalent merge from the configured default branch while on a topic branch. A merge commit pulls unrelated base changes into the pull request, inflates the diff far past the task, and contradicts the repository's rebase-only history.

#### Synchronizing an agent-owned branch

When an agent-owned pull-request branch genuinely needs the base branch's changes:

1. fetch the current base branch;
2. rebase the topic branch onto it;
3. push the rewritten branch only with `git push --force-with-lease`.

Never use bare `git push --force` or `git push -f`: without the lease, a push silently discards commits pushed by someone else since the last fetch.

#### Never rewrite a branch you do not own

Never rebase, amend, or force-push a shared or human-owned branch without explicit authorization from its owner. When branch ownership or safe-update semantics are uncertain, stop and report — a wrong guess destroys work that cannot be recovered from the remote.

#### A stale event is reported, never refreshed

A stale, superseded, or fail-closed `pull_request` check is a reporting condition, not a reason to change history. Do not merge or rebase base-branch changes into the task merely to produce a fresh `synchronize` event: the task did not require those changes, and the resulting diff misrepresents what the pull request does. Use the smallest scope-preserving operation repository policy allows, or stop and report the stale-event condition.

A push rejected as non-fast-forward is the same kind of condition. Report it; never resolve it by merging the base branch or by force-pushing without a lease.

#### Recovering from a base-branch merge

If a merge commit already exists on the branch, remove it rather than layering more history on top:

- `git rebase --onto <base-tip> <merge-commit> <branch>` replays only the branch's own commits onto the current base tip; or
- reset to the fork point and cherry-pick the branch's commits back.

Either way the branch is republished with `git push --force-with-lease`, and only when the branch is agent-owned.

#### Canonical forbidden-command regex

The prohibitions above compress into one executable pattern, exercised by the `gitHistoryPolicy` guard test so the rule is checkable rather than a matter of interpretation. Evaluate an intended command against it before running the command:

```text
\bgit\s+(?:merge|pull)\s+(?:\S+\s+)?(?:(?:origin|upstream)/)?(?:main|master)\b|\bgit\s+push\b[^\n]*?\s(?:--force(?![-\w])|-f(?![-\w]))
```

- The pattern is shape-only. It spells `main` and `master` because those are the names it can know; the rule binds whatever the repository configures as its default branch, which no regex can express — a base branch named otherwise is still forbidden.
- A match is a refusal, not a warning. Report the match, name the permitted alternative from [Synchronizing an agent-owned branch](#synchronizing-an-agent-owned-branch), and do not run the command.

**Forbidden commands:**

- `git merge main` — merges the base branch into the topic branch
- `git merge origin/main` — same, via the remote-tracking ref
- `git merge --no-ff origin/main` — an explicit merge commit is still a merge commit
- `git pull origin main` — `git pull` merges by default
- `git push --force` — no lease, so a concurrent push is silently discarded
- `git push -f origin issue-42-example` — the short form is the same command

**Permitted commands:**

- `git fetch origin main` — fetching never changes history
- `git rebase origin/main` — the sanctioned way to take base changes
- `git push --force-with-lease` — the only sanctioned rewrite of a remote branch
- `git push --force-with-lease --force-if-includes` — a stricter lease, still leased
- `git push -u origin issue-42-example` — an ordinary fast-forward push

<!-- git-history:end -->
