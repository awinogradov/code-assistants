---
name: linear-plan
description: Plan a Linear issue exactly as the plan skill does, expert-reviewed when --experts-review is passed, then store the finished plan in that issue's description — refreshing a rough ticket title along the way — so it outlives the session. Storing is unconditional — the recorded score or skip is information on the ticket, never used as a gate.
argument-hint: "<Linear issue (ENG-123 or a Linear issue URL)> [--experts-review]"
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
  - Bash(command -v graphify)
  - Bash(graphify *)
  - Bash(command -v entire)
  - Bash(entire *)
  - MCP(repomix:*)
  - AskUserQuestion
  - Skill(autopilot:gather-context)
  - Skill(autopilot:ascii-schemas)
---

Plan a Linear issue exactly as [`plan`](../plan/SKILL.md) does, then store the finished plan in that issue's description so it survives the session that produced it.

**Difference from [`/autopilot:plan`](../plan/SKILL.md):** `plan` leaves its plan in the harness plan-mode file, which dies with the session. This skill adds one thing — a durable write to the ticket — and takes one thing away: it does **not** implement. It stops after storing, and [`linear-run`](../linear-run/SKILL.md) is what executes the stored plan later, possibly in a different session or by a different person. That separation is the point: a plan a teammate can read and correct in Linear before any code exists is worth more than one that only ever existed in a transcript. Storing the plan is automatic once the pipeline finishes — no plan-mode transition, no approval gate, and no score gate; invoking this skill is the authorization to store, the same way invoking [`run`](../run/SKILL.md) authorizes its whole chain.

