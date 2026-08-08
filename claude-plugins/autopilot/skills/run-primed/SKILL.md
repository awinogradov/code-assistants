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

Run a tracked issue end to end in a session an [`explore`](../explore/SKILL.md) pass has already primed, reading the repository from the durable context brief instead of mapping it a second time.

**Difference from [`/autopilot:run`](../run/SKILL.md):** `run` treats a fresh Context Map as its entire view of the repository, which is correct for an interactive session and stays that way. This skill is the strict alternative for an orchestrator that primed a session against an exact revision and forked it into a clean checkout of that same revision. It is a **separate contract, not a heuristic** — it never inspects conversation history to decide whether context was already gathered, because a file on disk carrying a base SHA can be checked and a prompt claiming "context was already gathered" cannot.

Everything after [Phase 3](#phase-3-merge-the-working-context) is `run`, unchanged and referenced rather than restated. Like `run`, invoking this skill authorizes the whole flow: there is no plan-approval gate.

## Input

Arguments: `$ARGUMENTS`

Identical to [`run`](../run/SKILL.md#input) — a task description, a GitHub or Linear issue, or a code-scanning alert. `--issue` / `--linear-issue` remain plan-exclusive.

## Input resolution

Identical to the `plan` skill — see [its Input resolution section](../plan/SKILL.md#input-resolution).

## Preconditions

Both are silent failures if left unstated, so state them to the user when either bites.

**The brief is untracked.** `.claude/context/` is listed in `.gitignore`, so git never carries `brief.md` into a fresh clone or a forked checkout. Placing it there is the **orchestrator's** responsibility, alongside restoring the session transcript. This skill owns validation and consumption of that artifact and deliberately knows nothing about how it was persisted. A forked transcript on its own is **not** sufficient: without the validated brief there is no checkable evidence of what was mapped, and the run stops.

**Full history is required.** Resolving and comparing the recorded revision uses `git cat-file -e` and `git merge-base`, both of which need the objects present. In a shallow clone an older base is unresolvable and `stale` collapses into `revision-mismatch`, so the orchestrator must clone with full history — the same reason [`validate-actions`](../../../../.github/actions/validate-actions/action.yml) pins `fetch-depth: 0`.

## Task Progress Protocol

Create all 8 tasks with TaskCreate, in order, before any work, exactly as [`run`](../run/SKILL.md#task-progress-protocol) defines them. Set each to `in_progress` at the start of its phase and `completed` at the end. Brief validation happens inside task 2 ("Gather context"), because it is the gate on that task's input rather than a step of its own.

## Task

$ARGUMENTS

## Phase 0: Resolve input

Create the 8 tasks, then set task 1 to `in_progress`.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**.

Set task 1 to `completed`.

## Phase 1: Validate the brief

Set task 2 to `in_progress`. This phase is the entire reason this skill exists as a separate door, so it runs before anything is fetched and it stops the run rather than degrading.

Resolve the repository root with `git rev-parse --show-toplevel`; the brief lives at `<root>/.claude/context/brief.md`, one per worktree.

Then resolve exactly one verdict. The rows are the resolution order: evaluate them top-to-bottom and stop at the first test that fires.

| Verdict               | Test                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **missing**           | Read `<root>/.claude/context/brief.md` with the **`Read` tool** — the brief does not exist at that path                                                                                              |
| **malformed**         | from that same read: no `Base:` line, or any of the nine fixed `##` sections listed in [Phase 3](#phase-3-merge-the-working-context) absent — name the specific omission in the message              |
| **revision-mismatch** | `git cat-file -e "<base>^{commit}"` exits non-zero (the recorded revision does not resolve here), or `git merge-base --is-ancestor "<base>" HEAD` exits non-zero (this checkout does not contain it) |
| **stale**             | `git rev-parse origin/main` prints something other than `<base>` — the recorded base resolves and is contained in `HEAD`, but is not the checkout's `origin/main`                                    |
| **valid**             | anything that survives all four rows above — the recorded base equals `git rev-parse origin/main` **and** is an ancestor-or-equal of `HEAD`                                                          |

**The missing and malformed rows are file checks, and they must precede every `git` command.** Reach `git cat-file` with an empty base — a brief with no `Base:` line — and it exits non-zero, reporting `revision-mismatch` for what is actually a `malformed` brief. The section-presence check has no git equivalent at all: a brief whose base matches `origin/main` but whose `## Key types` is missing would otherwise pass as `valid`, which is precisely the case this gate exists to catch.

Parse both values with the `Read` tool rather than shelling out to `sed`, `grep`, or `head`, and compare the stale-row SHA against `<base>` yourself rather than with `test`. `git` and `gh` are the only commands on this skill's tool allowlist, so a text-extraction or comparison pipeline is blocked before it runs — and the gate would then fail for the wrong reason, reporting a broken skill instead of a bad brief.

**Compare against `origin/main`, never `HEAD`.** [`explore`](../explore/SKILL.md#phase-4-write-the-brief) writes `Base: <origin/main SHA>` and its own [classification](../explore/SKILL.md#phase-0-classify-the-run) re-reads it against `origin/main`. Validating against `HEAD` would reject every brief written in a session whose branch had moved ahead — which is the ordinary explore session, since producing commits is the point of one — leaving the producer and the consumer in open disagreement about what "current" means. The ancestor test is the other half: it confirms the working tree actually contains the recorded revision. `git merge-base --is-ancestor` is also what keeps "an older revision of this history" distinguishable from "a different history entirely", which is why `stale` and `revision-mismatch` are separate verdicts rather than one.

**Do not `git fetch`.** The checkout's `origin/main` ref is the base the orchestrator produced; re-fetching would let an unrelated upstream merge fail a correctly primed run. Requiring the recorded base to equal `origin/main` also makes the later branch-from-an-up-to-date-`main` step a no-op in the happy path, so the tree the plan is drafted against is the tree it is implemented against.

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

Pass the detected input type, issue id, repository, repository root, Linear team (when applicable), the raw task text as the task summary, and **`Scope: primed`**.

That scope resolves only what a brief cannot bake in advance: issue or alert details, the TODO search, the branch diff, git state, and a re-attached codebase snapshot. It gates off [`digest-repo-standards`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-repo-standards.md), whose output the brief already carries from the same revision. See [the Scope input](../gather-context/SKILL.md#input).

Set task 2 to `completed`.

## Phase 3: Merge the working context

The brief supplies the repository half, the Context Map the volatile half. The split is fixed here rather than improvised per run:

| Source            | Section                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Brief             | `## Architecture map`, `## Data flow`, `## Conventions and standards`, `## Key types`, `## Test and verify` |
| Brief, **unused** | `## Snapshot`, `## In-flight changes`, `## Local session state`, `## Git state`                             |
| Context Map       | Issue / alert, Related TODOs, In-flight changes, Git state, Snapshot, Session history                       |

The brief's three volatile sections are ignored because they were computed in the explore session, in a different checkout — the Context Map's equivalents describe _this_ one. `## Snapshot` is stable yet also unused: the repomix `outputId` it records is session-scoped and dead in a forked session, so the map's freshly selected source is the one to read.

Carry the brief's `## Conventions and standards` into the plan's applicable-standards record. That section doubles as the audit log of what the plan was drafted against, so it must never read `none` on this path merely because the digest agent was skipped.

## Phase 4: Preflight verdict

Identical to [`run`](../run/SKILL.md#phase-2-preflight-verdict): read branch, worktree, `isStaleMerged`, and `baseAhead` from the Context Map, compare the issue id against the current branch name, and invoke `Skill(autopilot:preflight-check)` only for a state the map does not cover. If it outputs "Planning cancelled", stop immediately.

This skill never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Common Instructions

The [Common Instructions in `plan/SKILL.md`](../plan/SKILL.md#common-instructions) apply unchanged — documentation lookup scaled to the task, repository standards, the plan file header rule, CLAUDE.md compliance, and ASCII schemas. Read them against the merged context from [Phase 3](#phase-3-merge-the-working-context), not against a fresh crawl of the tree.

## Phase 5: Draft, review, and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — draft (task 3), review and score (task 4), finalize (task 5) — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md).

## Phase 6: Branch, implement, and run the autopilot chain

Identical to `run`. Embed the branch block and the automated tail per [its Phase 4](../run/SKILL.md#phase-4-embed-branch-creation-and-the-autopilot-chain), then proceed without an approval gate per [its Phase 5](../run/SKILL.md#phase-5-implement-and-proceed) — branch, implement every step, then commit, push, open or update the pull request, and monitor it.

Those phases are referenced, never copied. Two long prompts restating the same chain would drift the first time one side changed, and `run` already sets this precedent by referencing `plan` for input resolution and Common Instructions.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
