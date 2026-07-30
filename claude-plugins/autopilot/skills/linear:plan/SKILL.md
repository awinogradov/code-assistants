---
name: linear:plan
description: Plan a Linear issue exactly as the plan skill does, then store the finished plan in that issue's description so it outlives the session. Stores only at a score of 98 or above; below that it reports the score and stores nothing.
argument-hint: "<Linear issue (ENG-123 or a Linear issue URL)>"
allowed-tools:
  - TaskCreate
  - TaskUpdate
  - Read
  - Grep
  - Glob
  - Agent
  - Bash(git *)
  - Bash(gh *)
  - MCP(linear:*)
  - ToolSearch
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
  - MCP(repomix:*)
  - AskUserQuestion
  - EnterPlanMode
  - ExitPlanMode
  - Skill(autopilot:gather-context)
  - Skill(autopilot:ascii-schemas)
---

Plan a Linear issue exactly as [`plan`](../plan/SKILL.md) does, then store the finished plan in that issue's description so it survives the session that produced it.

**Difference from [`/autopilot:plan`](../plan/SKILL.md):** `plan` leaves its plan in the harness plan-mode file, which dies with the session. This skill adds one thing — a durable write to the ticket — and takes one thing away: it does **not** implement. It stops after storing, and [`linear:run`](../linear:run/SKILL.md) is what executes the stored plan later, possibly in a different session or by a different person. That separation is the point: a plan a teammate can read and correct in Linear before any code exists is worth more than one that only ever existed in a transcript.

