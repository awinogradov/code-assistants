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

Prime the session with a broad picture of this repository, write it to disk so it survives compaction, then hand control back and take fixes one at a time.

This is the third on-ramp into a repository, and it exists because the other two do not fit a common shape of work. [`plan`](../plan/SKILL.md) and [`run`](../run/SKILL.md) both require a target and then carry the session through draft, expert panel, scoring, a plan file, a branch, and a pull request. Arriving with an _area_ rather than a task — and following it with a few surgical edits — means inventing a target for `plan` and discarding everything it drags along. `explore` is the same context quality with none of that machinery.

## When to Use

- When you want the codebase understood before deciding what to change
- When the work is a series of small, located fixes rather than one planned change
- When a long session risks compacting away the context it depends on

Reach for [`plan`](../plan/SKILL.md) instead when you have a target and want the approach reviewed and approved, and for [`run`](../run/SKILL.md) when you have a target and want it carried through to a merged pull request.

## Input

This skill takes **no arguments**. The map is deliberately broad — there is no subject matter to narrow to, so there is nothing to pass.

## Phase 0: Classify the run

1. Resolve the repository root with `git rev-parse --show-toplevel`. The brief lives at `<root>/.claude/context/brief.md`, one per worktree.

2. If no brief exists, this is a **full prime** — go to [Phase 1](#phase-1-acquire-context-full-prime-only).

3. Otherwise read the brief and take its `Base:` SHA, then ask whether anything **semantically** moved upstream since:

   ```bash
   git fetch origin main
   git diff --name-only <base>..origin/main -- . \
     ':(exclude).repomix/' ':(exclude)**/CHANGELOG.md' \
     ':(exclude)**/.release_notes/' ':(exclude)LICENSES.md'
   ```

   Empty output ⇒ **delta refresh**: skip [Phase 1](#phase-1-acquire-context-full-prime-only) and [Phase 2](#phase-2-diagrams-full-prime-only) entirely, resume at [Phase 3](#phase-3-recompute-the-volatile-sections), and rewrite only the volatile sections. Any other output ⇒ full prime. A `<base>` that no longer resolves in this clone also means full prime — never diff against a SHA you cannot name.

**The exclusions are the load-bearing part, and an include-list cannot replace them.** A committed codebase snapshot is refreshed by automation on nearly every merge, so watching it makes the diff non-empty almost always and the delta path becomes dead code. Watching only prose roots has the opposite failure: the architecture, key-types, and test sections describe code, so they would go stale under a fresh `Base:` vouching for them. Excluding what is derived and watching everything else is the only formulation that means what those sections claim.

The diff is remote-to-remote, so locally-uncommitted edits never force a full prime. That is deliberate — local edits are exactly what an explore session produces, and they surface in the volatile sections, which are rewritten every time.

## Phase 1: Acquire context (full prime only)

Invoke:

```
Skill(autopilot:gather-context)
```

Pass input type `plain-description`, **`Scope: broad`**, the repository and repository root, and a task summary of `broad architecture map`. There is no issue id.

Two consequences of that input are worth knowing rather than rediscovering. `Scope: broad` is what makes the codebase pass read the snapshot breadth-first instead of hunting for what a change touches. And `plain-description` gates off the issue and TODO resolvers, so no sub-agent runs whose output this brief would discard.

Do not re-implement the fan-out here. It has one owner; a hand-mirrored copy would rot the first time an agent is added to one side and not the other.

## Phase 2: Diagrams (full prime only)

Invoke `Skill(autopilot:ascii-schemas)` for two diagrams — module boundaries, and the primary data or control flow between them. Embed each verbatim in the section it explains. Never hand-draw one.

This sits beside [Phase 1](#phase-1-acquire-context-full-prime-only) rather than after the volatile-recompute pass so that everything a delta refresh skips is contiguous: the two full-prime-only phases run back to back, and the delta path rejoins at [Phase 3](#phase-3-recompute-the-volatile-sections).

## Phase 3: Recompute the volatile sections

Runs on **both** paths, and is the sole source of all three volatile sections. Issue these in a single message:

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

**This phase owns the volatile sections outright — do not source them from the Context Map.** [Phase 1](#phase-1-acquire-context-full-prime-only) also reports in-flight changes and git state, but it does not run on a delta refresh, so anything sourced from it cannot honor the "rewritten on every invocation" contract. A brief primed once and refreshed thereafter would keep showing the branch as it stood at the first prime — and since an explore session's whole purpose is producing commits, that is the common case, not an edge case. On a full prime these commands simply recompute what the map already said; the duplicate cost is a few `git` calls, and it buys a volatile half that is genuinely volatile on both paths.

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

`Base:` is the only metadata, because it is the only field a decision reads. No timestamp — nothing keys off one, and an unused field is a field that goes stale. The current branch belongs in the volatile `## Git state`, so switching branches cannot leave a stale name in a stable region.

**On a delta refresh, rewrite `Base:` and the three volatile sections only.** The stable sections must come through byte-identical; that is the property the whole classification exists to buy.

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

The last four rows are the load-bearing ones. In-flight changes and git state are the map's only volatile output, and the map exists solely on a full prime, so reading them from it would make two "volatile" sections silently freeze after the first prime — [Phase 3](#phase-3-recompute-the-volatile-sections) recomputes both instead. Related TODOs and Issue / alert are never populated at all, because this skill passes `plain-description` and both of those resolvers are gated on issue inputs.

`## Data flow` carries the [Phase 2](#phase-2-diagrams-full-prime-only) diagram and has no Context Map source. `## Test and verify` must name the **exact commands** to run, because every later fix is verified with one of them.

An empty section is written `none`, never dropped — the same rule the Context Map itself carries.

## Phase 5: State the session contract, then stop

Report where the brief was written, whether this was a full prime or a delta refresh, and anything in `## Git state` the user should know before editing — being on `main`, or on a branch whose work already landed upstream. **Report it; do not prompt on it.** This skill does not branch.

Then state the contract for the rest of the session and stop. Do not start work; the next instruction is the user's.

## The fix loop

Once the brief is written, every instruction that follows is handled the same way: locate it through the brief, edit, run the verify check named in `## Test and verify`, and report the result.

**No plan file, no expert panel, no scoring, no branch prompt, no PR chain.** Never call `EnterPlanMode` or `ExitPlanMode`, and never invoke `preflight-check` — those belong to the flows this skill exists to avoid. Suppressing them is half the value here; a fix that costs one edit should not cost a planning pipeline.

When the user asks to commit or open a pull request, hand off — invoke `Skill(autopilot:commits-create)` or `Skill(autopilot:pr-create)`, which own those conventions. Do not improvise either with raw `git` or `gh`.

Re-invoking `/autopilot:explore` refreshes the brief. Deleting `.claude/context/brief.md` is the supported reset: the next invocation is a full prime.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
