---
name: linear-run
description: Run any Linear issue end to end. Executes a valid stored plan verbatim when one exists; otherwise drafts, reviews, and implements a fresh plan without a human approval gate.
argument-hint: "<Linear issue (ENG-123 or a Linear issue URL)>"
allowed-tools:
  - TaskCreate
  - TaskUpdate
  - Read
  - Grep
  - Glob
  - Agent
  - Edit
  - Write
  - Bash(git *)
  - Bash(gh *)
  - Bash(sleep *)
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
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:branch-create)
  - Skill(autopilot:pr-monitor)
  - Skill(autopilot:pr-update)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

Run any Linear issue end to end. Prefer the durable plan [`linear-plan`](../linear-plan/SKILL.md) stored in its description when that artifact validates; otherwise draft, review, and implement a fresh plan from the issue context.

**Difference from [`/autopilot:run`](../run/SKILL.md):** `run` always drafts a plan. This skill first inspects the Linear issue for a checkable durable artifact. A valid stored plan is executed verbatim; missing or unusable stored-plan data selects the same autonomous planning pipeline as `run`. The choice is deterministic from the issue description, never inferred from conversation history or from a claim that another agent ran.

Both paths converge on `run`'s implementation and delivery chain. Invoking this skill authorizes the whole flow: there is no plan-approval gate.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `<Linear issue>` — a Linear identifier such as `ENG-123`, or a Linear issue URL.

## Input resolution

