---
name: linear:run
description: Run a Linear issue end to end from the plan already stored in its description, executing those steps verbatim instead of drafting new ones. Requires a stored plan and fails loudly when it is missing, malformed, or written in a format this skill does not read — it never re-plans.
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

Run a Linear issue end to end from the plan [`linear:plan`](../linear:plan/SKILL.md) already stored in its description, executing those steps as written instead of drafting new ones.

**Difference from [`/autopilot:run`](../run/SKILL.md):** `run` drafts a plan, reviews it, and implements it in one session, which is correct when the person running it is the person who wanted it. This skill is the path for a durable plan somebody already wrote — on the ticket, before this session started. It is a **separate contract, not a heuristic**: it never inspects conversation history to decide whether a plan exists, because a description carrying a parseable format marker can be checked and a prompt claiming "the plan is ready" cannot.

Everything after [Phase 3](#phase-3-merge-the-working-context) is `run`, unchanged and referenced rather than restated. Like `run`, invoking this skill authorizes the whole flow: there is no plan-approval gate.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `<Linear issue>` — a Linear identifier such as `ENG-123`, or a Linear issue URL.

## Input resolution

Identical to the `plan` skill — see [its Input resolution section](../plan/SKILL.md#input-resolution) — narrowed to Linear issues, since a stored plan lives on a Linear issue and nowhere else.

## Preconditions

Both are silent failures if left unstated, so state them to the user when either bites.

**The plan must already be stored.** This skill reads; it never writes a plan. If nobody has run [`linear:plan`](../linear:plan/SKILL.md) on the ticket, there is nothing here to execute, and the run stops. A ticket description written by hand is not a stored plan either — the format marker is what makes it executable.

**The plan is a snapshot, not a live view.** It was drafted against the tree recorded in its `Base:` field, which may no longer be current. This skill reports that drift and proceeds, because refusing would contradict the one thing it promises: to follow the stored plan without changes. Judging whether drift matters is the reader's call, and the report is what makes the call possible.

## Task Progress Protocol

Create all 6 tasks with TaskCreate, in order, before any work. Set each to `in_progress` at the start of its phase and `completed` at the end. Loading the plan is its own task rather than a step inside the context gather, because it is a gate that can stop the run on its own.

| #   | Subject          | ActiveForm          |
| --- | ---------------- | ------------------- |
| 1   | Resolve input    | Resolving input     |
| 2   | Load stored plan | Loading stored plan |
| 3   | Gather context   | Gathering context   |
| 4   | Commit changes   | Committing changes  |
| 5   | Create PR        | Creating PR         |
| 6   | Monitor PR       | Monitoring PR       |

There is no draft, review, or finalize task. That is the whole difference: the artifact those three tasks would produce already exists.

## Task

$ARGUMENTS

## Phase 0: Resolve input

Create the 6 tasks, then set task 1 to `in_progress`.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Stop when the project lists no `linear` tracker in `agents.trackers`, or when the input is not a Linear issue: `linear:run needs a Linear issue (e.g. ENG-123) on a Linear-tracked project. Use /autopilot:run instead.`

Set task 1 to `completed`.

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool name `get_issue`.

## Phase 1: Load and validate the stored plan

Set task 2 to `in_progress`. This phase is the entire reason this skill exists as a separate door, so it runs before any context is gathered and it stops the run rather than degrading.

Fetch the issue with `get_issue` and read its `description`. This is one fetch more than the [Phase 2](#phase-2-gather-what-the-plan-cannot-carry) fan-out would make on its own, and it is deliberate: a ticket with no stored plan should fail before a full context fan-out is paid for, not after.

Then resolve exactly one verdict:

| Verdict              | Test                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| **missing**          | the description contains no `## Implementation plan` line                              |
| **version-mismatch** | the `Format:` value is absent or is not one this skill reads (currently `v1`)          |
| **malformed**        | any of the required `###` sections is absent                                           |
| **unverifiable**     | a numbered step in `### Implementation Steps` carries no `verify:` line                |
| **valid**            | an anchor, a readable `Format:`, every required section, and a `verify:` on every step |

Resolve in this exact order, stopping at the first that fires:

1. **missing** — no `## Implementation plan` line in the description.
2. **version-mismatch** — the `Format:` field on the line below the anchor is absent, or names a version this skill does not read.
3. **malformed** — any required section from [the stored format](../linear:plan/SKILL.md#the-stored-plan-format) is absent. Name the specific omission in the message.
4. **unverifiable** — a numbered step carries no `verify:` line.

Anything that survives all four is **valid**.

**The order is load-bearing.** Check the anchor and the format version _before_ the sections. A plan stored under an older template is missing sections this skill expects, so a subsection check reached first would report a perfectly good older plan as `malformed` — telling the user their ticket is corrupt when it is merely older, and inviting them to throw away a valid stored artifact. `Format:` exists precisely to keep those two cases apart.

On any verdict other than **valid**, stop with the matching message and do not fall back:

- missing — `No stored plan on <LINEAR-ID>. Run /autopilot:linear-plan <LINEAR-ID> to create and store one, or use /autopilot:run to plan and implement in one session.`
- version-mismatch — `Stored plan on <LINEAR-ID> uses format <found>, which this skill does not read. Re-run /autopilot:linear-plan <LINEAR-ID> to store it in the current format.`
- malformed — `Stored plan on <LINEAR-ID> is malformed: <what was absent>. Re-run /autopilot:linear-plan <LINEAR-ID>, or use /autopilot:run instead.`
- unverifiable — `Stored plan on <LINEAR-ID> has a step with no verify line, so it cannot be executed strictly. Re-run /autopilot:linear-plan <LINEAR-ID> to regenerate it.`

Each message names the skill that would fix it. **Never invoke that skill automatically** — a silent re-plan discards the durable artifact the issue carries and replaces it with a different plan while looking like success. That is precisely the outcome this skill exists to make visible.

Finally, report how far the plan has aged. Both checks below are advisory and never a verdict — they inform the reader, they do not stop the run.

**Revision drift.** Compare the plan's `Base:` against `git rev-parse origin/main`. When they differ, report `Stored plan was drafted against <base>; origin/main is now <current>`.

**Path drift.** Check each path named in the stored `### Files` list against the checkout, and report the ones that are gone: `Stored plan names <n> path(s) that no longer exist: <paths>`. Say so explicitly when every path resolves, because silence is indistinguishable from the check not running.

Two entry shapes need handling before the existence test, and getting either wrong reports every file as missing:

- **Strip a trailing `:<line>`.** The plan template writes an existing file as `` `path/to/file.ts:NN` ``, which is a location rather than a path — test `path/to/file.ts`, not the whole token.
- **Skip anything marked `(new)`.** The template uses that suffix for files the plan intends to create, so they are absent by design.

Reporting either shape as drift would cry wolf on every plan, which costs more than the check is worth.

A `Base:` SHA says the tree moved; it does not say whether it moved underneath _this_ plan. The `### Files` list is the plan's own statement of what it expects to touch, so checking it is what turns "possibly stale" into a specific answer — and a step that would otherwise fail mid-run, in a session with no latitude to improvise, becomes something the reader can weigh before the first edit.

Set task 2 to `completed`.

## Phase 2: Gather what the plan cannot carry

Set task 3 to `in_progress`. Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, the Linear issue id, repository, repository root, the matched tracker's Linear team, and the raw task text as the task summary. Omit `Scope` — the default `task` scope is right here.

A stored plan is not a repository brief: it records what to do, not what the repository looks like. So unlike [`run-primed`](../run-primed/SKILL.md), nothing in the fan-out is gated off — the standards digest, the branch diff, the TODO search, and a freshly attached snapshot all still run. A recorded `outputId` would be useless anyway, since it is session-scoped and dead in any later session.

Set task 3 to `completed`.

## Phase 3: Merge the working context

The stored plan supplies the work; the Context Map supplies the repository. The split is fixed here rather than improvised per run:

| Source                  | Section                                                      |
| ----------------------- | ------------------------------------------------------------ |
| Stored plan             | `### Summary`, `### Implementation Steps`, `### Files`       |
| Stored plan, **unused** | `### Pre-Implementation`, `### Post-Implementation`          |
| Context Map             | Issue, Related TODOs, In-flight changes, Git state, Snapshot |

The two unused sections are read past deliberately. They describe a branch and a post-implementation chain, and this skill supplies both from `run` — the branch because it must be created in _this_ checkout, and the chain because `run` owns it. Consuming a stored copy would mean executing a branch step written for a tree that no longer exists.

## Phase 4: Preflight verdict

Identical to [`run`](../run/SKILL.md#phase-2-preflight-verdict): read branch, worktree, `isStaleMerged`, and `baseAhead` from the Context Map, compare the issue id against the current branch name, and invoke `Skill(autopilot:preflight-check)` only for a state the map does not cover. If it outputs "Planning cancelled", stop immediately.

This skill never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Phase 5: Execute the stored steps verbatim

Work the stored `### Implementation Steps` in order, verifying each against its own `verify:` line before moving on.

Verbatim means verbatim. Do not re-draft a step, re-order the list, merge steps, add a step, or run another expert review — the scored artifact is already stored. Where a step cannot be carried out as written, stop and report which step and why, rather than silently substituting a different plan. A plan that no longer fits its repository is information the reader needs, not a problem to route around silently.

The stored `### Files` list is the expected blast radius. Touching a file it does not name is worth reporting for the same reason.

## Phase 6: Branch, implement, and run the autopilot chain

Identical to `run`. Embed the branch block per [its Phase 4](../run/SKILL.md#phase-4-embed-branch-creation-and-the-autopilot-chain) using the Linear body from [branch-blocks.md](../plan/references/branch-blocks.md), then proceed without an approval gate per [its Phase 5](../run/SKILL.md#phase-5-implement-and-proceed) — branch, implement every step, then commit, push, open or update the pull request, and monitor it.

**Substitute the task numbers.** Those phases hardcode `run`'s numbering, and this skill creates six tasks rather than eight because it has no draft, review, or finalize task to number. Where the referenced steps name a task, use this skill's equivalent instead:

| `run`'s steps say         | Use here                  |
| ------------------------- | ------------------------- |
| task 6 ("Commit changes") | task 4 ("Commit changes") |
| task 7 ("Create PR")      | task 5 ("Create PR")      |
| task 8 ("Monitor PR")     | task 6 ("Monitor PR")     |

Taking those numbers literally would mark "Monitor PR" as in progress while committing, then fail on tasks 7 and 8 that were never created. Everything else in those phases applies verbatim.

Those phases are otherwise referenced, never copied. Two long prompts restating the same chain would drift the first time one side changed, and `run` already sets this precedent by referencing `plan` for input resolution and Common Instructions.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

**Reference self-check (MANDATORY):** after composing the output, re-read it against [`reference-formatting.md`](../shared-rules/references/reference-formatting.md). A bare commit SHA, a bare tracker id outside a magic-word line, or an unlinked mention of a file that exists in the repo is a violation — fix it before emitting.
