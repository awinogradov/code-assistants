---
name: explore
description: Map this repository broadly, write a durable context brief to .claude/context/brief.md, then take surgical fixes one at a time with no plan, branch, or PR machinery. Use when you have an area rather than a task — "help me understand this repo", "explore the refactoring flow" — and want the codebase understood before deciding what to change.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - Bash(command -v graphify)
  - Bash(graphify query *)
  - Bash(graphify path *)
  - Bash(graphify explain *)
  - Bash(graphify affected *)
  - Bash(graphify --help)
  - Bash(command -v entire)
  - Bash(entire *)
  - MCP(repomix:*)
  - Bash(git *)
  - Bash(bun run *)
  - Bash(bun test *)
  - Bash(bunx *)
  - Bash(npm run *)
  - Skill(autopilot:gather-context)
  - Skill(autopilot:ascii-schemas)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

Map the repository, persist the context brief, then stop for the user’s next instruction. Subsequent surgical fixes use the brief without a plan, branch, or PR chain.

## When to Use

- When you want the codebase understood before deciding what to change
- When the work is a series of small, located fixes rather than one planned change
- When a long session risks compacting away the context it depends on

An explicit `--brief <path>` lets plan/run reuse this brief after validation. Reach for [`plan`](../plan/SKILL.md) instead when you have a target and want the approach reviewed and approved, and for [`run`](../run/SKILL.md) when you have a target and want it carried through to a pull request ready for human review.

## Input

This skill takes **no arguments**. The map is deliberately broad — there is no subject matter to narrow to, so there is nothing to pass.

## Phase 0: Classify the run

Resolve the repository root. The brief is `<root>/.claude/context/brief.md`; its dependency record is `<root>/.claude/context/brief.sources.json`.

Fetch `origin main` once before classifying. If no brief exists, full prime. Otherwise read [selective-refresh.md](references/selective-refresh.md) and choose full prime, selective refresh, or delta refresh. Full prime runs Phases 1–4. Selective refresh reacquires only affected stable sections and their current dependencies, then runs Phase 3 and replaces those sections in Phase 4. Delta refresh runs Phase 3 and updates metadata only. Never change `Base:` while retaining a claim whose dependencies were not checked.

## Phase 1: Acquire context (full prime only)

Invoke:

```
Skill(autopilot:gather-context)
```

Pass input type `plain-description`, **`Scope: broad`**, the repository and repository root, and a task summary of `broad architecture map`. There is no issue id.

`Scope: broad` selects repository-wide context and skips history and the branch digest, which this brief does not consume. `plain-description` skips issue and TODO resolution. Use gather-context’s fan-out; do not duplicate it.

## Phase 2: Diagrams (when useful)

Generate a diagram only when the user requests one or a module boundary, data flow, or interaction is difficult to explain clearly in short prose. Invoke `Skill(autopilot:ascii-schemas)` for that diagram and embed it beside the explanation. Otherwise keep concise prose in Architecture map and Data flow. Reuse an unchanged diagram; regenerate only when its supporting dependencies changed.

## Phase 3: Recompute the volatile sections

Runs on **all three** paths, and is the sole source of all three volatile sections. Issue these in a single message:

```bash
# Local session state
git status --porcelain
git stash list
git worktree list
git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads/

# In-flight changes
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD

# Git state
git branch --show-current
git rev-parse --git-dir && git rev-parse --git-common-dir   # differ inside a worktree
git cherry origin/main HEAD                                 # every line "-" ⇒ isStaleMerged
git rev-list --count HEAD..origin/main                      # baseAhead
```

**This phase owns the volatile sections outright.** Run it on full primes, selective refreshes, and delta refreshes. Broad acquisition skips the branch digest, so this is the sole volatile refresh. Never source these sections from the Context Map or the previous brief.

Read `isStaleMerged` from `git cherry` rather than from a commit count: a branch whose commits already landed upstream under rebase-rewritten SHAs still shows a non-empty `git log origin/main..HEAD`, and testing only for emptiness reads a finished branch as active work.

