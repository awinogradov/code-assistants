---
name: plan
description: Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated implementation plan, expert-reviewed when --experts-review is passed
argument-hint: "<task description, GitHub/Linear issue, or GitHub issue URL> [--issue | --linear-issue] [--experts-review]"
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

Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated implementation plan, expert-reviewed when `--experts-review` is passed.

## Input

Arguments: `$ARGUMENTS`

Expected forms:

- `<task description>` — free-form description (e.g., `"add user authentication"`)
- `<GitHub-issue-number>` — bare number (e.g., `123`) or with `#` prefix (`#123`)
- `<GitHub-issue-URL>` — full URL (e.g., `https://github.com/org/repo/issues/789`)
- `<task description> --issue` — file a GitHub issue from the description first, then plan against it
- `<task description> --linear-issue` — file a Linear issue first — requires a `linear` tracker (see [Linear tracker](../../../../docs/11-linear-tracker.md))
- `<any form above> --experts-review` — run the expert review-and-score step; without this flag that step is skipped

Additional free-form context may follow any form (e.g., `#42 I think we should start with the auth module`).

## Input resolution

- **Task description / issue identifier** — parsed from `$ARGUMENTS`. If empty, prompt once via `AskUserQuestion`: "What should we plan?" with a free-form slot. Do not abort silently.
- **`--issue` / `--linear-issue`** — handled by the create-issue pre-step in [input-detection.md](references/input-detection.md) before detection. Neither flag ⇒ today's behavior.
- **`--experts-review`** — parsed and stripped first by the mode-flags pre-step in [input-detection.md](references/input-detection.md#mode-flags). Present ⇒ the pipeline's review step runs; absent ⇒ it is skipped and the skip is recorded in the plan's `Score:` line.
- **Current branch / worktree / issue-ID mismatch** — from the Context Map's git state ([Phase 3](#phase-3-preflight-verdict)). No prompts beyond preflight's own.
- **Repository root** — `git rev-parse --show-toplevel`. No prompt.

## Task Progress Protocol

Create all 5 tasks with TaskCreate, in order, before any work. Set each to `in_progress` at the start of its phase and `completed` at the end.

| #   | Subject          | ActiveForm            |
| --- | ---------------- | --------------------- |
| 1   | Resolve input    | Resolving input       |
| 2   | Gather context   | Gathering context     |
| 3   | Draft plan       | Drafting plan         |
| 4   | Review and score | Reviewing and scoring |
| 5   | Finalize plan    | Finalizing plan       |

## Task

$ARGUMENTS

## Phase 0: Resolve input

Create the 5 tasks, then set task 1 to `in_progress`.

Detect the input type and id per [input-detection.md](references/input-detection.md) — the create-issue flags pre-step first, then the detection table and its tracker gating. Detection is pure string matching and performs **no I/O**; do not fetch anything here.

Set task 1 to `completed`.

## Phase 1: Gather context

Set task 2 to `in_progress`. Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, issue id, repository, repository root, Linear team (when applicable), and the raw task text as the task summary. The skill runs one parallel fan-out and returns the **Context Map** — issue/alert context, related TODOs, relevant files, patterns, key types, test conventions, in-flight changes, applicable standards, resolved stack deltas, git state, and the snapshot `outputId`.

That map is this command's entire view of the repository. Every later phase reasons over it instead of re-reading the tree.

Set task 2 to `completed`.

## Phase 2: Intent, assumptions, and the human gate

This runs **after** the Context Map, deliberately. Asking before any code is read produces uninformed questions and cannot surface the informed ones.

**Steelmanned Intent** — one sentence, ≤200 characters, restating the request in its strongest form with vague language tightened. Derive it from the resolved issue title and body, the alert rule and message, or the task description. Do not invent scope the user did not request. It lands verbatim in the plan's `## Summary`.

```
### Steelmanned Intent
[one-sentence restatement of what success looks like, in the user's strongest framing]
```

**Assumptions** — up to 5 bullets, each naming an interpretation the user could disagree with (e.g. "treating this as a read-only API, not a webhook"). Write "none" if there are none.

**Open Questions** — material ambiguities that would change the design, each marked load-bearing or not. Raise every load-bearing one via `AskUserQuestion` before drafting. State "none" and proceed if there are none.

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

### Documentation Lookup Protocol

**Scale the lookup to the task.** A small or well-understood change needs a single targeted lookup, or none. Reserve the full fan-out for tasks touching unfamiliar libraries, APIs, or recent changes.

Identify task-relevant libraries from `package.json`, the issue description, and the Context Map (see your stack's example libraries in [stack-deltas.md](references/stack-deltas.md)). Then, as the task warrants: `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` for structured docs; `mcp__Ref__ref_search_documentation` → `mcp__Ref__ref_read_url` for official references; `mcp__exa__web_search_exa` for real-world patterns and changelogs; `mcp__perplexity__search` / `mcp__perplexity__reason` for factual lookups and trade-offs. Run same-kind calls in parallel. If a source is unavailable, continue with the rest.

### Repository standards

The Context Map's **Applicable standards** section already carries the repo's conventions, the selected `rfc/` standards with status, dropped candidates, and any `principles/` values — read by [`digest-repo-standards`](../../agents/digest-repo-standards.md) so their full text never enters this context.

The plan must not violate a clause of an **Accepted** RFC; a **Draft** RFC is advisory — follow it where practical and call out deliberate deviations. `principles/` values shape the approach rather than bind it; when the plan deliberately contradicts one, say so explicitly instead of leaving the conflict silent. The `pr:review` skill enforces these same standards on the resulting diff, so complying here is what stops the review blocking the change later.

The generated plan's `## Post-Implementation` block MUST require updating any `README.md`, `docs/*`, and `rfc/*` the change affects. When it edits the content of an **Accepted** RFC, it must also require bumping that RFC's `version` frontmatter and adding a Changelog entry (mirrors CHECK-RFC-003).

### Plan File Header

Every plan file MUST begin with a single `# <Title>` line on line 1, followed by a blank line. For issue inputs use the issue title verbatim (no `#<n>` prefix, no truncation); for plain descriptions paraphrase into one sentence, ≤80 characters, sentence case.

When a `## Pre-Implementation` block is emitted it sits between the title and `## Summary`; otherwise `## Summary` follows the title directly.

### Plan file is output, not instructions

The plan file is what the reader approves, so every section describes an outcome in prose: which branch gets created, what each step changes, what happens once the steps land. It carries no `AskUserQuestion` parameter block, no `Skill(...)` dispatch line, and no HTML-comment directive aimed at the agent.

The tool calls that realize those outcomes belong to the phase that runs them — [Phase 5](#phase-5-embed-branch-creation-and-request-approval) for the branch, [Phase 6](#phase-6-post-implementation-handoff) for the handoff — and to the reference files those phases read. Stating them once there, rather than in both places, is what keeps a renamed flag from going stale in a copy nobody re-reads.

### CLAUDE.md Compliance

Map each planned change to the project rules in CLAUDE.md.

### Visualize with ASCII Schemas

Invoke `Skill(autopilot:ascii-schemas)` when the change touches architecture or module boundaries, data flow, sequence or timing, deployment topology, UI layout, or component interactions — and embed each diagram inline in the section it explains, beside the relevant step, file entry, or data-flow line. Never hand-draw; reuse the skill's output verbatim.

Skip diagrams for pure refactors with no structural change, formatting or dependency bumps, single-function logic edits, and documentation-only changes.

## Phase 4: Draft, review, and finalize

Execute the shared pipeline in [pipeline.md](references/pipeline.md) — draft (task 3), review and score (task 4), finalize (task 5) — resolving your stack's deltas from [stack-deltas.md](references/stack-deltas.md). Carry the `--experts-review` resolution from [Phase 0](#phase-0-resolve-input) into the pipeline: the review step runs only when the flag was passed.

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

After every implementation step and its `verify:` line has passed, ask what to do next. This gate is `/autopilot:plan` only: `run` replaces it with the automated chain in [`run/SKILL.md`](../run/SKILL.md), which is why it lives here in the orchestrator rather than in the shared pipeline `run` also executes.

**If the session produced user-facing changes** (`feat:` or `fix:` commits), use the `--release-notes` variant of the "Create PR" option below; otherwise use the plain one.

Tool parameters:

- `question`: "All changes implemented and verified. What's next?"
- `header`: "Next"
- `options`: [
  { label: "Create commit", description: "Run /autopilot:commits-create to commit changes" },
  { label: "Create PR", description: "Run /autopilot:pr-create --release-notes to open a PR with release notes" },
  { label: "Done", description: "No further action needed" }
  ]
- `multiSelect`: false

With no user-facing changes, the "Create PR" description reads `"Run /autopilot:pr-create to open a pull request"` instead.

Then act on the selection:

- "Create commit" — invoke `Skill(autopilot:commits-create)`
- "Create PR" — invoke `Skill(autopilot:pr-create)` with the flags shown in the chosen option's description
- "Done" — stop here

Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

## Additional Resources

- [`references/input-detection.md`](references/input-detection.md) — create-issue flags, detection table, tracker gating, alert divergence
- [`references/pipeline.md`](references/pipeline.md) — draft template, expert review and scoring, finalize
- [`references/stack-deltas.md`](references/stack-deltas.md) — per-stack example libraries, expert tables, verify examples
- [`references/branch-blocks.md`](references/branch-blocks.md) — the `## Pre-Implementation` bodies and the mechanics that execute them

When you write the plan file, apply the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001, read it first) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

**Reference self-check (MANDATORY):** after composing the output, re-read it against [`reference-formatting.md`](../shared-rules/references/reference-formatting.md). A bare commit SHA, a bare tracker id outside a magic-word line, or an unlinked mention of a file that exists in the repo is a violation — fix it before emitting.
