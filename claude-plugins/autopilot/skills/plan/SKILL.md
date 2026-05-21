---
name: plan
description: Perform deep analysis of the codebase, recent changes, and the requested task. Create a validated, expert-reviewed implementation plan
argument-hint: "<task description, GitHub issue number, or GitHub issue URL>"
allowed-tools:
  - Read
  - Grep
  - Glob
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
Pack codebase (MCP direct call):
  Call `mcp__repomix__pack_codebase` with:
  - `directory`: [repository root absolute path]
  - `compress`: true

Agent 1 (resolve-issue-context):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:resolve-issue-context"
  - `prompt`: "Fetch issue context. Input type: github-issue. Issue ID: [id]. Repository: [owner/repo]. Fetch parent/siblings: true."
  - `description`: "Resolve issue context"

Agent 2 (search-codebase-todos):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:search-codebase-todos"
  - `prompt`: "Search for TODOs. Input type: github-issue. Issue ID: [id]."
  - `description`: "Search codebase TODOs"
```

**If input type is `plain description`** — call `mcp__repomix__pack_codebase` directly (no agents needed):

```
Pack codebase (MCP direct call):
  Call `mcp__repomix__pack_codebase` with:
  - `directory`: [repository root absolute path]
  - `compress`: true
```

After all calls complete:

1. Store the `outputId` from the `pack_codebase` response for use throughout all phases
2. Use `grep_repomix_output` with the `outputId` to search for task-relevant code (keywords from issue title/description, related module names)
3. Use `read_repomix_output` with `startLine`/`endLine` only to read specific sections found via grep

### Issue Context Output

Present the `resolve-issue-context` agent's output along with TODO search results from `search-codebase-todos`. The agents return structured blocks. Output the issue context directly, then append the TODO results:

```
### Related TODOs in Codebase
[output from search-codebase-todos agent]
```

After completing the Issue Context Output, call TaskUpdate to set task 1 ("Resolve input") to `status: "completed"`.

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

### CLAUDE.md Compliance

Map each planned change to project rules defined in CLAUDE.md.

### Visualize with ASCII Schemas

When the planned change is structural or visual, invoke `Skill(autopilot:ascii-schemas)` to generate diagrams and embed them in the plan's `## Diagrams` section (see the stack skill's Phase 5 output template).

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

### If (`github-issue` OR `plain description`) AND (on `main` branch OR `worktreeNeedsBranch` is true)

Add `## Pre-Implementation` as the FIRST section of the plan file (before `## Summary`):

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

Then invoke `/autopilot:branch-create --<chosen-prefix> "<description>"` using the Skill tool, where `<description>` is a short summary derived from the task context (issue title or user description). The branch name MUST be approved by the user via AskUserQuestion before creation — do not skip approval or create the branch directly with git commands.
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
