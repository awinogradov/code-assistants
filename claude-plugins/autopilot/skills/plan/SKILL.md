---
name: plan
description: Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated, expert-reviewed implementation plan
argument-hint: "<task description, GitHub issue number, or GitHub issue URL>"
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
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:plan-bun)
  - Skill(autopilot:plan-nodejs-react)
  - Skill(autopilot:branch-create)
  - Skill(autopilot:ascii-schemas)
---

Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated, expert-reviewed implementation plan.

## Input

Arguments: `$ARGUMENTS`

Expected forms:

- `<task description>` — free-form description (e.g., `"add user authentication"`)
- `<GitHub-issue-number>` — bare number (e.g., `123`) or with `#` prefix (`#123`)
- `<GitHub-issue-URL>` — full URL (e.g., `https://github.com/org/repo/issues/789`)

Additional free-form context can be appended after any of the forms above (e.g., `#42 I think we should start with the auth module`).

## Input resolution

- **Task description / issue identifier** — parsed from `$ARGUMENTS`. If empty, prompt once via `AskUserQuestion`: "What should we plan?" with free-form slot. Do not abort silently.
- **Current branch / worktree / issue-ID mismatch** — resolved via `git` commands and [Phase 0](#phase-0-input-resolution) context. No prompts beyond the preflight skill's own prompts.
- **Repository root** — `git rev-parse --show-toplevel`. No prompt.

## Task Progress Protocol

All phases MUST use Claude Code's built-in task system for progress tracking. Create all tasks upfront, then update status as work progresses. Skills invoked from this command follow the same protocol.

### Task Setup (MANDATORY - do FIRST before any work)

Create all 6 tasks using TaskCreate, in order, before starting any work:

| #   | Subject              | ActiveForm             | Source |
| --- | -------------------- | ---------------------- | ------ |
| 1   | Resolve input        | Resolving input        | plan   |
| 2   | Gather context       | Gathering context      | skill  |
| 3   | Analyze codebase     | Analyzing codebase     | skill  |
| 4   | Review with experts  | Reviewing with experts | skill  |
| 5   | Validate plan scores | Validating plan scores | skill  |
| 6   | Output final plan    | Outputting final plan  | skill  |

Create each task with:

- `subject`: from the table above
- `description`: brief description of the phase's goal
- `activeForm`: from the table above

### Task Lifecycle

At the START of each phase:

- Call TaskUpdate with `status: "in_progress"` on the corresponding task

At the END of each phase:

- Call TaskUpdate with `status: "completed"` on the corresponding task

## Task

$ARGUMENTS

## Phase 0: Input Resolution

**FIRST**, set up task tracking:

1. Create all 6 tasks as defined in the Task Progress Protocol above (call TaskCreate 6 times)
2. Call TaskUpdate to set task 1 ("Resolve input") to `status: "in_progress"`

### Codebase Context and Issue Resolution (MANDATORY - DO FIRST)

Detect the input type from the arguments. Match **top-to-bottom and stop at the first hit** — the order is load-bearing: a code-scanning alert URL contains `github.com`, so the alert row MUST be checked before the `github.com` issue-URL row or the alert misroutes to `gh issue view` and fetches an unrelated issue #{n}.

| Pattern                                                                | Type                |
| ---------------------------------------------------------------------- | ------------------- |
| `…/security/code-scanning/{n}` URL, or `alert#{n}` / `alert {n}` token | Code-scanning alert |
| Contains `linear.app`                                                  | Linear issue URL    |
| Uppercase key + `-` + number (`ENG-123`), matching `^[A-Z]+-[0-9]+$`   | Linear issue        |
| Number only (`123`)                                                    | GitHub issue        |
| `#` + number (`#123`)                                                  | GitHub issue        |
| Contains `github.com`                                                  | GitHub issue URL    |
| Anything else                                                          | Plain description   |

A **bare number stays a GitHub issue** — alerts require the alert URL or the explicit `alert#{n}` / `alert {n}` token, so there is zero collision with the issue-number rows.

The detection rows are gated on the project's configured trackers — `agents.trackers` in `package.json`, an array of `{ type, ... }` entries (absent ⇒ a single `github` tracker, today's behavior). **Linear rows fire only when at least one `linear` tracker is configured**; the Linear ID is the uppercase `KEY-N` form (`^[A-Z]+-[0-9]+$`), and its `KEY` must match the **union of every** `linear` tracker's effective keys (each entry's `keys`, defaulting to `[team]`). Several `linear` teams may coexist — `FRTNS-3` routes to the `FRTNS` tracker and `ENG-12` to `ENG` — and the matched entry supplies the `team` passed to `resolve-issue-context`. **GitHub rows fire when a `github` tracker is configured** (the default). A project may configure both — e.g. `linear` for internal issues and `github` for external user feedback — and each argument routes by shape: `ENG-123` → Linear, `#42` / `123` / a `github.com` URL → GitHub. A Linear-shaped argument with no matching `linear` tracker matches none of the GitHub numeric rows and falls through to **Plain description**, so existing GitHub repos are unaffected.

