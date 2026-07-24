# Pre-Implementation branch blocks

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md).

The plan file's `## Pre-Implementation` section is what creates the branch after approval. Pick the body by input type, then by caller: `plan` prompts for confirmation, `run` passes `--autopilot` to suppress it (invoking `/autopilot:run` is itself the authorization).

Each fenced block below is the literal section body to insert into the plan file.

## When to emit it

Check three things:

1. Current branch — `git branch --show-current`.
2. Worktree — `git rev-parse --git-dir` and `git rev-parse --git-common-dir`; differing values mean `isWorktree = true`.
3. Whether the branch holds real unmerged work. Read `isStaleMerged` from the Context Map's git state rather than testing `git log origin/main..HEAD` for emptiness: a branch whose commits already landed upstream under rebase-rewritten SHAs still shows a non-empty log, and a caller testing only emptiness reads a finished branch as active work.

Emit `## Pre-Implementation` when on `main`, **or** when in a worktree whose branch has no genuine unmerged work (`isStaleMerged` is true, or there are no commits ahead of the base). When `isStaleMerged` is true, the block must also re-sync `main` first — the branch is finished, and branching from it would carry stale history.

Otherwise omit the section: the session is already on a feature branch with active work.

Insert it directly below the `# <Title>` line and above `## Summary`.

## GitHub issue

Bare number, `#`-prefixed number, or GitHub issue URL.

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with the resolved issue number (e.g., `42` for `#42`). The branch-create skill fetches the issue, generates an `issue-<number>-<slug>` branch name, and prompts the user to confirm before creation. Do NOT present a Hotfix/Trivial/Maintenance prefix prompt — issue inputs always use the `issue-<number>-<slug>` convention so the PR can link back via `Closes #<number>`.
```

**run variant:** pass `<issue-number> --autopilot`. The flag suppresses branch-create's Phase 5 confirmation so the branch is created directly. Conflict resolution still surfaces if the branch already exists.

## Linear issue

A Linear id such as `ENG-123`, or a Linear issue URL.

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with arguments `<LINEAR-ID> --start` (e.g., `ENG-123 --start`). The branch-create skill fetches the ticket, generates a `<team>-<number>-<slug>` branch name, moves the ticket to "In Progress" via `--start` (best-effort — it never blocks branch creation), and prompts the user to confirm before creation. Do NOT present a Hotfix/Trivial/Maintenance prefix prompt — Linear inputs always use the `<team>-<number>-<slug>` convention so the PR can link back via `Closes <LINEAR-ID>`.
```

**run variant:** pass `<LINEAR-ID> --start --autopilot`. `--start` mirrors how GitHub issues are auto-assigned the moment work begins.

## Code-scanning alert

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with `--security "<slug>"`, where `<slug>` paraphrases the resolved alert's rule/file (e.g., `tainted-format-string`). The branch-create skill creates a `security-<slug>` branch (the alert is NOT a GitHub issue, so the `issue-<number>-<slug>` form does not apply and no `Closes #` is emitted). The branch name MUST be approved by the user via AskUserQuestion before creation — do not create the branch directly with git commands.
```

**run variant:** pass `--security "<slug>" --autopilot`. The PR records the alert reference instead of a `Closes #` line.

## Plain description

```
## Pre-Implementation

Choose a branch type for this change using AskUserQuestion:

Tool parameters:
- `question`: "Choose a branch type for this change."
- `header`: "Branch type"
- `options`: [
  { label: "Hotfix", description: "Emergency production fix (hotfix-<slug>)" },
  { label: "Trivial", description: "Typos, docs, formatting (trivial-<slug>)" },
  { label: "Maintenance", description: "Deps, CI, configs (maintenance-<slug>)" }
  ]
- `multiSelect`: false

Then invoke `Skill(autopilot:branch-create)` with `--<chosen-prefix> "<description>"`, where `<description>` is a short summary derived from the user description. The branch name MUST be approved by the user via AskUserQuestion before creation — do not skip approval or create the branch directly with git commands.
```

**run variant:** append `--autopilot` to the branch-create arguments. The branch-type pick is the one prompt `run` keeps — a special-prefix type cannot be inferred from a free-form description.
