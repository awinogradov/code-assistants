---
name: plan
description: Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated implementation plan
argument-hint: "[--brief <path>] <task description, GitHub/Linear issue, or GitHub issue URL> [--issue | --linear-issue]"
allowed-tools:
  - TaskCreate
  - TaskUpdate
  - Read
  - Grep
  - Glob
  - Agent
  - Bash(git *)
  - Bash(gh *)
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
  - EnterPlanMode
  - ExitPlanMode
  - Skill(autopilot:gather-context)
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:branch-create)
  - Skill(autopilot:issue-create)
  - Skill(autopilot:linear-create)
  - Skill(autopilot:ascii-schemas)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated implementation plan.

## Input

Arguments: `$ARGUMENTS`

Expected forms:

- `<task description>` — free-form description (e.g., `"add user authentication"`)
- `<GitHub-issue-number>` — bare number (e.g., `123`) or with `#` prefix (`#123`)
- `<GitHub-issue-URL>` — full URL (e.g., `https://github.com/org/repo/issues/789`)
- `<task description> --issue` — file a GitHub issue from the description first, then plan against it
- `<task description> --linear-issue` — file a Linear issue first — requires a `linear` tracker (see [Linear tracker](../../../../docs/11-linear-tracker.md))

Additional free-form context may follow any form (e.g., `#42 I think we should start with the auth module`).

## Input resolution

- **Task description / issue identifier** — parsed from `$ARGUMENTS`. If empty, prompt once via `AskUserQuestion`: "What should we plan?" with a free-form slot. Do not abort silently.
- **`--issue` / `--linear-issue`** — handled by the create-issue pre-step in [input-detection.md](references/input-detection.md) before detection. Neither flag ⇒ today's behavior.
- **Current branch / worktree / issue-ID mismatch** — from the Context Map's git state ([Phase 3](#phase-3-preflight-verdict)). No prompts beyond preflight's own.
- **Repository root** — `git rev-parse --show-toplevel`. No prompt.

## Explicit brief input

For `--brief <path>`, follow the shared [explicit brief procedure](../gather-context/references/brief-validation.md#optional-brief-flag) before issue detection and gathering.

## Task Progress Protocol

Track only these substantive outcomes: **Gather context**, **Write plan**. Create them together where the runtime supports batching, or as one checklist otherwise. Update at outcome boundaries; input parsing, artifact freezing, and draft/finalize are not separate tasks. Identify tasks by subject, never numeric IDs.

## Task

$ARGUMENTS

## Phase 0: Resolve input

Resolve input before starting Gather context.

Detect the input type and id per [input-detection.md](references/input-detection.md) — the create-issue flags pre-step first, then the detection table and its tracker gating. Detection is pure string matching and performs **no I/O**; do not fetch anything here.

## Phase 1: Gather context

```
Skill(autopilot:gather-context)
```

Pass the detected input type, issue id, repository, repository root, Linear team (when applicable), and the raw task text as the task summary. The skill resolves intent, runs dependent research in parallel, and returns the **Context Map** — issue/alert context, related TODOs, relevant files, patterns, key types, test conventions, in-flight changes, session history, applicable standards, resolved stack deltas, git state, and the selected snapshot source.

That map is this command's entire view of the repository. Every later phase reasons over it instead of re-reading the tree.

## Phase 2: Intent, assumptions, and the human gate

After gathering, apply [intent and clarification](references/common-instructions.md#intent-and-clarification). Resolve load-bearing questions before drafting.

## Phase 3: Preflight verdict

The Context Map already carries branch, worktree, `isStaleMerged`, and `baseAhead`. Compare the issue id against the current branch name for a mismatch, and act on the map:

- Stale-merged branch, or `main` behind its remote → re-sync and branch fresh; the [Phase 5](#phase-5-embed-branch-creation-and-request-approval) block handles it.
- Anything ambiguous, or a state the map does not cover → invoke `Skill(autopilot:preflight-check)`, which owns the interactive prompts. If it outputs "Planning cancelled", stop immediately.

## Enter Plan Mode

Once preflight passes, switch the session into harness plan mode **before** any plan-file write:

```
EnterPlanMode
```

This gives the harness-provided plan-file path — the single file [the pipeline](references/pipeline.md) writes and [Phase 5](#phase-5-embed-branch-creation-and-request-approval) reads back for approval. Do not compute a separate path; the plan file **is** the plan-mode file. Skip this call if the session is already in plan mode.

`/autopilot:run` never enters plan mode and never gates on approval — invoking it is the authorization. Both mode calls live here in the orchestrator, outside the shared pipeline, so `run` cannot reach them.

## Common Instructions

Read [common-instructions.md](references/common-instructions.md) once before drafting; it owns documentation lookup, standards, plan output, and diagram conditions.

### Plan File Header

Follow [Plan File Header](references/common-instructions.md#plan-file-header).

### Plan file is output, not instructions

Follow [the shared output rule](references/common-instructions.md#plan-file-is-output-not-instructions).

## Phase 4: Draft and finalize

Execute the shared pipeline in [pipeline.md](references/pipeline.md) — one Write plan outcome — resolving your stack's deltas from [stack-deltas.md](references/stack-deltas.md).

## Phase 5: Embed branch creation and request approval

**Before** requesting approval, embed the branch step into the plan file so it runs first after approval. Pick the body by input type from [branch-blocks.md](references/branch-blocks.md), which also defines when the block is emitted at all.

Then request approval:

```
ExitPlanMode
```

`ExitPlanMode` reads the plan back from the plan-mode file and asks the user to approve it. On approval the session leaves plan mode and implementation begins with `## Pre-Implementation`, then `## Implementation Steps`.

That `## Pre-Implementation` body states the branch as an outcome, not as a command. Run it from the **Mechanics** paragraph beside the matching block in [branch-blocks.md](references/branch-blocks.md) — that paragraph carries the `branch-create` invocation and its arguments. Never improvise the branch with raw `git` because the plan file no longer spells the call out.

This step is `/autopilot:plan` only — see [`run/SKILL.md`](../run/SKILL.md).

## Phase 6: Post-implementation handoff

After implementation and the permitted verification checks finish, with deferred checks explicitly reported, ask what to do next. This gate is `/autopilot:plan` only: `run` replaces it with the automated chain in [`run/SKILL.md`](../run/SKILL.md), which is why it lives here in the orchestrator rather than in the shared pipeline `run` also executes.

Ask via AskUserQuestion (header "Next"): implementation is complete; state which checks passed, failed, or remain deferred, then ask what happens next. Never describe unrun checks as verified. Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) and apply it to the dialog you compose. The choices and the action each one triggers are exact; the wording is yours:

- **Create commit** — commit the session's changes: invoke `Skill(autopilot:commits-create)`.
- **Create PR** — open a pull request: invoke `Skill(autopilot:pr-create)`, with `--release-notes` when the session produced user-facing changes (`feat:` or `fix:` commits) and without it otherwise.
- **Done** — no further action needed: stop here.

## Additional Resources

- [`references/input-detection.md`](references/input-detection.md) — create-issue flags, detection table, tracker gating, alert divergence
- [`references/pipeline.md`](references/pipeline.md) — draft template, finalize
- [`references/stack-deltas.md`](references/stack-deltas.md) — per-stack example libraries and verify examples
- [`references/branch-blocks.md`](references/branch-blocks.md) — the `## Pre-Implementation` bodies and the mechanics that execute them

When you write the plan file, apply the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001, read it first) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