Launch context-gathering calls **in parallel**. The number of parallel calls depends on input type:

**If input type is `code-scanning-alert`** — launch 2 calls in parallel:

```
Acquire codebase snapshot (prefer the committed pack to avoid re-packing):
  Check whether `.repomix/pack.xml` exists at the repository root.
  - If it exists, call `mcp__repomix__attach_packed_output` with:
    - `path`: [repository root absolute path]/.repomix/pack.xml
  - If it is absent (or the attach fails), fall back to `mcp__repomix__pack_codebase` with:
    - `directory`: [repository root absolute path]
    - `compress`: true

Agent (resolve-alert-context):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:resolve-alert-context"
  - `prompt`: "Fetch alert context. Alert number: [n]. Repository: [owner/repo]."
  - `description`: "Resolve alert context"
```

If `resolve-alert-context` returns `state: "unresolved"` with a non-null `resolveError`, surface the error and STOP — do not fall through to the issue path or proceed against a misfetched target.

**If input type is `github-issue`** — launch 3 calls in parallel:

```
Acquire codebase snapshot (prefer the committed pack to avoid re-packing):
  Check whether `.repomix/pack.xml` exists at the repository root.
  - If it exists, call `mcp__repomix__attach_packed_output` with:
    - `path`: [repository root absolute path]/.repomix/pack.xml
  - If it is absent (or the attach fails), fall back to `mcp__repomix__pack_codebase` with:
    - `directory`: [repository root absolute path]
    - `compress`: true

Agent 1 (resolve-issue-context):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:resolve-issue-context"
  - `prompt`: "Fetch issue context. Input type: github-issue. Issue ID: [id]. Repository: [owner/repo]. Fetch parent/siblings: true. Auto-assign current user: true."
  - `description`: "Resolve issue context"

Agent 2 (search-codebase-todos):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:search-codebase-todos"
  - `prompt`: "Search for TODOs. Input type: github-issue. Issue ID: [id]."
  - `description`: "Search codebase TODOs"
```

**If input type is `linear-issue` or `linear-issue-url`** — launch the same 3 calls as `github-issue` (snapshot + `resolve-issue-context` + `search-codebase-todos`), but pass Linear parameters to `resolve-issue-context` instead of the GitHub issue number/repo:

```
Agent 1 (resolve-issue-context):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:resolve-issue-context"
  - `prompt`: "Fetch issue context. Input type: linear-issue. Linear ID: [ENG-123]. Linear team: [the `team` of the `linear` entry in package.json agents.trackers whose keys matched the ID's KEY]. Auto-assign current user: false."
  - `description`: "Resolve issue context"
```

If `resolve-issue-context` returns `status: "unresolved"` with a non-null `resolveError` (e.g. the Linear MCP is not authenticated and `LINEAR_API_KEY` is unset), surface the error and STOP — do not fall through or proceed against missing data. Otherwise the agent returns the same JSON contract as the GitHub path, so the Issue Context Output, Steelmanned Intent, and Assumptions blocks below are unchanged.

**If input type is `plain description`** — acquire the snapshot directly (no agents needed):

