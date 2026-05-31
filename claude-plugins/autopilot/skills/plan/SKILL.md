---
name: plan
description: Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated, expert-reviewed implementation plan
argument-hint: "<task description, GitHub issue number, or GitHub issue URL>"
allowed-tools:
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
- **Current branch / worktree / issue-ID mismatch** — resolved via `git` commands and Phase 0 context. No prompts beyond the preflight skill's own prompts.
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
| 4   | Validate plan scores | Validating plan scores | skill  |
| 5   | Review with experts  | Reviewing with experts | skill  |
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

Detect the input type from the arguments:

| Pattern               | Type              |
| --------------------- | ----------------- |
| Number only (`123`)   | GitHub issue      |
| `#` + number (`#123`) | GitHub issue      |
| Contains `github.com` | GitHub issue URL  |
| Anything else         | Plain description |

Launch context-gathering calls **in parallel**. The number of parallel calls depends on input type:

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

After all calls complete:

1. Store the `outputId` from the snapshot acquisition (attach or pack) response for use throughout all phases
2. Use `grep_repomix_output` with the `outputId` to search for task-relevant code (keywords from issue title/description, related module names)
3. Use `read_repomix_output` with `startLine`/`endLine` only to read specific sections found via grep

### Issue Context Output

The `resolve-issue-context` and `search-codebase-todos` agents each return a single JSON object (see each agent's output schema). Parse both, then render the issue context for display from the `resolve-issue-context` fields — `source`, `title`, `status`, `labels`, `assignee` (only when non-null), `description`, and `comments` — and append the TODO results rendered from `search-codebase-todos`:

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

Derive from: the resolved issue title + body (for `github-issue` input), or the task description (for `plain description` input). Do not invent scope the user did not request.

### Assumptions & Open Questions

After the Steelmanned Intent, emit two short blocks. This forces interpretive choices into the open instead of letting them propagate silently into the plan.

**Assumptions** — up to 5 bullets. Each names an interpretation being made that the user could disagree with (e.g., "treating this as a read-only API, not a webhook"). If none, write "none".

**Open Questions** — material ambiguities that would change the design. If any open question is load-bearing (the plan's structure depends on the answer), raise it via `AskUserQuestion` BEFORE delegating to the stack skill in Phase 1. If none are load-bearing, state "none" and proceed.

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

After completing Phase 0, invoke the preflight check skill to validate the git branch state:

```
Skill(autopilot:preflight-check)
```

The skill receives `mode: plan` and the Phase 0 context (input type, issue ID) from the conversation history. It validates the current branch, checks for merged/stale branches, detects issue ID mismatches, and ensures main is up to date.

If the skill outputs "Planning cancelled", stop execution immediately — do not proceed to Phase 1.

## Common Instructions

The following apply to ALL stacks before delegating to the stack-specific skill:

### Documentation Lookup Protocol (MANDATORY)

Before planning, look up documentation for every technology and library relevant to the task.

**Step 1: Identify technologies** from all sources:

- Manifest file (`package.json`) — libraries relevant to the task
- Issue/ticket description — libraries explicitly mentioned by the user
- Codebase exploration — libraries discovered during Phase 1 exploration

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

- For `github-issue` inputs: use the GitHub issue title verbatim as resolved in Phase 0 (no `#<n>` prefix, no truncation).
- For `plain description` inputs: paraphrase the user's task description into a single sentence (≤80 characters), sentence case.

**Section ordering** when a `## Pre-Implementation` block is also emitted (see Phase 2):

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

When the planned change is structural or visual, invoke `Skill(autopilot:ascii-schemas)` to generate diagrams and embed them in the plan's `## Diagrams` section (see the stack skill's plan output template).

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

4. Invoke the skill. The skill receives the full Phase 0 context (issue data, branch info, TODO matches) from the conversation history and executes the stack-specific phases.

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

1. Input type from Phase 0 Issue Context
2. Current branch: `git branch --show-current`
3. Worktree detection — run both commands:
   - `git rev-parse --git-dir`
   - `git rev-parse --git-common-dir`
   - If the two values differ → `isWorktree = true`, otherwise `isWorktree = false`
4. If `isWorktree` is true AND not on `main`, check for unmerged commits: `git log origin/main..HEAD --oneline`
   - If output is empty → `worktreeNeedsBranch = true`
   - If output is non-empty → `worktreeNeedsBranch = false`

### If on `main` branch OR `worktreeNeedsBranch` is true

Insert `## Pre-Implementation` directly below the `# <Title>` line (which per the Plan File Header rule above must already be line 1) and above `## Summary`. The block content depends on input type from Phase 0.

#### Input type is `github-issue` (bare number, `#`-prefixed number, or GitHub issue URL)

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with the resolved issue number (e.g., `42` for `#42`). The branch-create skill fetches the issue, generates an `issue-<number>-<slug>` branch name, and prompts the user to confirm before creation. Do NOT present a Hotfix/Trivial/Maintenance prefix prompt — issue inputs always use the `issue-<number>-<slug>` convention so the PR can link back via `Closes #<number>`.
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

## Quiz Mode Format

When clarification needed:

```
**Q[N]**: [Clear question]
A) [Option with brief explanation]
B) [Option with brief explanation]
C) [Option with brief explanation]
D) Other: ___
```

## Stack Pipeline (Phases 1–6)

The stack skills (`plan-bun`, `plan-nodejs-react`) execute this shared pipeline after the Phase 1 delegation above, supplying their three deltas (example libraries, expert table, verify examples) from their own `## Stack Deltas` section. The pipeline is defined ONCE here so the two stacks cannot drift; wherever a phase says "your stack's <delta>", read the value from the delegating stack skill. These "Phase 1–6" are the stack-execution phases — distinct from this orchestrator's Phase 0–2 above — and the stack skill runs them in order after being delegated to.

### Task Discovery

Call TaskList to find the planning tasks created by the plan command. Match tasks by subject to find the IDs for tasks 2-6:

- Task 2: "Gather context"
- Task 3: "Analyze codebase"
- Task 4: "Validate plan scores"
- Task 5: "Review with experts"
- Task 6: "Output final plan"

Use these IDs for all TaskUpdate calls in the phases below.

### Phase 1: Context Gathering

**FIRST**, call TaskUpdate to set task 2 ("Gather context") to `status: "in_progress"`.

1. **Branch Changes** - Analyze all changes since diverging from main:
   - `git log origin/main..HEAD --oneline` - commits on this branch
   - `git diff origin/main...HEAD` - all code changes
2. **Codebase Exploration** - Decide where context comes from before crawling, so the snapshot and live tools don't re-traverse the same tree:
   - **Snapshot (default — broad/whole-repo reads):** the Phase 0 repomix snapshot already covers the whole tree. Search it with `grep_repomix_output`/`read_repomix_output` (step 6) for related implementations, similar features, and test patterns. Do NOT crawl the tree live for what the snapshot can answer.
   - **Live tools (Explore agents / Grep / Glob — only what the snapshot cannot serve):** the snapshot reflects `main` at the last merge, so on a feature branch it lags by the in-flight changes; those are in the Phase 1 branch diff (step 1), not the pack. Reach for live tools only for in-flight working-tree code, or a targeted fresh read the snapshot is too stale or too coarse to answer.
   - Launch Explore agents (parallel) ONLY when the rule above calls for a live read; otherwise skip them. When you do, start from TODO locations found in Phase 0 (if any) and search `*.ts`/`*.tsx` files.
3. **Documentation Lookup** (MANDATORY) - Look up docs for ALL task-relevant libraries. Identify libraries from: `package.json`, issue/ticket description, and codebase exploration results (e.g. your stack's **example libraries** delta). Use all available documentation sources. If a source is unavailable or returns no results, continue with remaining sources.
   - **context7** — For each library, call in sequence: (1) `mcp__context7__resolve-library-id` with the library name to get `libraryId`, then (2) `mcp__context7__query-docs` with `libraryId` and a task-relevant topic. Run multiple `resolve-library-id` calls in parallel, then multiple `query-docs` in parallel.
   - **Ref** — For official documentation: `mcp__Ref__ref_search_documentation` with the technology name and topic, then `mcp__Ref__ref_read_url` to read specific pages from results.
   - **Exa** — For real-world patterns and examples: `mcp__exa__web_search_exa` for API patterns, migration guides, changelogs. `mcp__exa__get_code_context_exa` for code examples.
   - **Perplexity** — For general and architectural questions: `mcp__perplexity__search` for factual lookups. `mcp__perplexity__reason` for trade-off analysis.
4. **Repository Documentation** (MANDATORY) - Read the repo's own docs as the project's source of truth: read the root `README.md` and inspect/read all files under `docs/` and its subfolders. Feed project-specific conventions into the plan.
5. **CLAUDE.md Compliance** - Map each planned change to project rules
6. **Repomix** - Search codebase via `mcp__repomix__grep_repomix_output` (outputId from Phase 0). Use `mcp__repomix__read_repomix_output` with `startLine`/`endLine` for specific sections only.

After completing all context gathering, call TaskUpdate to set task 2 ("Gather context") to `status: "completed"`.

### Phase 2: Deep Analysis

**FIRST**, call TaskUpdate to set task 3 ("Analyze codebase") to `status: "in_progress"`.

Analyze each dimension before planning. Use `mcp__repomix__grep_repomix_output` (outputId from Phase 0) to search for relevant code, and `mcp__repomix__read_repomix_output` with `startLine`/`endLine` to read specific sections. Fall back to Grep, Read, or Glob when Repomix results are insufficient.

| Dimension        | Key Questions                                             |
| ---------------- | --------------------------------------------------------- |
| **Architecture** | Where does this fit? What modules are affected?           |
| **Patterns**     | What existing patterns to follow? Check similar code.     |
| **Data Flow**    | How does data move? What's the source of truth?           |
| **Types**        | What interfaces/schemas exist? What needs Zod validation? |
| **Edge Cases**   | What could fail? Null states? Race conditions?            |

After completing deep analysis, call TaskUpdate to set task 3 ("Analyze codebase") to `status: "completed"`.

### Phase 3: Draft Plan

**FIRST**, call TaskUpdate to set task 6 ("Output final plan") to `status: "in_progress"`.

Assemble a complete plan draft now — before scoring and expert review — so both operate on a concrete artifact instead of an imagined one. Build the draft from the output template below and keep it available for Phase 4 (expert review) and Phase 5 (scoring). Leave the `Score:` line as a placeholder; Phase 5 fills it. Do NOT mark task 6 completed yet — it stays in progress until Phase 6 finalizes the plan.

The template below starts with `# <Title>` — see the canonical "Plan File Header (MANDATORY)" rule in `## Common Instructions` above for title derivation and section ordering.

```
# <Title>

## Summary
[1-2 sentences: what and why]
Steelmanned intent: [verbatim from Phase 0 Steelmanned Intent block]
Score: [filled in Phase 5 — leave as a placeholder in the draft]

<!-- Include the ## Diagrams section only if the change is architectural/visual/UI/flow-related. Generate diagrams via Skill(autopilot:ascii-schemas) per the plan skill's "Visualize with ASCII Schemas" guidance. -->
## Diagrams
[ASCII diagram(s) generated via Skill(autopilot:ascii-schemas) — architecture, data flow, sequence, topology, UI layout, or component interaction. Omit this section entirely for pure logic/refactor changes.]

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

Keep task 6 in progress — Phase 6 marks it completed after the plan is finalized.

### Phase 4: Dynamic Expert Review

**FIRST**, call TaskUpdate to set task 5 ("Review with experts") to `status: "in_progress"`.

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

Wait for all agents to complete. Each returns a JSON object (`expertRole`, `score`, `verdict`, `findings`, `revision`). Aggregate the `findings` across experts to refine the Phase 3 draft internally, and treat any `needs-revision` verdict as a signal to address that expert's findings before finalizing. Do not include the raw expert JSON in the plan output.

After all expert reviews complete, call TaskUpdate to set task 5 ("Review with experts") to `status: "completed"`.

### Phase 5: Validation Scoring

**FIRST**, call TaskUpdate to set task 4 ("Validate plan scores") to `status: "in_progress"`.

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
2. Ask clarifying questions in quiz format
3. Re-analyze and re-score internally (do not output retry details)
4. Repeat until 95+ achieved

After scoring completes, call TaskUpdate to set task 4 ("Validate plan scores") to `status: "completed"`.

### Phase 6: Finalize Output

Apply the expert findings (Phase 4) and the validated score (Phase 5) to the Phase 3 draft, then write the final plan file. Replace the `Score:` placeholder in the `## Summary` block with the Phase 5 result (`Score: [X]/100`).

After outputting the final plan, call TaskUpdate to set task 6 ("Output final plan") to `status: "completed"`.