Local session state is what makes a "surgical" fix land in the wrong place: an edit staged for another purpose, a stash holding the version you meant to change, a sibling worktree already on the branch you were about to create, or a branch with unpushed commits you assumed were gone.

## Phase 4: Write the brief

Create `<root>/.claude/context/` if absent and write `brief.md`. Section order is fixed, so two briefs of the same repository are comparable and a delta refresh can rewrite a subset in place.

```text
# Context brief — <repo> @ <branch>

Base: <origin/main SHA>

## Architecture map          <- stable
## Data flow                 <- stable
## Conventions and standards <- stable
## Key types                 <- stable
## Test and verify           <- stable
## In-flight changes         <- volatile
## Local session state       <- volatile
## Git state                 <- volatile
## Snapshot                  <- stable
```

`Base:` records the base revision. The dependency sidecar binds coverage to the exact brief and source content; follow [selective-refresh.md](references/selective-refresh.md) when writing it. No timestamp is needed. The current branch belongs in the volatile `## Git state`, so switching branches cannot leave a stale name in a stable region.

**On a delta refresh, rewrite `Base:` and the three volatile sections only.** Keep stable sections byte-identical. On a selective refresh, replace affected stable sections and their dependency records; keep unaffected stable sections byte-identical. Recompute the sidecar binding after either write.

Every **stable** section is written from the Context Map, and the transformation is fixed here rather than improvised per run:

| Context Map section  | Brief section                                    |
| -------------------- | ------------------------------------------------ |
| Relevant files       | `## Architecture map`                            |
| Patterns to mirror   | `## Architecture map`                            |
| Stack                | `## Architecture map`                            |
| Applicable standards | `## Conventions and standards`                   |
| Key types            | `## Key types`                                   |
| Test conventions     | `## Test and verify`                             |
| Snapshot             | `## Snapshot`                                    |
| In-flight changes    | unused — the brief recomputes it in Phase 3      |
| Git state            | unused — the brief recomputes it in Phase 3      |
| Session history      | unused — historical context, read at plan time   |
| Related TODOs        | dropped — never populated for this skill's input |
| Issue / alert        | dropped — always `none` for this skill's input   |

The map supplies stable sections only. Broad acquisition omits unused history and Git digests; Phase 3 supplies fresh volatile sections.

`## Data flow` carries the identified flow in prose or a [Phase 2](#phase-2-diagrams-when-useful) diagram, with the files supporting that flow in the dependency record. `## Test and verify` must name the **exact commands** to run, because every later fix is verified with one of them.

An empty section is written `none`, never dropped — the same rule the Context Map itself carries.

## Phase 5: State the session contract, then stop

Report where the brief was written, whether this was a full prime, selective refresh, or delta refresh, and anything in `## Git state` the user should know before editing — being on `main`, or on a branch whose work already landed upstream. **Report it; do not prompt on it.** This skill does not branch.

Then state the contract for the rest of the session and stop. Do not start work; the next instruction is the user's.

## The fix loop

Once the brief is written, every instruction that follows is handled the same way: locate it through the brief, read current affected files, edit, run only user-permitted verification from `## Test and verify`, and report results and deferred checks. Local edits invalidate affected brief claims until refreshed; never read stale prose as current code.

**No plan file, no branch prompt, no PR chain.** Never call `EnterPlanMode` or `ExitPlanMode`, and never invoke `preflight-check` — those belong to the flows this skill exists to avoid. Suppressing them is half the value here; a fix that costs one edit should not cost a planning pipeline.

When the user asks to commit or open a pull request, hand off — invoke `Skill(autopilot:commits-create)` or `Skill(autopilot:pr-create)`, which own those conventions. Do not improvise either with raw `git` or `gh`.

Re-invoking `/autopilot:explore` refreshes the brief. Deleting `.claude/context/brief.md` is the supported reset: the next invocation is a full prime.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
