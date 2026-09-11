---
name: run-primed
description: Run a tracked issue end to end in a session already primed by /autopilot:explore, consuming the SHA-validated context brief instead of the broad codebase pass. Requires .claude/context/brief.md and fails loudly when it is missing, malformed, stale, or from another revision — it never downgrades to /autopilot:run.
argument-hint: "<task, GitHub/Linear issue (123, #123, ENG-123, or URL), or code-scanning alert (alert#N or URL)>"
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

Run a tracked issue end to end in a session an [`explore`](../explore/SKILL.md) pass has already primed, reading the repository from the durable context brief instead of mapping it a second time.

**Difference from [`/autopilot:run`](../run/SKILL.md):** `run` treats a fresh Context Map as its entire view of the repository, which is correct for an interactive session and stays that way. This skill is the strict alternative for an orchestrator that primed a session against an exact revision and forked it into a clean checkout of that same revision. It is a **separate contract, not a heuristic** — it never inspects conversation history to decide whether context was already gathered, because a file on disk carrying a base SHA can be checked and a prompt claiming "context was already gathered" cannot.

Everything after [Phase 3](#phase-3-merge-the-working-context) is `run`, unchanged and referenced rather than restated. Like `run`, invoking this skill authorizes the whole flow: there is no plan-approval gate.

A brief whose conventions report standards overflow or an incomplete digest does not establish all applicable rules. Retrieve the omitted constraints through a task-scoped standards lookup before deciding affected work; never treat the brief’s revision check as proof of completeness.

## Input

Arguments: `$ARGUMENTS`

Identical to [`run`](../run/SKILL.md#input) — a task description, a GitHub or Linear issue, or a code-scanning alert. `--issue` / `--linear-issue` remain plan-exclusive.

## Input resolution

Resolve arguments through [input-detection.md](../plan/references/input-detection.md), using this caller’s accepted forms and flags. Resolve the repository root once; issue/branch state comes from gathering. Do not load the plan orchestrator for input parsing.

## Preconditions

Both are silent failures if left unstated, so state them to the user when either bites.

**The brief is untracked.** `.claude/context/` is listed in `.gitignore`, so git never carries `brief.md` into a fresh clone or a forked checkout. Placing it there is the **orchestrator's** responsibility, alongside restoring the session transcript. This skill owns validation and consumption of that artifact and deliberately knows nothing about how it was persisted. A forked transcript on its own is **not** sufficient: without the validated brief there is no checkable evidence of what was mapped, and the run stops.

**Full history is required.** Resolving and comparing the recorded revision uses `git cat-file -e` and `git merge-base`, both of which need the objects present. In a shallow clone an older base is unresolvable and `stale` collapses into `revision-mismatch`, so the orchestrator must clone with full history — the same reason [`validate-actions`](../../../../.github/actions/validate-actions/action.yml) pins `fetch-depth: 0`.

## Task Progress Protocol

Track only these substantive outcomes: **Gather context**, **Write plan**, **Implement and verify**, **Deliver PR**. Create them together where the runtime supports batching, or as one checklist otherwise. Update at outcome boundaries; input parsing, artifact freezing, and draft/finalize are not separate tasks. Identify tasks by subject, never numeric IDs.

## Task

$ARGUMENTS

## Phase 0: Resolve input

Resolve input before starting Gather context.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

## Phase 1: Validate the brief

Resolve the repository root with `git rev-parse --show-toplevel`; the brief lives at `<root>/.claude/context/brief.md`, one per worktree.

Read [brief-validation.md](../gather-context/references/brief-validation.md) and resolve its **missing**, **malformed**, **revision-mismatch**, **stale**, or **valid** verdict.

On any verdict other than **valid**, stop with the matching message and do not fall back:

- missing — `No context brief at .claude/context/brief.md. This skill requires a session primed by /autopilot:explore, and the orchestrator must place the brief in this checkout. Use /autopilot:run instead.`
- malformed — `Context brief is malformed: <what was absent>. Re-run /autopilot:explore, or use /autopilot:run instead.`
- revision-mismatch — `Context brief records base <base>, which this checkout does not contain. The brief belongs to another revision. Use /autopilot:run instead.`
- stale — `Context brief records base <base>, but this checkout's origin/main is <head-base>. The brief is stale. Re-run /autopilot:explore, or use /autopilot:run instead.`

Each message names `/autopilot:run` as the caller's explicit fallback. **Never invoke it automatically** — a silent downgrade spends a second full context pass while looking like a success, which is precisely the outcome this skill exists to make visible.

## Phase 2: Gather what the brief cannot carry

Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, issue id, repository, repository root, Linear team (when applicable), the raw task text as the task summary, the validated brief, and **`Scope: primed`**.

That scope resolves only what a brief cannot bake in advance: issue or alert details, the TODO search, the branch diff, git state, and a re-attached codebase snapshot. It reuses unchanged standards only when [brief-reuse.md](../gather-context/references/brief-reuse.md) establishes coverage; otherwise a narrowed standards digest fills the task’s missing constraints. See [the Scope input](../gather-context/SKILL.md#input).

## Phase 3: Merge the working context

The brief supplies the repository half, the Context Map the volatile half. The split is fixed here rather than improvised per run:

| Source            | Section                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Brief             | `## Architecture map`, `## Data flow`, `## Conventions and standards`, `## Key types`, `## Test and verify` |
| Brief, **unused** | `## Snapshot`, `## In-flight changes`, `## Local session state`, `## Git state`                             |
| Context Map       | Issue / alert, Related TODOs, In-flight changes, Git state, Snapshot, Session history                       |

The brief's three volatile sections are ignored because they were computed in the explore session, in a different checkout — the Context Map's equivalents describe _this_ one. `## Snapshot` is stable yet also unused: the repomix `outputId` it records is session-scoped and dead in a forked session, so the map's freshly selected source is the one to read.

Merge the brief’s verified `## Conventions and standards` with current Applicable standards from the Context Map; current rules and retrieved missing clauses supersede stale claims. Carry the result into the plan’s applicable-standards record. That section doubles as the audit log of what the plan was drafted against, so it must never read `none` on this path merely because the digest agent was skipped.

## Phase 4: Preflight verdict

Identical to [`run`](../run/SKILL.md#phase-2-preflight-verdict): invoke `Skill(autopilot:preflight-check)` with `mode: plan` unconditionally — this is the session's single preflight and the one place the history-policy gate installs — passing the Context Map's branch, worktree, `isStaleMerged`, and `baseAhead` plus the issue-id-versus-branch-name comparison so it prompts only where the map leaves a real decision. If it outputs "Planning cancelled", stop immediately.

This skill never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Common Instructions

Read [common-instructions.md](../plan/references/common-instructions.md) once before drafting; its rules apply unchanged — documentation lookup scaled to the task, repository standards, the plan file header rule, CLAUDE.md compliance, and ASCII schemas. Read them against the merged context from [Phase 3](#phase-3-merge-the-working-context), not against a fresh crawl of the tree.

## Phase 5: Draft and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — one Write plan outcome — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md).

## Phase 6: Implement and finish the autopilot run

Identical to `run`. Select and embed the applicable blocks per [its Phase 4](../run/SKILL.md#phase-4-embed-branch-creation-and-the-autopilot-chain), then proceed without an approval gate per [its Phase 5](../run/SKILL.md#phase-5-implement-and-proceed) — implement every step, then either take the inherited [no-repository-change exit](../run/SKILL.md#no-repository-change-exit) or deliver and monitor the pull request.

Those phases are referenced, never copied. Two long prompts restating the same chain would drift the first time one side changed, and `run` already sets this precedent by referencing `plan` for input resolution and Common Instructions.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