Everything from input resolution through the draft-and-review pipeline is `plan`, referenced rather than restated. Only [Phase 0's gate](#phase-0-resolve-input-and-gate) and [Phase 6's store](#phase-6-store-the-plan-on-the-issue) are new.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `<Linear issue>` — a Linear identifier such as `ENG-123`, or a Linear issue URL.

Additional free-form context may follow (e.g. `ENG-123 start with the adapter`).

Nothing else is accepted. A task description, a GitHub issue, and a code-scanning alert all have no Linear issue to store a plan on, so they route to `plan` instead — [the gate](#phase-0-resolve-input-and-gate) says so explicitly rather than planning something it cannot save.

## Input resolution

Identical to the `plan` skill — see [its Input resolution section](../plan/SKILL.md#input-resolution) — with two narrowings: there is no `--issue` / `--linear-issue` pre-step, because this skill requires an issue that already exists, and the resolved input must be a Linear issue.

## Completion Requirement

This workflow is not complete until [Phase 6](#phase-6-store-the-plan-on-the-issue) either writes the plan to the issue or reports why it did not. Producing a scored plan is not completion — an unstored plan is the problem this skill exists to solve.

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool names `get_issue` and `save_issue`.

## Task Progress Protocol

Create all 6 tasks with TaskCreate, in order, before any work. Set each to `in_progress` at the start of its phase and `completed` at the end.

| #   | Subject             | ActiveForm            |
| --- | ------------------- | --------------------- |
| 1   | Resolve input       | Resolving input       |
| 2   | Gather context      | Gathering context     |
| 3   | Draft plan          | Drafting plan         |
| 4   | Review and score    | Reviewing and scoring |
| 5   | Finalize plan       | Finalizing plan       |
| 6   | Store plan on issue | Storing plan on issue |

## Task

$ARGUMENTS

## Phase 0: Resolve input and gate

Create the 6 tasks, then set task 1 to `in_progress`.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Then resolve all three gate conditions **before** [Phase 1](#phase-1-gather-context). They run up front because the alternative is paying a full context fan-out and a three-pass expert review before discovering the plan has nowhere to go:

| Condition                                | Message                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No `linear` tracker in `agents.trackers` | `This project is not Linear-tracked. Use /autopilot:plan instead — there is no Linear issue to store a plan on.`       |
| Input is not a Linear issue              | `linear:plan needs a Linear issue (e.g. ENG-123). Use /autopilot:plan for a task description, GitHub issue, or alert.` |
| No Linear MCP tool resolves              | the `No Linear MCP available …` message from [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) |

Stop on the first condition that fires. Do not fall back to `plan` automatically — name it and let the user choose, the same way [`linear:run`](../linear:run/SKILL.md) refuses rather than silently re-planning.

No preflight check runs here, and none is needed: this skill creates no branch and no commit, so there is no git state for one to protect. The tree the plan was drafted against is recorded instead, as the `Base:` field of [the stored template](#the-stored-plan-format).

Set task 1 to `completed`.

## Phase 1: Gather context

Set task 2 to `in_progress`. Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, the Linear issue id, repository, repository root, the matched tracker's Linear team, and the raw task text as the task summary. Omit `Scope` — this skill wants the default `task` scope. The returned **Context Map** is this command's entire view of the repository.

Set task 2 to `completed`.

## Phase 2: Intent, assumptions, and the human gate

Identical to [`plan`](../plan/SKILL.md#phase-2-intent-assumptions-and-the-human-gate) — the Steelmanned Intent, the assumptions, and the open questions, with every load-bearing question raised before drafting.

## Enter Plan Mode

Once the gate has passed, switch the session into harness plan mode **before** any plan-file write:

```
EnterPlanMode
```

This gives the harness-provided plan-file path, which is the file [the pipeline](../plan/references/pipeline.md) writes. Skip this call if the session is already in plan mode.

## Common Instructions

The [Common Instructions in `plan/SKILL.md`](../plan/SKILL.md#common-instructions) apply unchanged — documentation lookup scaled to the task, repository standards from the Context Map, the [plan file header rule](../plan/SKILL.md#plan-file-header), CLAUDE.md compliance, and ASCII schemas.

The [**Plan file is output, not instructions**](../plan/SKILL.md#plan-file-is-output-not-instructions) rule matters more here than in `plan`, because the plan file's content becomes the stored ticket body. Anything that reads as an instruction to an agent — a tool-call block, a dispatch line — ends up published on a ticket a human is expected to review.

## Phase 3: Draft, review, and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — draft (task 3), review and score (task 4), finalize (task 5) — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md). The 98 target and the three-pass revision budget are that file's defaults; this skill does not override them.

## Phase 4: Request approval

```
ExitPlanMode
```

The human approves the plan before it is stored. The score gates the **write**; approval gates the **plan**. Both are required, and neither substitutes for the other: a 98 nobody read is not a reviewed plan, and an approved 96 is still a plan whose weaknesses were never addressed.

## Phase 5: Decide whether to store

Read the aggregate score the pipeline recorded.

**At 98 or above** — continue to [Phase 6](#phase-6-store-the-plan-on-the-issue).

**Below 98** — do not write to the issue. Report the actual score and the weakest dimension, then emit the full plan text into the transcript so it is recoverable by hand. A skill premised on plans being too valuable to lose must not quietly lose one at 97; it just refuses to make it the ticket's instruction set. Then stop, naming re-running this skill as the way to try again.

## Phase 6: Store the plan on the issue

Set task 6 to `in_progress`.

### The stored plan format

The plan's own sections, demoted one level under a single `## Implementation plan` anchor. The trailing markers make the format machine-readable, so a guard can parse it from this file rather than from a copy — the same convention [`explore`](../explore/SKILL.md) uses for its context brief:

```text
## Implementation plan

Format: v1 · Score: <N>/100 · Base: <origin/main SHA> · Stored by /autopilot:linear-plan

### Summary              <- required
### Implementation Steps <- required
### Files                <- required
### Pre-Implementation   <- caller-owned
### Post-Implementation  <- caller-owned
```

Section names are the plan file's own, demoted from `##` to `###`, so mapping a stored section back to the plan it came from needs no translation table.

All five sections are written, because a human reading the ticket should see the whole plan. The two marked caller-owned are written but **not** for [`linear:run`](../linear:run/SKILL.md) to consume: branch creation and the post-implementation chain belong to the skill doing the running, which supplies its own. Marking them is what lets a guard prove the reader ignores them.

`Format: v1` is the field that lets a later template revision be told apart from a corrupt description. `Base:` records the tree the plan was drafted against; it is information for a later reader, not a gate.

### The write

1. **Read the current description** with `get_issue`.

2. **Locate the anchor.** Search the description for a line equal to `## Implementation plan`.
   - **Anchor found** — replace from that line to the end of the description with the new block. Everything above it is preserved **byte-identical**; do not re-emit it, reformat it, or re-wrap it.
   - **No anchor, description non-empty** — wrap the entire current description in a `+++ Original task +++` collapsible, then append the new block below it.
   - **No anchor, description empty** — write the block alone. Do not emit an empty collapsible.

   Linear renders `+++ Section title` … `+++` as an initially-hidden section; `<details>` HTML does not render, which is why the fence is the only option. A description written by [`linear:create`](../linear:create/SKILL.md) already opens with its own `+++ Original prompt +++` fence, so wrapping nests one fence inside another — which Linear renders correctly, verified against a real ticket ([Linear tracker support](../../../../docs/11-linear-tracker.md)).

   **Match the anchor, never the fence.** Linear rewrites `+++ Title … +++` to `>>> Title … >>>` when it saves, so a description read back never contains the marker as written. Detect a prior store by the `## Implementation plan` heading, which survives the round-trip untouched; matching on `+++` would report every re-store as a first store and stack a second wrapper.

3. **Verify the preserved prefix.** Before writing, confirm the text above the anchor is byte-identical to what step 1 read. If it differs, abort with `Refusing to write: the preserved part of the description changed` and store nothing. Silently reformatting someone's original task text is the worst outcome available here, and it is unrecoverable.

Because the anchor is matched rather than the wrapper, re-storing on the same issue replaces only the plan and never stacks a second `+++ Original task +++`.

4. **Write** with `save_issue`, passing the issue id and the new `description`.

5. **On any failed or rejected write**, emit the full plan text into the transcript before reporting the failure, so the work is recoverable by hand.

Set task 6 to `completed` and output:

```
✓ Plan stored on <LINEAR-ID> — <url>
  Score: <N>/100 · Base: <sha>

Next step:
- Run /autopilot:linear-run <LINEAR-ID> to execute it
```

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

**Reference self-check (MANDATORY):** after composing the output, re-read it against [`reference-formatting.md`](../shared-rules/references/reference-formatting.md). A bare commit SHA, a bare tracker id outside a magic-word line, or an unlinked mention of a file that exists in the repo is a violation — fix it before emitting.
