---
name: linear-plan
description: Plan a Linear issue exactly as the plan skill does, then store the finished plan in that issue's description — refreshing a rough ticket title along the way — so it outlives the session. Storing is unconditional and never gated.
argument-hint: "[--brief <path>] <Linear issue (ENG-123 or a Linear issue URL)>"
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
  - Bash(graphify query *)
  - Bash(graphify path *)
  - Bash(graphify explain *)
  - Bash(graphify affected *)
  - Bash(graphify --help)
  - Bash(command -v entire)
  - Bash(entire *)
  - MCP(repomix:*)
  - AskUserQuestion
  - Skill(autopilot:gather-context)
  - Skill(autopilot:ascii-schemas)
---

Plan a Linear issue exactly as [`plan`](../plan/SKILL.md) does, then store the finished plan in that issue's description so it survives the session that produced it.

**Difference from [`/autopilot:plan`](../plan/SKILL.md):** `plan` leaves its plan in the harness plan-mode file, which dies with the session. This skill adds one thing — a durable write to the ticket — and takes one thing away: it does **not** implement. It stops after storing, and [`linear-run`](../linear-run/SKILL.md) is what executes the stored plan later, possibly in a different session or by a different person. That separation is the point: a plan a teammate can read and correct in Linear before any code exists is worth more than one that only ever existed in a transcript. Storing the plan is automatic once the pipeline finishes — no plan-mode transition and no approval gate; invoking this skill is the authorization to store, the same way invoking [`run`](../run/SKILL.md) authorizes its whole chain.

Everything from input resolution through the draft-and-finalize pipeline is `plan`, referenced rather than restated. Only [Phase 0's gate](#phase-0-resolve-input-and-gate) and [Phase 4's store](#phase-4-store-the-plan-on-the-issue) are new.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `<Linear issue>` — a Linear identifier such as `ENG-123`, or a Linear issue URL.

Additional free-form context may follow (e.g. `ENG-123 start with the adapter`).

Nothing else is accepted. A task description, a GitHub issue, and a code-scanning alert all have no Linear issue to store a plan on, so they route to `plan` instead — [the gate](#phase-0-resolve-input-and-gate) says so explicitly rather than planning something it cannot save.

## Input resolution

Resolve arguments through [input-detection.md](../plan/references/input-detection.md), using this caller’s accepted forms and flags. Resolve the repository root once; issue/branch state comes from gathering. Do not load the plan orchestrator for input parsing.

## Completion Requirement

This workflow is not complete until [Phase 4](#phase-4-store-the-plan-on-the-issue) either writes the plan to the issue or reports why the write failed. Producing a plan is not completion — an unstored plan is the problem this skill exists to solve.

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool names `get_issue`, `list_issue_statuses`, and `save_issue`.

## Explicit brief input

Accept `--brief <path>` and strip it before issue detection. Never infer this flag from conversation history. Before gathering, read [brief-validation.md](../gather-context/references/brief-validation.md); on any non-valid verdict, report it and stop with the option to refresh explore or rerun without `--brief`. On success, pass the brief and **`Scope: primed`** to gather-context, following [brief-reuse.md](../gather-context/references/brief-reuse.md) for current-code and standards gaps. Without the flag, use ordinary task gathering. Stored-plan file seeds also apply when a Linear run receives a brief.

## Task Progress Protocol

Track only these substantive outcomes: **Gather context**, **Write plan**, **Store plan**. Create them together where the runtime supports batching, or as one checklist otherwise. Update at outcome boundaries; input parsing, artifact freezing, and draft/finalize are not separate tasks. Identify tasks by subject, never numeric IDs.

## Task

$ARGUMENTS

## Phase 0: Resolve input and gate

Resolve input before starting Gather context.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Then resolve all three gate conditions **before** [Phase 1](#phase-1-gather-context). They run up front because the alternative is paying a full context fan-out and a drafting pass before discovering the plan has nowhere to go:

| Condition                                | Message                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No `linear` tracker in `agents.trackers` | `This project is not Linear-tracked. Use /autopilot:plan instead — there is no Linear issue to store a plan on.`       |
| Input is not a Linear issue              | `linear-plan needs a Linear issue (e.g. ENG-123). Use /autopilot:plan for a task description, GitHub issue, or alert.` |
| No Linear MCP tool resolves              | the `No Linear MCP available …` message from [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) |

Stop on the first condition that fires. Do not fall back to `plan` automatically — name it and let the user choose, A missing write destination is not a reason to start an unrequested workflow.

No preflight check runs here, and none is needed: this skill creates no branch and no commit, so there is no git state for one to protect. The tree the plan was drafted against is recorded instead, as the `Base:` field of [the stored template](#the-stored-plan-format).

## Phase 1: Gather context

Fetch the issue through the already resolved `get_issue` MCP tool and retain its identity, complete description, metadata, and completeness as `Resolved issue`. Pass that payload into gathering; do not introduce an API-key helper after MCP resolution succeeded.

Invoke:

```
Skill(autopilot:gather-context)
```

Pass `Resolved issue`, the detected input type, the Linear issue id, repository, repository root, the matched tracker's Linear team, and the raw task text as the task summary. Use `Scope: task` unless the explicit brief selected `Scope: primed`. The returned **Context Map** is this command's entire view of the repository.

## Phase 2: Intent, assumptions, and the clarification gate

Apply [intent and clarification](../plan/references/common-instructions.md#intent-and-clarification) — the Steelmanned Intent, the assumptions, and the open questions, with every load-bearing question raised before drafting.

## Common Instructions

Read [common-instructions.md](../plan/references/common-instructions.md) once before drafting; its rules apply unchanged — documentation lookup scaled to the task, repository standards from the Context Map, the [plan file header rule](../plan/references/common-instructions.md#plan-file-header), CLAUDE.md compliance, and ASCII schemas.

The [**Plan file is output, not instructions**](../plan/references/common-instructions.md#plan-file-is-output-not-instructions) rule matters more here than in `plan`, because the plan file's content becomes the stored ticket body. Anything that reads as an instruction to an agent — a tool-call block, a dispatch line — ends up published on a ticket a human is expected to review.

## Phase 3: Draft and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — one Write plan outcome — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md). Nothing gates the store: continue straight to it. Do not add a separate approval step or a plan-mode transition between finalize and the write.

## Phase 4: Store the plan on the issue

Read [plan-storage.md](references/plan-storage.md) now. Store with `Stored by /autopilot:linear-plan`, title refresh enabled, and the AI Ready transition enabled. Report the stored URL, base, title outcome, and transition outcome; on failure emit recoverable plan text and the error. This completes Store plan.

### The stored plan format

The shared [stored format](references/plan-storage.md#the-stored-plan-format) writes v2 and retains v1 reader compatibility.

### The emission template

Use the literal [emission template](references/plan-storage.md#the-emission-template).

### Linear-safe markdown

Apply [Linear-safe markdown](references/plan-storage.md#linear-safe-markdown) to authored text only.

### The write

Follow [the write](references/plan-storage.md#the-write), including the fresh read and byte-identical preserved prefix.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