Identical to the `plan` skill — see [its Input resolution section](../plan/SKILL.md#input-resolution) — narrowed to Linear issues, because this skill always reads the Linear issue before choosing its plan source.

## Preconditions

**Only the Linear issue is required.** A stored plan is an optimization and an execution contract when valid, not an admission gate. This skill never invokes `linear-plan` and never writes or repairs a stored plan. Its fresh plan lives in the normal harness plan file owned by `run`.

**The plan is a snapshot, not a live view.** It was drafted against the tree recorded in its `Base:` field, which may no longer be current. This skill reports that drift and proceeds, because refusing would contradict the one thing it promises: to follow the stored plan without changes. Judging whether drift matters is the reader's call, and the report is what makes the call possible.

## Task Progress Protocol

Create all 9 tasks with TaskCreate, in order, before any work. Set each to `in_progress` at the start of its phase and `completed` at the end. The three plan tasks are real work on the fresh-plan path. On the stored-plan path they record selecting, validating, and freezing the existing artifact without revising it.

| #   | Subject             | ActiveForm             |
| --- | ------------------- | ---------------------- |
| 1   | Resolve input       | Resolving input        |
| 2   | Inspect stored plan | Inspecting stored plan |
| 3   | Gather context      | Gathering context      |
| 4   | Establish plan      | Establishing plan      |
| 5   | Validate plan       | Validating plan        |
| 6   | Finalize plan       | Finalizing plan        |
| 7   | Commit changes      | Committing changes     |
| 8   | Create PR           | Creating PR            |
| 9   | Monitor PR          | Monitoring PR          |

## Task

$ARGUMENTS

## Phase 0: Resolve input

Create the 9 tasks, then set task 1 to `in_progress`.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Stop when the project lists no `linear` tracker in `agents.trackers`, or when the input is not a Linear issue: `linear-run needs a Linear issue (e.g. ENG-123) on a Linear-tracked project. Use /autopilot:run instead.`

Set task 1 to `completed`.

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool name `get_issue`.

## Phase 1: Inspect the stored plan

Set task 2 to `in_progress`. This phase runs before context gathering so the rest of the workflow knows which plan source it will use.

Fetch the issue with `get_issue` and read its `description`. This is one fetch more than the [Phase 2](#phase-2-gather-context) fan-out would make on its own, and it is deliberate: the plan source must be chosen from a checkable artifact before implementation starts.

Then resolve exactly one verdict. The rows are the resolution order: evaluate them top-to-bottom and stop at the first test that fires.

| Verdict              | Test                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **missing**          | the description contains no `## Implementation plan` line                                                                                           |
| **version-mismatch** | the `Format:` field on the line below the anchor is absent, or names a version this skill does not read (currently `v1`)                            |
| **malformed**        | any required section from [the stored format](../linear-plan/SKILL.md#the-stored-plan-format) is absent — name the specific omission in the message |
| **unverifiable**     | a numbered step in `### Implementation Steps` carries no `verify:` line                                                                             |
| **valid**            | anything that survives all four rows above — an anchor, a readable `Format:`, every required section, and a `verify:` on every step                 |

**The order is load-bearing.** Check the anchor and the format version _before_ the sections. A plan stored under an older template is missing sections this skill expects, so a subsection check reached first would report a perfectly good older plan as `malformed` — telling the user their ticket is corrupt when it is merely older, and inviting them to throw away a valid stored artifact. `Format:` exists precisely to keep those two cases apart.

Map the verdict to one of two modes:

| Verdict                                                            | Mode          | Action                                                                 |
| ------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------- |
| **valid**                                                          | `stored-plan` | Preserve and execute the required stored sections verbatim             |
| **missing**, **version-mismatch**, **malformed**, **unverifiable** | `fresh-plan`  | Draft a new plan through the shared pipeline, then implement that plan |

For a `fresh-plan` verdict, report the reason in one line before continuing:

- missing — `No executable stored plan found on <LINEAR-ID>; drafting a fresh implementation plan from the issue.`
- version-mismatch — `Stored plan on <LINEAR-ID> uses unsupported format <found>; drafting a fresh implementation plan without modifying the stored artifact.`
- malformed — `Stored plan on <LINEAR-ID> is malformed: <what was absent>; drafting a fresh implementation plan without executing the malformed artifact.`
- unverifiable — `Stored plan on <LINEAR-ID> has a step with no verify line; drafting a fresh implementation plan instead of executing it strictly.`

These are diagnostics, not rejection messages. Do not stop, invoke `linear-plan`, or write a replacement plan to the Linear issue. Invalid stored text remains issue context, but it is never treated as executable instructions. The fresh plan belongs to this run's harness plan file.

For `stored-plan` mode only, report how far the plan has aged. Both checks below are advisory and never a verdict — they inform the reader, they do not stop the run.

**Revision drift.** Compare the plan's `Base:` against `git rev-parse origin/main`. When they differ, report `Stored plan was drafted against <base>; origin/main is now <current>`.

**Path drift.** Check each path named in the stored `### Files` list against the checkout, and report the ones that are gone: `Stored plan names <n> path(s) that no longer exist: <paths>`. Say so explicitly when every path resolves, because silence is indistinguishable from the check not running.

Two entry shapes need handling before the existence test, and getting either wrong reports every file as missing:

- **Strip a trailing `:<line>`.** The plan template writes an existing file as `` `path/to/file.ts:NN` ``, which is a location rather than a path — test `path/to/file.ts`, not the whole token.
- **Skip anything marked `(new)`.** The template uses that suffix for files the plan intends to create, so they are absent by design.

Reporting either shape as drift would cry wolf on every plan, which costs more than the check is worth.

A `Base:` SHA says the tree moved; it does not say whether it moved underneath _this_ plan. The `### Files` list is the plan's own statement of what it expects to touch, so checking it is what turns "possibly stale" into a specific answer — and a step that would otherwise fail mid-run, in a session with no latitude to improvise, becomes something the reader can weigh before the first edit.

Set task 2 to `completed`.

## Phase 2: Gather context

Set task 3 to `in_progress`. Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, the Linear issue id, repository, repository root, the matched tracker's Linear team, and the raw task text as the task summary. Omit `Scope` — the default `task` scope is right here.

Nothing in the fan-out is gated off. A stored plan records what to do, not what the repository looks like; a fresh plan needs the full Context Map as its drafting input. In both modes the standards digest, branch diff, TODO search, and a fresh context-source acquisition still run. A recorded `outputId` would be useless anyway, since it is session-scoped and dead in any later session.

**Accept the context source before continuing.** Read [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md) and check the returned map's **Snapshot** field against it: it must carry that block's `context-source:` line naming the tier the fan-out selected. When the field is absent, or carries no such line, stop:

`Context phase failed on <LINEAR-ID>: gather-context returned no context-source selection.`

This stop is fatal, unlike a `digestError` the map records and moves past. A degraded digest costs the plan some context; an unrecorded selection means nothing bounds the repository reads that follow — which is the failure the gate exists for, since a production run once completed its entire pre-implementation pass on ordinary traversal, making zero graph and zero pack calls in a repository that had both. Re-run the skill, or file against it if the fan-out keeps returning no selection; do not continue by hand.

Set task 3 to `completed`.

## Phase 3: Preflight verdict

Identical to [`run`](../run/SKILL.md#phase-2-preflight-verdict): read branch, worktree, `isStaleMerged`, and `baseAhead` from the Context Map, compare the issue id against the current branch name, and invoke `Skill(autopilot:preflight-check)` only for a state the map does not cover. If it outputs "Planning cancelled", stop immediately.

This skill never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Phase 4: Establish the execution plan

Complete tasks 4–6 in order according to the mode selected in [Phase 1](#phase-1-inspect-the-stored-plan).

### Stored-plan mode

Set task 4 to `in_progress`. Merge the stored plan with the Context Map using this fixed split:

| Source                  | Section                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| Stored plan             | `### Summary`, `### Implementation Steps`, `### Files`                        |
| Stored plan, **unused** | `### Pre-Implementation`, `### Post-Implementation`                           |
| Context Map             | Issue, Related TODOs, In-flight changes, Git state, Snapshot, Session history |

The two unused sections are read past deliberately. They describe a branch and a post-implementation chain, and this skill supplies both from `run` — the branch because it must be created in _this_ checkout, and the chain because `run` owns it. Consuming a stored copy would mean executing a branch step written for a tree that no longer exists. Set task 4 to `completed`.

Set task 5 to `in_progress`. Confirm the `valid` verdict and drift report from Phase 1. Do not run an expert review of your own: the stored artifact records its producer's review outcome — a score or an explicit skip — and this skill executes the plan, it does not re-assess it. Set task 5 to `completed`.

Set task 6 to `in_progress`. Freeze the required stored sections as the execution plan without rewriting them or writing a harness replacement. Set task 6 to `completed`.

### Fresh-plan mode

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — draft, review and score, finalize — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md). Use the Common Instructions and plan-file header rule from [`run`](../run/SKILL.md#common-instructions).

The pipeline's phases track this skill's plan tasks by subject: its Draft-plan phase is the Establish-plan task, its Review-and-score phase the Validate-plan task, and its Finalize phase the Finalize-plan task.

The resulting harness plan is the execution plan for this run only. Do not store it on the Linear issue.

## Phase 5: Set the execution contract

In `stored-plan` mode, the stored `### Implementation Steps` must be worked in order, verifying each against its own `verify:` line before moving on. Verbatim means verbatim: do not re-draft, reorder, merge, or add steps. Where a step cannot be carried out as written, stop and report which step and why. Treat the stored `### Files` list as the expected blast radius and report any required expansion.

In `fresh-plan` mode, the finalized harness plan is the execution contract exactly as it is for [`run`](../run/SKILL.md#phase-5-implement-and-proceed). This mode is autonomous and adds no approval prompt.

**The selected source bounds both modes.** Repository investigation before the first edit is served from the source the Context Map recorded — in `stored-plan` mode as much as in `fresh-plan` mode. A stored plan names the files to touch; it is not a licence to re-derive the repository with ordinary traversal, and the audited failure this answers was a stored-plan run. Reads outside the selected source carry the shared block's `context-fallback:` line, and broad rediscovery does not become valid because a plan already exists.

## Phase 6: Branch and run the autopilot chain

Follow [`run`'s Phase 4](../run/SKILL.md#phase-4-embed-branch-creation-and-the-autopilot-chain) and [Phase 5](../run/SKILL.md#phase-5-implement-and-proceed) without an approval gate.

- In `fresh-plan` mode, embed the Linear branch block and autopilot post-implementation block in the harness plan exactly as `run` does.
- In `stored-plan` mode, do not modify the Linear description or synthesize a replacement plan file. Invoke `Skill(autopilot:branch-create)` with the Linear issue using the body from [branch-blocks.md](../plan/references/branch-blocks.md), then implement the frozen stored steps.

After implementation, both modes use the same commit, push, pull-request, and monitoring chain.

`run` numbers its delivery tasks differently; track them by subject — where its chain sets the Commit-changes, Create-PR, or Monitor-PR task, use this skill's task of the same name.

Those phases are otherwise referenced, never copied. Two long prompts restating the same chain would drift the first time one side changed, and `run` already sets this precedent by referencing `plan` for input resolution and Common Instructions.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
