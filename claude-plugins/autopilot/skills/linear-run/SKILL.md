---
name: linear-run
description: Run any Linear issue end to end. Executes a valid stored plan verbatim when one exists; otherwise drafts and implements a fresh plan without a human approval gate.
argument-hint: "[--brief <path>] <Linear issue (ENG-123 or a Linear issue URL)>"
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
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:branch-create)
  - Skill(autopilot:pr-monitor)
  - Skill(autopilot:pr-update)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

Run any Linear issue end to end. Prefer the durable plan [`linear-plan`](../linear-plan/SKILL.md) stored in its description when that artifact validates; otherwise draft and implement a fresh plan from the issue context.

**Difference from [`/autopilot:run`](../run/SKILL.md):** `run` always drafts a plan. This skill first inspects the Linear issue for a checkable durable artifact. A valid stored plan is executed verbatim; missing or unusable stored-plan data selects the same autonomous planning pipeline as `run`. The choice is deterministic from the issue description, never inferred from conversation history or from a claim that another agent ran.

Both paths converge on `run`'s implementation and delivery chain. Invoking this skill authorizes the whole flow: there is no plan-approval gate.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `<Linear issue>` — a Linear identifier such as `ENG-123`, or a Linear issue URL.

## Input resolution

Follow the shared [input resolution](../plan/references/input-detection.md#shared-input-resolution) for this caller.

## Preconditions

**Only the Linear issue is required.** A stored plan is an optimization and an execution contract when valid, not an admission gate. This skill never invokes `linear-plan` and never writes or repairs a stored plan. Its fresh plan lives in the normal harness plan file owned by `run`.

**The plan is a snapshot, not a live view.** It was drafted against the tree recorded in its `Base:` field, which may no longer be current. This skill reports that drift and proceeds, because refusing would contradict the one thing it promises: to follow the stored plan without changes. Judging whether drift matters is the reader's call, and the report is what makes the call possible.

## Explicit brief input

For `--brief <path>`, follow the shared [explicit brief procedure](../gather-context/references/brief-validation.md#optional-brief-flag) before issue detection and gathering.

## Task Progress Protocol

Track only these substantive outcomes: **Gather context**, **Establish execution plan**, **Implement and verify**, **Deliver PR**. Create them together where the runtime supports batching, or as one checklist otherwise. Update at outcome boundaries; input parsing, artifact freezing, and draft/finalize are not separate tasks. Identify tasks by subject, never numeric IDs.

## Task

$ARGUMENTS

## Phase 0: Resolve input

Resolve input before starting Gather context.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Stop when the project lists no `linear` tracker in `agents.trackers`, or when the input is not a Linear issue: `linear-run needs a Linear issue (e.g. ENG-123) on a Linear-tracked project. Use /autopilot:run instead.`

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool name `get_issue`.

## Phase 1: Inspect the stored plan

Fetch the issue with `get_issue` once and retain its complete description and returned metadata as `Resolved issue`, bound to the requested identifier and team. Pass it into gather-context; do not fetch the same ticket again through the API-key helper. Fetch only missing required fields through the same MCP provider. Resolve intent from the task and issue before choosing research.

Then resolve exactly one verdict. The rows are the resolution order: evaluate them top-to-bottom and stop at the first test that fires.

| Verdict              | Test                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **missing**          | the description contains no `## Implementation plan` line                                                                                                                     |
| **version-mismatch** | the `Format:` field on the line below the anchor is absent, or names a version this skill does not read (currently `v1` and `v2`)                                             |
| **malformed**        | any version-required section from [the stored format](../linear-plan/references/plan-storage.md#the-stored-plan-format) is absent — name the specific omission in the message |
| **unverifiable**     | a numbered step in `### Implementation Steps` carries no `verify:` line                                                                                                       |
| **valid**            | anything that survives all four rows above — an anchor, a readable `Format:`, every required section, and a `verify:` on every step                                           |

**The order is load-bearing.** Check the anchor and the format version _before_ the sections. A plan stored under an older template is missing sections this skill expects, so a subsection check reached first would report a perfectly good older plan as `malformed` — telling the user their ticket is corrupt when it is merely older, and inviting them to throw away a valid stored artifact. `Format:` exists precisely to keep those two cases apart.

For `v1`, require Summary, Implementation Steps, and Files; Context evidence is optional. For `v2`, also require Context evidence with its recorded revision and source pointers (or an explicit incomplete/none record). Evidence is navigation and constraint provenance, never permission to skip current standards.

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

## Phase 2: Gather context

```
Skill(autopilot:gather-context)
```

Pass the detected input type, the Linear issue id, repository, repository root, the matched tracker's Linear team, and the raw task text as the task summary. Use `Scope: task` unless the explicit brief selected `Scope: primed`.

Pass `Resolved issue` in both modes. For stored-plan mode, also pass the Files list and Implementation Steps as file seeds and relationships, plus durable Context evidence when present. Gather current implementations, directly relevant dependencies/tests, and applicable standards; expand only for a named gap. Fresh-plan mode uses ordinary task discovery. Both retain fresh Git state and current source evidence; never reuse a stored `outputId`. History follows gather-context’s demand trigger.

**Accept the context source before continuing.** Read [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md) and check the returned map's **Snapshot** field against it: it must carry that block's `context-source:` line naming the tier the fan-out selected. When the field is absent, or carries no such line, stop:

`Context phase failed on <LINEAR-ID>: gather-context returned no context-source selection.`

**A graphify label needs the evidence behind it.** When the field reads `context-source: graphify`, check it against the block's evidence record: a `graphify-trace:` line whose `queries=` is one or more, and a `graphify-shortlist:` carrying at least one entry. When either is absent, stop:

`Context phase failed on <LINEAR-ID>: gather-context declared graphify with no query evidence.`

These source-selection failures are fatal: report the missing trace or shortlist rather than proceeding with an unevidenced label. A `digestError` still records degraded content, with affected standards decisions left open. Plan, run, and run-primed remain ungated at this particular selection check and carry source evidence into their plan output.

## Phase 3: Preflight verdict

Identical to [`run`](../run/SKILL.md#phase-2-preflight-verdict): invoke `Skill(autopilot:preflight-check)` with `mode: plan` unconditionally — this is the session's single preflight and the one place the history-policy gate installs — passing the Context Map's branch, worktree, `isStaleMerged`, and `baseAhead` plus the issue-id-versus-branch-name comparison so it prompts only where the map leaves a real decision. If it outputs "Planning cancelled", stop immediately.

This skill never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Phase 4: Establish the execution plan

Complete one Establish execution plan outcome according to the selected mode.

### Stored-plan mode

Read [stored-plan execution](references/stored-plan-execution.md) only in this mode.

Preserve the required stored sections and use the current Context Map as prescribed by the reference; never re-draft the steps.

### Fresh-plan mode

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — one Write plan outcome — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md). Read [common-instructions.md](../plan/references/common-instructions.md) for drafting and output rules.

The shared pipeline completes the Establish execution plan outcome; draft and finalize do not create additional progress tasks.

The resulting harness plan is the execution plan for this run only. Do not store it on the Linear issue.

## Phase 5: Set the execution contract

In `stored-plan` mode, the stored `### Implementation Steps` must be worked in order, verifying each against its own `verify:` line before moving on. Verbatim means verbatim: do not re-draft, reorder, merge, or add steps. Where a step cannot be carried out as written, stop and report which step and why. Treat the stored `### Files` list as the expected blast radius and report any required expansion.

In `fresh-plan` mode, the finalized harness plan is the execution contract exactly as it is for [`run`](../run/SKILL.md#phase-5-implement-and-proceed). This mode is autonomous and adds no approval prompt.

**The selected source bounds both modes.** Repository investigation before the first edit is served from the source the Context Map recorded — in `stored-plan` mode as much as in `fresh-plan` mode. A stored plan names the files to touch; it is not a licence to re-derive the repository with ordinary traversal, and the audited failure this answers was a stored-plan run. Reads outside the selected source carry the shared block's `context-fallback:` line, and broad rediscovery does not become valid because a plan already exists.

**Both modes consume the evidence record before traversal.** On the graph tier the map's shortlist is the first place investigation looks, in `stored-plan` mode and `fresh-plan` mode alike — its entries carry the relationship that put them there, so they answer where to look and why without a query being repeated. Only once the shortlist is exhausted does anything else happen, and then as a recorded `context-fallback:` read rather than a fresh sweep. A shortlist that arrived and went unread is the same waste as a graph that was never queried, one step later.

## Phase 6: Branch and run the autopilot chain

Follow [`run`'s Phase 4](../run/SKILL.md#phase-4-embed-branch-creation-and-the-autopilot-chain) and [Phase 5](../run/SKILL.md#phase-5-implement-and-proceed) without an approval gate.

- In `fresh-plan` mode, embed the Linear branch block and autopilot post-implementation block in the harness plan exactly as `run` does.
- In `stored-plan` mode, do not modify the Linear description or synthesize a replacement plan file. When the frozen plan explicitly requires no repository file changes, defer branch creation; otherwise invoke `Skill(autopilot:branch-create)` with the Linear issue using the body from [branch-blocks.md](../plan/references/branch-blocks.md). Then implement the frozen stored steps.

After implementation, both modes evaluate `run`'s [no-repository-change exit](../run/SKILL.md#no-repository-change-exit). A qualifying run reports `Outcome: no_repository_change`; every other successful run uses the same commit, push, pull-request, and monitoring chain.

Track the shared commit, PR, and monitoring chain as this skill’s single Deliver PR outcome.

Those phases are otherwise referenced, never copied. Two long prompts restating the same chain would drift the first time one side changed, and `run` already sets this precedent by referencing `plan` for input resolution and Common Instructions.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
