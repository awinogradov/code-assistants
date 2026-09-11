# No-repository-change exit

If a verification required to establish the no-change result is user-deferred, stop with `Outcome: verification_deferred`, list the unrun checks, and report the observed repository state. Do not claim task completion, mark Deliver PR complete, or run forbidden checks. Resume verification only when authorized.

Otherwise take this exit only when all of the following are true:

1. The finalized plan explicitly requires no repository file changes.
2. Confirm that every implementation step and its `verify:` line passed. An empty diff alone is never evidence of completion. If any action or verification failed, stop and report the failed verification.
3. `git status --porcelain` produces no output.
4. `git diff --quiet origin/main...HEAD` exits successfully.
5. `git log --oneline origin/main..HEAD` produces no output.

If the plan expected repository changes but the diff is empty, the task is incomplete: report that mismatch and stop. If implementation discovered repository changes or topic commits, do not take this exit; create the deferred branch when needed and continue through Auto-Commit.

When every condition passes, do not invoke `branch-create`, `commits-create`, `git push`, `pr-create`, `pr-update`, or `pr-monitor`. Mark Deliver PR not applicable, then output:

```
Autopilot complete.
Outcome: no_repository_change
Summary: <what resolved the task>
Evidence:
- <verification or external-action receipt>
```

Otherwise return to [repository delivery](../SKILL.md#step-1-auto-commit).