Everything from input resolution through the draft-and-review pipeline is `plan`, referenced rather than restated. Only [Phase 0's gate](#phase-0-resolve-input-and-gate) and [Phase 4's store](#phase-4-store-the-plan-on-the-issue) are new.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `<Linear issue>` — a Linear identifier such as `ENG-123`, or a Linear issue URL.
- `<Linear issue> --experts-review` — run the expert review-and-score step; without this flag that step is skipped and the skip is recorded in the stored `Score:` field.

Additional free-form context may follow (e.g. `ENG-123 start with the adapter`).

Nothing else is accepted. A task description, a GitHub issue, and a code-scanning alert all have no Linear issue to store a plan on, so they route to `plan` instead — [the gate](#phase-0-resolve-input-and-gate) says so explicitly rather than planning something it cannot save.

## Input resolution

Identical to the `plan` skill — see [its Input resolution section](../plan/SKILL.md#input-resolution) — with two narrowings: there is no `--issue` / `--linear-issue` pre-step, because this skill requires an issue that already exists, and the resolved input must be a Linear issue.

## Completion Requirement

This workflow is not complete until [Phase 4](#phase-4-store-the-plan-on-the-issue) either writes the plan to the issue or reports why the write failed. Producing a scored plan is not completion — an unstored plan is the problem this skill exists to solve.

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool names `get_issue`, `list_issue_statuses`, and `save_issue`.

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

First parse and strip `--experts-review` per the mode-flags pre-step in [input-detection.md](../plan/references/input-detection.md#mode-flags): present ⇒ the pipeline's review step runs; absent ⇒ it is skipped and the skip is recorded in the stored `Score:` field. Then detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Then resolve all three gate conditions **before** [Phase 1](#phase-1-gather-context). They run up front because the alternative is paying a full context fan-out and an expert review before discovering the plan has nowhere to go:

| Condition                                | Message                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No `linear` tracker in `agents.trackers` | `This project is not Linear-tracked. Use /autopilot:plan instead — there is no Linear issue to store a plan on.`       |
| Input is not a Linear issue              | `linear-plan needs a Linear issue (e.g. ENG-123). Use /autopilot:plan for a task description, GitHub issue, or alert.` |
| No Linear MCP tool resolves              | the `No Linear MCP available …` message from [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) |

Stop on the first condition that fires. Do not fall back to `plan` automatically — name it and let the user choose, the same way [`linear-run`](../linear-run/SKILL.md) refuses rather than silently re-planning.

No preflight check runs here, and none is needed: this skill creates no branch and no commit, so there is no git state for one to protect. The tree the plan was drafted against is recorded instead, as the `Base:` field of [the stored template](#the-stored-plan-format).

Set task 1 to `completed`.

## Phase 1: Gather context

Set task 2 to `in_progress`. Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, the Linear issue id, repository, repository root, the matched tracker's Linear team, and the raw task text as the task summary. Omit `Scope` — this skill wants the default `task` scope. The returned **Context Map** is this command's entire view of the repository.

Set task 2 to `completed`.

## Phase 2: Intent, assumptions, and the clarification gate

Identical to [`plan`](../plan/SKILL.md#phase-2-intent-assumptions-and-the-human-gate) — the Steelmanned Intent, the assumptions, and the open questions, with every load-bearing question raised before drafting.

## Common Instructions

The [Common Instructions in `plan/SKILL.md`](../plan/SKILL.md#common-instructions) apply unchanged — documentation lookup scaled to the task, repository standards from the Context Map, the [plan file header rule](../plan/SKILL.md#plan-file-header), CLAUDE.md compliance, and ASCII schemas.

The [**Plan file is output, not instructions**](../plan/SKILL.md#plan-file-is-output-not-instructions) rule matters more here than in `plan`, because the plan file's content becomes the stored ticket body. Anything that reads as an instruction to an agent — a tool-call block, a dispatch line — ends up published on a ticket a human is expected to review.

## Phase 3: Draft, review, and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — draft (task 3), review and score (task 4), finalize (task 5) — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md). Carry the `--experts-review` resolution from [Phase 0](#phase-0-resolve-input-and-gate) into the pipeline: the review step runs only when the flag was passed. Whatever the recorded outcome — a score or a skip — it gates nothing: continue straight to the store. Do not add a separate approval step, a plan-mode transition, or a score check between finalize and the write.

## Phase 4: Store the plan on the issue

Set task 6 to `in_progress`.

### The stored plan format

The plan's own sections, demoted one level under a single `## Implementation plan` anchor. The trailing markers make the format machine-readable, so a guard can parse it from this file rather than from a copy — the same convention [`explore`](../explore/SKILL.md) uses for its context brief:

```text
## Implementation plan

Format: v1 · Score: <panel verdicts> · Base: <origin/main SHA> · Stored by /autopilot:linear-plan

### Summary              <- required
### Implementation Steps <- required
### Files                <- required
### Pre-Implementation   <- caller-owned
### Post-Implementation  <- caller-owned
```

Section names are the plan file's own, demoted from `##` to `###`, so mapping a stored section back to the plan it came from needs no translation table.

All five sections are written, because a human reading the ticket should see the whole plan. The two marked caller-owned are written but **not** for [`linear-run`](../linear-run/SKILL.md) to consume: branch creation and the post-implementation chain belong to the skill doing the running, which supplies its own. Marking them is what lets a guard prove the reader ignores them.

`Format: v1` is the field that lets a later template revision be told apart from a corrupt description. `Base:` records the tree the plan was drafted against; it is information for a later reader, not a gate. When the review step was skipped, the `Score:` field reads the literal `skipped` — `Format: v1 · Score: skipped · Base: <origin/main SHA> · Stored by /autopilot:linear-plan` — so the ticket's reader knows the plan is unreviewed; like the score, it informs and never gates.

### The emission template

The marker list above is the machine-readable contract between this skill and its reader; the block below is the literal text the store writes. Emit it verbatim: replace only the `<angle-bracket>` placeholders and leave every other byte — the anchor line, the header line, each `###` heading, their order, and the blank-line layout — exactly as written. The `<- required` / `<- caller-owned` annotations belong to the contract list alone and never appear in a stored description.

```text
## Implementation plan

Format: v1 · Score: <score> · Base: <sha> · Stored by /autopilot:linear-plan

### Summary

<the plan's Summary body, including its Steelmanned intent line>

### Implementation Steps

<the plan's numbered steps, each keeping its verify: line>

### Files

<the plan's file list>

### Pre-Implementation

<the plan's branch outcome, stated as prose>

### Post-Implementation

<the plan's post-implementation prose>
```

Fill rules:

- `<score>` — the per-reviewer verdicts segment from the review step's recorded `Score:` line (e.g. `87 & 92 · weakest: testability (15) & simplicity (18) · findings applied`), or the literal `skipped` when the review was skipped, matching the two header variants above.
- `<sha>` — the full SHA exactly as `git rev-parse origin/main` printed it; never abbreviate or reconstruct it.
- Each section placeholder — that section's body from the finalized plan file, demoted headings included, adjusted only as far as the Linear-safe markdown rules below require.

**The first-store wrapper.** On a first store over a non-empty description ([The write](#the-write), second case), the prior body is wrapped in the same collapsible form [`linear-create`](../linear-create/SKILL.md) uses for its original-prompt preamble, emitted literally as:

```text
+++ Original task

<the prior description, byte-identical>

+++
```

then a blank line, then the filled template above. The title is exactly `Original task`. The prior description is inserted byte-identical and treated as opaque — never reworded, re-linked, or rewritten into the Linear-safe forms below, because it is preserved text, not authored text. A read-back shows `>>> Original task … >>>`; that fence normalization is why the write anchors on the heading and never on the fence.

### Linear-safe markdown

Linear's editor accepts most Markdown on input ([editor reference](https://linear.app/docs/editor)) but normalizes several author forms when it saves, so a stored description reads back byte-identical only when it is written in the canonical forms. Section bodies filled into the template use only:

- `###`/`####` headings — the anchor and section headings come from the template itself
- `*` bullets and `1.` numbered lists — never `-` or `+` bullets, which Linear rewrites to `*`
- `**bold**` and `*italic*` — never `_underscore emphasis_`, which Linear rewrites to `*`
- inline code and fenced code blocks (`text`-tagged fences for ASCII diagrams)
- plain URLs and `[text](url)` links
- `+++ Title` … `+++` as the only collapsible form — Linear stores it as `>>> Title … >>>`, which is why reads never match the fence

Never emit HTML (`<details>` and every other tag do not render), checkbox lists (`[]` becomes an interactive checklist, and the plan file bans checkboxes), or any construct the [editor reference](https://linear.app/docs/editor) does not list. Writing the canonical forms directly is what keeps a re-store's read-back comparable to what was written, instead of diffing against Linear's rewrites.

### The write

1. **Read the current description and title** with `get_issue`.

2. **Locate the anchor.** Search the description for a line equal to `## Implementation plan`.
   - **Anchor found** — replace from that line to the end of the description with the new block. Everything above it is preserved **byte-identical**; do not re-emit it, reformat it, or re-wrap it.
   - **No anchor, description non-empty** — wrap the entire current description in a `+++ Original task +++` collapsible, then append the new block below it.
   - **No anchor, description empty** — write the block alone. Do not emit an empty collapsible.

   Linear renders `+++ Section title` … `+++` as an initially-hidden section; `<details>` HTML does not render, which is why the fence is the only option. A description written by [`linear-create`](../linear-create/SKILL.md) already opens with its own `+++ Original prompt +++` fence, so wrapping nests one fence inside another — which Linear renders correctly, verified against a real ticket ([Linear tracker support](../../../../docs/11-linear-tracker.md)).

   **Match the anchor, never the fence.** Linear rewrites `+++ Title … +++` to `>>> Title … >>>` when it saves, so a description read back never contains the marker as written. Detect a prior store by the `## Implementation plan` heading, which survives the round-trip untouched; matching on `+++` would report every re-store as a first store and stack a second wrapper.

3. **Verify the preserved prefix.** Before writing, confirm the text above the anchor is byte-identical to what step 1 read. If it differs, abort with `Refusing to write: the preserved part of the description changed` and store nothing. Silently reformatting someone's original task text is the worst outcome available here, and it is unrecoverable.

Because the anchor is matched rather than the wrapper, re-storing on the same issue replaces only the plan and never stacks a second `+++ Original task +++`.

4. **Derive the title.** From the plan's Steelmanned Intent line, derive a candidate title under the same rules [`linear-create`](../linear-create/SKILL.md#phase-2-generate-title-and-body) applies when it generates one — capitalized, ≤ 80 characters, no trailing period, business-focused, no prefixes. Compare it with the title step 1 read: when the candidate is a material improvement — the current title is a rough one-line prompt, a placeholder, or misstates the planned work — carry the candidate as `title` into the step 5 write; when the current title already meets those rules and states the task, omit the field entirely so the write never touches it. The refresh needs no confirmation — invoking this skill authorizes it exactly as it authorizes the store, and Linear's issue activity keeps the prior title recoverable. Record the outcome line for the output block: `✓ Title updated: <new title>` or `title unchanged`.

5. **Write** with `save_issue`, passing the issue id, the new `description`, and — when step 4 derived a candidate — the refreshed `title` in the same call, so the ticket can never end up with one field updated and the other not.

6. **On any failed or rejected write**, emit the full plan text into the transcript before reporting the failure, so the work is recoverable by hand.

7. **Move the issue to "AI Ready"** — best-effort, never blocks the store, and runs only after step 5's write succeeded: a failed or refused write performs no transition. The transition is the board's hand-off signal that the ticket is planned and execution-ready. Resolve the target state id with the Linear MCP `list_issue_statuses` tool for the issue's team, then call the Linear MCP `save_issue` tool with `{ "id": "<LINEAR-ID>", "state": "<AI Ready state>" }` — tool resolution per the [Completion Requirement](#completion-requirement) Linear MCP access note. On success, emit `✓ Ticket <LINEAR-ID> moved to AI Ready`; when the team has no "AI Ready" state or the state write fails, emit `issue not moved — <reason>`. Always continue — but the emitted line MUST reach the output block below, never only intermediate text.

Set task 6 to `completed` and output:

```
✓ Plan stored on <LINEAR-ID> — <url>
  Score: <panel verdicts> · Base: <sha>

Next step:
- Run /autopilot:linear-run <LINEAR-ID> to execute it
```

When the review step was skipped, the `Score:` segment reads `skipped` here exactly as in the stored header. Add the step 4 outcome line after the `Score:` line — `✓ Title updated: <new title>` or `title unchanged` — and the step 7 outcome line after it — `✓ Ticket <LINEAR-ID> moved to AI Ready` on success, or the `issue not moved — <reason>` line on failure — so a skipped refresh or transition is visible in the final output, not just mid-run.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