```
Acquire codebase snapshot (prefer the committed pack to avoid re-packing):
  Check whether `.repomix/pack.xml` exists at the repository root.
  - If it exists, call `mcp__repomix__attach_packed_output` with:
    - `path`: [repository root absolute path]/.repomix/pack.xml
  - If it is absent (or the attach fails), fall back to `mcp__repomix__pack_codebase` with:
    - `directory`: [repository root absolute path]
    - `compress`: true
```

After all calls complete, store the `outputId` from the snapshot acquisition (attach or pack) response — [Phase 1](#phase-1-context-gathering) (Context Gathering) is the single phase that reads the codebase from it. [Phase 0](#phase-0-input-resolution) does NOT grep or read code: build the issue/alert context, Steelmanned Intent, and Assumptions below from the resolved JSON (issue title/body/comments, or alert rule/message) alone. Defer every codebase read to [Phase 1](#phase-1-context-gathering).

### Alert Context Output (code-scanning-alert input)

For a `code-scanning-alert` input, render the context from the `resolve-alert-context` JSON instead of the issue block — `source`, `ruleId`, `severity`, `state`, `file:line`, and `message`. There is no TODO search and no assignee. Derive the **Steelmanned Intent** from the alert rule and message (what fixing this alert means), and key everything downstream off the `code-scanning-alert` type:

- **Branch ([Phase 2](#phase-2-embed-branch-creation-in-plan-file))** — a `security-<slug>` branch (NOT `issue-<n>-…`); the slug paraphrases the rule/file (e.g. `security-tainted-format-string`).
- **PR** — a `SECURITY:` title; the body records the alert reference (`htmlUrl`) and emits **no** `Closes #` (alerts are not closed by PR magic words).
- **Verify** — the plan's Post-Implementation verify step polls alert state with `gh api repos/{owner}/{repo}/code-scanning/alerts/{n} --jq .state`, expecting `fixed` after merge + the next CodeQL scan.

### Issue Context Output

The [`resolve-issue-context`](../../agents/resolve-issue-context.md) and [`search-codebase-todos`](../../agents/search-codebase-todos.md) agents each return a single JSON object (see each agent's output schema). Parse both, then render the issue context for display from the `resolve-issue-context` fields — `source`, `title`, `status`, `labels`, `assignee` (only when non-null), `description`, and `comments` — and append the TODO results rendered from `search-codebase-todos`:

```
### Related TODOs in Codebase
[render from the `todos` array (each as `location` — `text`) and `total`; when `total` is 0, output "No related TODOs found"]
```

### Steelmanned Intent

After the issue context and TODOs, emit a single-line **Steelmanned intent**: the user's request restated in its strongest form, with any vague language tightened. One sentence, ≤200 characters. This becomes the stable target for the stack skill's expert reviewers and lands verbatim in the plan file `## Summary` block.

Format:

```
### Steelmanned Intent
[one-sentence restatement of what success looks like, in the user's strongest framing]
```

Derive from: the resolved issue title + body (for `github-issue` input), the alert rule + message (for `code-scanning-alert` input), or the task description (for `plain description` input). Do not invent scope the user did not request.

### Assumptions & Open Questions

After the Steelmanned Intent, emit two short blocks. This forces interpretive choices into the open instead of letting them propagate silently into the plan.

**Assumptions** — up to 5 bullets. Each names an interpretation being made that the user could disagree with (e.g., "treating this as a read-only API, not a webhook"). If none, write "none".

**Open Questions** — material ambiguities that would change the design. If any open question is load-bearing (the plan's structure depends on the answer), raise it via `AskUserQuestion` BEFORE delegating to the stack skill in [Phase 1](#phase-1-detect-stack-and-delegate). If none are load-bearing, state "none" and proceed.

Format:

```
### Assumptions
- [interpretation 1]
- [interpretation 2]

### Open Questions
- [ambiguity 1] — load-bearing? yes/no
- [ambiguity 2] — load-bearing? yes/no
```

After completing the Issue Context Output, Steelmanned Intent, and Assumptions & Open Questions, call TaskUpdate to set task 1 ("Resolve input") to `status: "completed"`.

## Preflight Check

After completing [Phase 0](#phase-0-input-resolution), invoke the preflight check skill to validate the git branch state:

```
Skill(autopilot:preflight-check)
```

The skill receives `mode: plan` and the [Phase 0](#phase-0-input-resolution) context (input type, issue ID) from the conversation history. It validates the current branch, checks for merged/stale branches, detects issue ID mismatches, and ensures main is up to date.

If the skill outputs "Planning cancelled", stop execution immediately — do not proceed to [Phase 1](#phase-1-detect-stack-and-delegate).

## Common Instructions

The following apply to ALL stacks throughout planning — both the orchestrator phases below and the shared [**Stack Pipeline (Phases 1–6)**](#stack-pipeline-phases-16) the stack skills execute, which points back here rather than restating them:

### Documentation Lookup Protocol (MANDATORY)

Before planning, look up documentation for every technology and library relevant to the task.

**Step 1: Identify technologies** from all sources:

- Manifest file (`package.json`) — libraries relevant to the task
- Issue/ticket description — libraries explicitly mentioned by the user
- Codebase exploration — libraries discovered during [Phase 1](#phase-1-context-gathering) exploration

**Step 2: context7** — For each library, call in sequence:

1. `mcp__context7__resolve-library-id` with the library name to get `libraryId`
2. `mcp__context7__query-docs` with `libraryId` and a task-relevant topic

Run multiple `resolve-library-id` calls in parallel, then multiple `query-docs` in parallel.

**Step 3: Ref** — For official documentation:

- `mcp__Ref__ref_search_documentation` with the technology name and topic
- `mcp__Ref__ref_read_url` to read specific documentation pages from search results

**Step 4: Exa** — For real-world patterns, examples, and recent changes:

- `mcp__exa__web_search_exa` for API patterns, migration guides, or changelogs
- `mcp__exa__get_code_context_exa` for real-world usage examples

**Step 5: Perplexity** — For general and architectural questions:

- `mcp__perplexity__search` for factual lookups
- `mcp__perplexity__reason` for trade-off analysis and architectural decisions

Use all available documentation sources. If a source is unavailable or returns no results, continue with remaining sources. Each tool provides different information (structured docs, official references, real-world patterns, reasoning).

### Repository Documentation (MANDATORY)

Before planning, read the repository's own documentation as the project's source of truth (it overrides defaults per CLAUDE.md):

- Read the root `README.md`.
- Inspect every file under `docs/` and its subfolders, and read those relevant to the task.

Feed the project-specific conventions found there into analysis and the plan.

The generated plan MUST update this documentation after implementation: its `## Post-Implementation` block must require updating any `README.md` and `docs/*` affected by the change so the documented source of truth stays current. When such an update needs a diagram, the plan must generate it via `Skill(autopilot:ascii-schemas)` and embed the output verbatim — never hand-draw.

### Plan File Header (MANDATORY)

Every plan file written by any stack skill MUST begin with a single `# <Title>` line on line 1, followed by a blank line. This rule is stack-agnostic and supersedes any stack-specific plan template that omits the header.

**Title derivation:**

- For `github-issue` inputs: use the GitHub issue title verbatim as resolved in [Phase 0](#phase-0-input-resolution) (no `#<n>` prefix, no truncation).
- For `plain description` inputs: paraphrase the user's task description into a single sentence (≤80 characters), sentence case.

**Section ordering** when a `## Pre-Implementation` block is also emitted (see [Phase 2](#phase-2-embed-branch-creation-in-plan-file)):

```
# <Title>

## Pre-Implementation
...

## Summary
...
```

When no Pre-Implementation block is emitted, the order is `# <Title>` → blank line → `## Summary` → rest of plan.

### CLAUDE.md Compliance

Map each planned change to project rules defined in CLAUDE.md.

### Visualize with ASCII Schemas

When the planned change is structural or visual, invoke `Skill(autopilot:ascii-schemas)` to generate diagrams and embed each one inline in the plan section it explains — beside the relevant implementation step, file entry, or data-flow description — rather than collecting them in a standalone section.

**Trigger** — invoke the skill when the change touches any of:

- Architecture or module boundaries
- Data flow, request/response paths, event pipelines
- Sequence or timing interactions between components
- Deployment topology or infrastructure layout
- UI layout, screen mockups, or component hierarchy
- Component interactions (parent/child, pub/sub, dependencies)

**Skip** — do NOT invoke for:

- Pure refactors with no structural change
- Formatting, lint fixes, dependency bumps
- Internal logic edits inside a single function
- Documentation-only changes with no diagrams requested

Always reuse `Skill(autopilot:ascii-schemas)` output verbatim — do not hand-draw diagrams.

## Phase 1: Detect Stack and Delegate

1. Read `package.json` from the repository root
2. Extract the `agents.rules` field value
3. Map to the appropriate skill:

| `rules` value           | Skill                                |
| ----------------------- | ------------------------------------ |
| `Bun`                   | `Skill(autopilot:plan-bun)`          |
| `Bun+React+Tailwind`    | `Skill(autopilot:plan-bun)`          |
| `NodeJS+React`          | `Skill(autopilot:plan-nodejs-react)` |
| `NodeJS+React+Tailwind` | `Skill(autopilot:plan-nodejs-react)` |

4. Invoke the skill. The skill receives the full [Phase 0](#phase-0-input-resolution) context (issue data, branch info, TODO matches) from the conversation history and executes the stack-specific phases.

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in AskUserQuestion `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

If `package.json` does not exist, has no `agents` field, or `agents.rules` is not recognized, ask the user via AskUserQuestion:

Tool parameters:

- `question`: "Could not detect tech stack from package.json agents.rules. Which stack should be used for planning?"
- `header`: "Stack"
- `options`: [
  { label: "Bun", description: "Bun/NodeJS TypeScript projects (CSS Modules)" },
  { label: "Bun+React+Tailwind", description: "Bun + React + Tailwind frontend" },
  { label: "NodeJS+React", description: "Node.js + React (CSS Modules)" },
  { label: "NodeJS+React+Tailwind", description: "Node.js + React + Tailwind frontend" }
  ]
- `multiSelect`: false

## Phase 2: Embed Branch Creation in Plan File

**BEFORE calling ExitPlanMode**, embed branch creation into the plan file so it executes as the first post-approval step.

### Check conditions

1. Input type from [Phase 0](#phase-0-input-resolution) Issue Context
2. Current branch: `git branch --show-current`
3. Worktree detection — run both commands:
   - `git rev-parse --git-dir`
   - `git rev-parse --git-common-dir`
   - If the two values differ → `isWorktree = true`, otherwise `isWorktree = false`
4. If `isWorktree` is true AND not on `main`, check for unmerged commits: `git log origin/main..HEAD --oneline`
   - If output is empty → `worktreeNeedsBranch = true`
   - If output is non-empty → `worktreeNeedsBranch = false`

### If on `main` branch OR `worktreeNeedsBranch` is true

Insert `## Pre-Implementation` directly below the `# <Title>` line (which per the [Plan File Header](#plan-file-header-mandatory) rule above must already be line 1) and above `## Summary`. The block content depends on input type from [Phase 0](#phase-0-input-resolution).

#### Input type is `github-issue` (bare number, `#`-prefixed number, or GitHub issue URL)

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with the resolved issue number (e.g., `42` for `#42`). The branch-create skill fetches the issue, generates an `issue-<number>-<slug>` branch name, and prompts the user to confirm before creation. Do NOT present a Hotfix/Trivial/Maintenance prefix prompt — issue inputs always use the `issue-<number>-<slug>` convention so the PR can link back via `Closes #<number>`.
```

#### Input type is `code-scanning-alert`

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with `--security "<slug>"`, where `<slug>` paraphrases the resolved alert's rule/file (e.g., `tainted-format-string`). The branch-create skill creates a `security-<slug>` branch (the alert is NOT a GitHub issue, so the `issue-<number>-<slug>` form does not apply and no `Closes #` is emitted). The branch name MUST be approved by the user via AskUserQuestion before creation — do not create the branch directly with git commands.
```

#### Input type is `plain description`

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Choose a branch type for this change using AskUserQuestion:

Tool parameters:
- `question`: "Choose a branch type for this change."
- `header`: "Branch type"
- `options`: [
  { label: "Hotfix", description: "Emergency production fix (hotfix-<slug>)" },
  { label: "Trivial", description: "Typos, docs, formatting (trivial-<slug>)" },
  { label: "Maintenance", description: "Deps, CI, configs (maintenance-<slug>)" }
  ]
- `multiSelect`: false

Then invoke `/autopilot:branch-create --<chosen-prefix> "<description>"` using the Skill tool, where `<description>` is a short summary derived from the user description. The branch name MUST be approved by the user via AskUserQuestion before creation — do not skip approval or create the branch directly with git commands.
```

### Otherwise (not on `main` AND (`isWorktree` is false OR `worktreeNeedsBranch` is false))

Do NOT add `## Pre-Implementation` — already on a feature branch with active work.

## Stack Pipeline (Phases 1–6)

The stack skills (`plan-bun`, `plan-nodejs-react`) execute this shared pipeline after the [Phase 1](#phase-1-detect-stack-and-delegate) delegation above, supplying their three deltas (example libraries, expert table, verify examples) from their own `## Stack Deltas` section. The pipeline is defined ONCE here so the two stacks cannot drift; wherever a phase says "your stack's <delta>", read the value from the delegating stack skill. These "[Phase 1](#phase-1-context-gathering)–6" are the stack-execution phases — distinct from this orchestrator's [Phase 0](#phase-0-input-resolution)–2 above — and the stack skill runs them in order after being delegated to.

### Task Discovery

Call TaskList to find the planning tasks created by the plan command. Match tasks by subject to find the IDs for tasks 2-6:

- Task 2: "Gather context"
- Task 3: "Analyze codebase"
- Task 4: "Review with experts"
- Task 5: "Validate plan scores"
- Task 6: "Output final plan"

Use these IDs for all TaskUpdate calls in the phases below.

### Phase 1: Context Gathering

**FIRST**, call TaskUpdate to set task 2 ("Gather context") to `status: "in_progress"`.

This is the pipeline's single codebase-reading pass: [Phase 0](#phase-0-input-resolution) read no code and [Phase 2](#phase-2-deep-analysis) only synthesizes, so gather here everything the rest of planning needs about the code and record it in the **Context Map** (step 7).

1. **Branch Changes** - Analyze all changes since diverging from main:
   - `git log origin/main..HEAD --oneline` - commits on this branch
   - `git diff origin/main...HEAD` - all code changes
2. **Codebase Exploration** - Decide where context comes from before crawling, so the snapshot and live tools don't re-traverse the same tree:
   - **Snapshot (default — broad/whole-repo reads):** the [Phase 0](#phase-0-input-resolution) repomix snapshot already covers the whole tree. Search it with `grep_repomix_output`/`read_repomix_output` (step 6) for related implementations, similar features, and test patterns. Do NOT crawl the tree live for what the snapshot can answer.
   - **Live tools (Explore agents / Grep / Glob — only what the snapshot cannot serve):** the snapshot reflects `main` at the last merge, so on a feature branch it lags by the in-flight changes; those are in the [Phase 1](#phase-1-context-gathering) branch diff (step 1), not the pack. Reach for live tools only for in-flight working-tree code, or a targeted fresh read the snapshot is too stale or too coarse to answer.
   - Launch Explore agents (parallel) ONLY when the rule above calls for a live read; otherwise skip them. When you do, start from TODO locations found in [Phase 0](#phase-0-input-resolution) (if any) and search `*.ts`/`*.tsx` files.
3. **Documentation Lookup** (MANDATORY) - Follow the [**Documentation Lookup Protocol**](#documentation-lookup-protocol-mandatory) in `## Common Instructions`. Identify task-relevant libraries from `package.json`, the issue/ticket description, and codebase exploration results (e.g. your stack's **example libraries** delta).
4. **Repository Documentation** (MANDATORY) - Follow the [**Repository Documentation**](#repository-documentation-mandatory) rule in `## Common Instructions`.
5. **CLAUDE.md Compliance** - Follow the [**CLAUDE.md Compliance**](#claudemd-compliance) rule in `## Common Instructions`.
6. **Repomix** - Search codebase via `mcp__repomix__grep_repomix_output` (outputId from [Phase 0](#phase-0-input-resolution)). Use `mcp__repomix__read_repomix_output` with `startLine`/`endLine` for specific sections only.
7. **Context Map (the output of this pass)** - Because this is the only phase that reads the codebase, record a compact written inventory of what it found, enough that every later phase reasons over the map instead of re-reading:
   - Relevant files/modules and their role in the change
   - Existing patterns and similar implementations to mirror
   - Key types, interfaces, and Zod schemas in play
   - Test conventions and fixtures that apply
   - In-flight changes from the branch diff (step 1) the snapshot does not reflect

After completing all context gathering, call TaskUpdate to set task 2 ("Gather context") to `status: "completed"`.

### Phase 2: Deep Analysis

**FIRST**, call TaskUpdate to set task 3 ("Analyze codebase") to `status: "in_progress"`.

This is a synthesis step, not a second crawl. Reason over the **Context Map** [Phase 1](#phase-1-context-gathering) produced — that map is the codebase read, and it already holds the files, patterns, types, tests, and in-flight changes this analysis needs. Work the dimensions below against it; do not re-grep or re-read the tree to reconstruct what the map already contains.

Reach for an additional read only if the Context Map is genuinely missing something the analysis turns on, and only under the same snapshot-vs-live rule [Phase 1](#phase-1-context-gathering) applies — then fold the result back into the map:

- a targeted `mcp__repomix__grep_repomix_output`/`mcp__repomix__read_repomix_output` (outputId from [Phase 0](#phase-0-input-resolution)) for the one missing section, or
- a live Grep/Read/Glob for in-flight working-tree code the snapshot is too stale to show (the branch's uncommitted changes).

| Dimension        | Key Questions                                             |
| ---------------- | --------------------------------------------------------- |
| **Architecture** | Where does this fit? What modules are affected?           |
| **Patterns**     | What existing patterns to follow? Check similar code.     |
| **Data Flow**    | How does data move? What's the source of truth?           |
| **Types**        | What interfaces/schemas exist? What needs Zod validation? |
| **Edge Cases**   | What could fail? Null states? Race conditions?            |

After completing deep analysis, call TaskUpdate to set task 3 ("Analyze codebase") to `status: "completed"`.

### Phase 3: Draft Plan

Assemble a complete plan draft now — before scoring and expert review — so both operate on a concrete artifact instead of an imagined one. Build the draft from the output template below and keep it available for [Phase 4](#phase-4-dynamic-expert-review) (expert review) and [Phase 5](#phase-5-validation-scoring) (scoring). Leave the `Score:` line as a placeholder; [Phase 5](#phase-5-validation-scoring) fills it. This draft is interim — do NOT flip any task status here; it flows directly into the [Phase 4](#phase-4-dynamic-expert-review) review. Task 6 ("Output final plan") activates in [Phase 6](#phase-6-finalize-output) when the final plan is written, so the progress list advances in numeric order (Review and Validate finish before Output begins).

The template below starts with `# <Title>` — see the canonical ["Plan File Header (MANDATORY)"](#plan-file-header-mandatory) rule in `## Common Instructions` above for title derivation and section ordering.

```
# <Title>

## Summary
[1-2 sentences: what and why]
Steelmanned intent: [verbatim from Phase 0 Steelmanned Intent block]
Score: [filled in Phase 5 — leave as a placeholder in the draft]

<!-- For architectural/visual/UI/flow changes, embed each ASCII diagram from Skill(autopilot:ascii-schemas) inline in the section it explains — beside the relevant implementation step, file entry, or data-flow line — per the "Visualize with ASCII Schemas" guidance. Do not add a standalone diagrams section; omit diagrams entirely for pure logic/refactor changes. -->

## Implementation Steps

Every step MUST include a `verify:` line — an observable check (test name, command, or behavior). Follow your stack's **verify examples** delta as the pattern for the verify lines.

## Files
- `path/to/file.ts:NN` - [what changes]
- `path/to/new.ts` - [purpose] (new)

## Post-Implementation

After all implementation steps and verification are complete:

1. **Update documentation (MANDATORY)** — update any `README.md` and `docs/*` affected by these changes so the documented source of truth stays current. When an update needs a diagram, generate it via `Skill(autopilot:ascii-schemas)` and embed the output verbatim — do not hand-draw.
2. Present next actions using AskUserQuestion.

**If the implementation included user-facing changes** (feat: or fix: commits created during this session), use `--release-notes` in the "Create PR" option. Otherwise, use the plain option.

Tool parameters:
- `question`: "All changes implemented and verified. What's next?"
- `header`: "Next"
- `options`: [
  { label: "Create commit", description: "Run /autopilot:commits-create to commit changes" },
  { label: "Create PR", description: "Run /autopilot:pr-create --release-notes to open a PR with release notes" },
  { label: "Done", description: "No further action needed" }
  ]
- `multiSelect`: false

If no user-facing changes, use `"Run /autopilot:pr-create to open a pull request"` instead.

After the user selects their option:
- "Create commit": invoke `Skill(autopilot:commits-create)`
- "Create PR": invoke `Skill(autopilot:pr-create)` with the flags shown in the option description
- "Done": no further action needed
```

### Phase 4: Dynamic Expert Review

**FIRST**, call TaskUpdate to set task 4 ("Review with experts") to `status: "in_progress"`.

Select experts from your stack's **expert table** delta — always include the Pre-mortem Analyst, then 2-3 additional experts based on task scope.

For each selected expert, launch a `autopilot:expert-review` sub-agent. Launch all experts **in parallel** (single message, multiple Agent tool calls):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:expert-review"
- `prompt`: "You are a [Expert Role]. Review this implementation plan.
  Focus areas: [from your stack's expert table delta].
  Scoring target: 95+.
  Limit your report to the 3–5 strongest findings — depth over breadth.

  [full plan text from the Phase 3 draft]"
- `description`: "Expert review: [Role]"
```

Wait for all agents to complete. Each returns a JSON object (`expertRole`, `score`, `verdict`, `findings`, `revision`). Aggregate the `findings` across experts to refine the [Phase 3](#phase-3-draft-plan) draft internally, and treat any `needs-revision` verdict as a signal to address that expert's findings before finalizing. Do not include the raw expert JSON in the plan output.

After all expert reviews complete, call TaskUpdate to set task 4 ("Review with experts") to `status: "completed"`.

### Phase 5: Validation Scoring

**FIRST**, call TaskUpdate to set task 5 ("Validate plan scores") to `status: "in_progress"`.

Rate the reviewed plan (20 points each dimension = 100 total):

| Dimension        | Criteria                                                                                                                            | Score |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Alignment**    | Follows CLAUDE.md, project patterns, naming conventions                                                                             | /20   |
| **Completeness** | All requirements addressed, no missing steps                                                                                        | /20   |
| **Type Safety**  | Proper types, Zod schemas, no unsafe `as` assertions                                                                                | /20   |
| **Testability**  | Clear test strategy, edge cases identified                                                                                          | /20   |
| **Simplicity**   | Minimal code, reuses existing functions, no over-engineering, every change traces to steelmanned intent, no opportunistic refactors | /20   |

#### Auto-Iteration Protocol (Target: 95+)

If score < 95, automatically:

1. Identify weak dimensions (score < 19)
2. Ask clarifying questions via `AskUserQuestion` if a weak dimension hinges on a material ambiguity
3. Re-analyze and re-score internally (do not output retry details)
4. Repeat until 95+ achieved

After scoring completes, call TaskUpdate to set task 5 ("Validate plan scores") to `status: "completed"`.

### Phase 6: Finalize Output

**FIRST**, call TaskUpdate to set task 6 ("Output final plan") to `status: "in_progress"`.

Apply the expert findings ([Phase 4](#phase-4-dynamic-expert-review)) and the validated score ([Phase 5](#phase-5-validation-scoring)) to the [Phase 3](#phase-3-draft-plan) draft, then write the final plan file. Replace the `Score:` placeholder in the `## Summary` block with the [Phase 5](#phase-5-validation-scoring) result (`Score: [X]/100`).

After outputting the final plan, call TaskUpdate to set task 6 ("Output final plan") to `status: "completed"`.

When you write the plan file, apply the reference-formatting rules inlined at the end of this skill (the **Reference formatting & readability** block below, RFC-0001 v3) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
