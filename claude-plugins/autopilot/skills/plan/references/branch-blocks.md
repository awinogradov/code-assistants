# Pre-Implementation branch blocks

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md).

The plan file's `## Pre-Implementation` section is the branch step, run first after approval. Pick the body by input type. Whether the user is asked to confirm the name depends on that input type, not on the caller: an issue-derived name is created directly, while a special-prefix name — whose prefix and slug come from a free-form description — is confirmed. Only the input types that still carry a confirmation have a `run` variant, which passes `--autopilot` to suppress it (invoking `/autopilot:run` is itself the authorization).

Each input type below carries two parts. The **fenced block** is the literal section body to insert into the plan file: prose stating which branch appears and why it matters, because the plan file is what the reader approves (see the **Plan file is output, not instructions** rule in [`plan/SKILL.md`](../SKILL.md#plan-file-is-output-not-instructions)). The **Mechanics** paragraph beside it is the invocation the caller runs after approval — it never reaches the plan file. Read it when executing the block; do not copy it in.

Because the flags now live in Mechanics rather than in the inserted text, all four bodies are identical for `plan` and `run`. A `run` variant is a different argument at execution time, not a different section body.

Prompts composed from a Mechanics paragraph follow [`askuserquestion-format.md`](../../shared-rules/references/askuserquestion-format.md) — read it before composing the `question` parameter.

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

Work happens on a new `issue-<number>-<slug>` branch created from an up-to-date `main`, so the pull request can close issue #<number> on merge.
```

**Mechanics:** invoke `Skill(autopilot:branch-create)` with the resolved issue number (e.g. `42` for `#42`). It fetches the issue, derives the `issue-<number>-<slug>` name, and creates the branch directly — the name comes from an issue the user already chose, so it is not confirmed. Do not present a Hotfix/Trivial/Maintenance prefix prompt; issue inputs always use this convention.

**No run variant** — the same arguments for both callers. Conflict resolution still surfaces if the branch already exists.

## Linear issue

A Linear id such as `ENG-123`, or a Linear issue URL.

```
## Pre-Implementation

Work happens on a new `<team>-<number>-<slug>` branch created from an up-to-date `main`, so the pull request can close the ticket on merge. The ticket also moves to "In Progress" as work begins.
```

**Mechanics:** invoke `Skill(autopilot:branch-create)` with `<LINEAR-ID> --start` (e.g. `ENG-123 --start`). It fetches the ticket, derives the `<team>-<number>-<slug>` name, moves the ticket to "In Progress" via `--start` (best-effort — it never blocks branch creation), and creates the branch directly, since the name comes from a ticket the user already chose. Do not present a Hotfix/Trivial/Maintenance prefix prompt.

**No run variant** — the same arguments for both callers. `--start` is in both, mirroring how GitHub issues are auto-assigned the moment work begins.

## Code-scanning alert

```
## Pre-Implementation

Work happens on a new `security-<slug>` branch created from an up-to-date `main`, where `<slug>` paraphrases the alert's rule and file. The branch name is confirmed before it is created. An alert is not a GitHub issue, so the pull request records the alert reference and emits no `Closes` line — the alert closes on the next scan instead.
```

**Mechanics:** invoke `Skill(autopilot:branch-create)` with `--security "<slug>"` (e.g. `tainted-format-string`). The slug comes from free-form text, so the name MUST be approved by the user via AskUserQuestion before creation — never create the branch directly with git commands.

**run variant:** pass `--security "<slug>" --autopilot` to suppress the confirmation; invoking `/autopilot:run` is itself the authorization.

## Plain description

```
## Pre-Implementation

Work happens on a new branch created from an up-to-date `main`. Its type is chosen when implementation starts — hotfix for an emergency production fix, trivial for typos, docs, or formatting, maintenance for dependencies, CI, or configs — and the resulting name is confirmed before the branch is created.
```

**Mechanics:** ask for the branch type via AskUserQuestion, then invoke `Skill(autopilot:branch-create)` with `--<chosen-prefix> "<description>"`, where `<description>` is a short summary derived from the user's description. Both the type pick and the name confirmation are required — never skip them or create the branch directly with git commands.

Tool parameters:

- `question`: "Choose a branch type for this change."
- `header`: "Branch type"
- `options`: [
  { label: "Hotfix", description: "Emergency production fix (hotfix-<slug>)" },
  { label: "Trivial", description: "Typos, docs, formatting (trivial-<slug>)" },
  { label: "Maintenance", description: "Deps, CI, configs (maintenance-<slug>)" }
  ]
- `multiSelect`: false

**run variant:** append `--autopilot` to the branch-create arguments, which suppresses the name confirmation. The branch-type pick is the one prompt `run` keeps — a special-prefix type cannot be inferred from a free-form description.
