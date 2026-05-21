---
name: run
description: Plan, implement, commit, create PR, and monitor until approved
argument-hint: "<task description, GitHub issue number, or GitHub issue URL>"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(git *)
  - Bash(gh *)
  - Bash(sleep *)
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
  - Skill(autopilot:pr-monitor)
  - Skill(autopilot:pr-update)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

<!-- Phase 0 mirrors the plan skill. Keep in sync. -->

Plan, implement, commit, create PR, and monitor until approved. Extended version of `/autopilot:plan` that automates post-implementation steps.

**Difference from `/autopilot:plan`:** After the user confirms the plan and implementation is complete, autopilot automatically commits, creates a PR, and monitors for review approval — without asking the user for confirmation at each step.

## Input

Arguments: `$ARGUMENTS`

Expected forms (same as `plan`):

- `<task description>` — free-form description
- `<GitHub-issue-number>` / `<GitHub-issue-URL>`

## Input resolution

Identical to the `plan` skill. See the `plan` skill's `## Input resolution` section.

## Task Progress Protocol

All phases MUST use Claude Code's built-in task system for progress tracking. Create all tasks upfront, then update status as work progresses. Skills invoked from this command follow the same protocol.

### Task Setup (MANDATORY - do FIRST before any work)

Create all 6 tasks using TaskCreate, in order, before starting any work:

| #   | Subject              | ActiveForm             | Source    |
| --- | -------------------- | ---------------------- | --------- |
| 1   | Resolve input        | Resolving input        | autopilot |
| 2   | Gather context       | Gathering context      | skill     |
| 3   | Analyze codebase     | Analyzing codebase     | skill     |
| 4   | Validate plan scores | Validating plan scores | skill     |
| 5   | Review with experts  | Reviewing with experts | skill     |
| 6   | Output final plan    | Outputting final plan  | skill     |

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

## Phase 1: Detect Stack and Delegate

1. Read `package.json` from the repository root
2. Extract the `agents.rules` field value
3. Map to the appropriate skill:

| `rules` value  | Skill                                |
| -------------- | ------------------------------------ |
| `Bun`          | `Skill(autopilot:plan-bun)`          |
| `NodeJS+React` | `Skill(autopilot:plan-nodejs-react)` |

4. Invoke the skill. The skill receives the full Phase 0 context (issue data, branch info, TODO matches) from the conversation history and executes the stack-specific phases.

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in AskUserQuestion `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

If `package.json` does not exist, has no `agents` field, or `agents.rules` is not recognized, ask the user via AskUserQuestion:

Tool parameters:

- `question`: "Could not detect tech stack from package.json agents.rules. Which stack should be used for planning?"
- `header`: "Stack"
- `options`: [
  { label: "Bun", description: "Bun/NodeJS TypeScript projects" },
  { label: "NodeJS+React", description: "Node.js with React frontend" }
  ]
- `multiSelect`: false

## Phase 2: Embed Branch Creation + Autopilot Post-Implementation

**BEFORE calling ExitPlanMode**, embed branch creation and autopilot post-implementation into the plan file.

### Pre-Implementation (Branch Creation)

Check conditions:

1. Input type from Phase 0 Issue Context
2. Current branch: `git branch --show-current`
3. Worktree detection — run both commands:
   - `git rev-parse --git-dir`
   - `git rev-parse --git-common-dir`
   - If the two values differ → `isWorktree = true`, otherwise `isWorktree = false`
4. If `isWorktree` is true AND not on `main`, check for unmerged commits: `git log origin/main..HEAD --oneline`
   - If output is empty → `worktreeNeedsBranch = true`
   - If output is non-empty → `worktreeNeedsBranch = false`

#### If (`github-issue` OR `plain description`) AND (on `main` branch OR `worktreeNeedsBranch` is true)

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

#### Otherwise (not on `main` AND (`isWorktree` is false OR `worktreeNeedsBranch` is false))

Do NOT add `## Pre-Implementation` — already on a feature branch with active work.

### Autopilot Post-Implementation (REPLACE plan skill's default)

After the plan-\* skill writes its plan output, **REPLACE** the `## Post-Implementation` section in the plan file with the following autopilot-specific flow:

```
## Post-Implementation (Autopilot)

After all implementation steps and verification are complete, execute the following steps automatically. Do NOT present a "What's next?" AskUserQuestion — proceed through all steps without pausing for user input.

### Step 1: Auto-Commit

Invoke `Skill(autopilot:commits-create)`. Follow the skill's full workflow — do NOT run `git commit` directly.

**Autopilot override:** This is autopilot mode — the user has pre-authorized automatic approval of commit messages. When the commits:create skill presents commit options via AskUserQuestion:
- For commit strategy: auto-select "Single commit (Recommended)" unless the skill strongly recommends splitting
- For commit message confirmation: auto-select "Commit" — do NOT select "Edit" or "Cancel"
- Skip the "Offer PR Update" step (Phase 5 in commits:create) — the PR will be created in Step 2

If the commit fails due to a pre-commit hook, check `git status` for modified files (hook may have auto-formatted), re-stage with `git add -u`, and retry the commit once. If still fails, report the error and stop.

After committing, push: `git push -u origin <branch>`

### Step 2: Auto-Create PR

**CRITICAL — direct `gh pr create` and `gh pr edit` are FORBIDDEN in autopilot.** ALL PR creation and updates MUST go through `Skill(autopilot:pr-create)` and `Skill(autopilot:pr-update)`. Direct CLI calls produce PRs in the incorrect format. If a skill call fails or times out, report the error and stop — do NOT fall back to direct CLI commands.

1. Check if PR already exists: `gh pr view --json number,url`
   - If exit code 0 (PR exists): invoke `Skill(autopilot:pr-update)` — NEVER run `gh pr edit` directly. Proceed to format check below.
   - If exit code 1 (no PR): proceed with creation below
   - If other error (network/auth): report error and stop

2. Invoke `Skill(autopilot:pr-create)`. NEVER run `gh pr create` directly — even if the skill fails or times out. If the skill errors, report the failure and stop. Do NOT fall back to direct CLI.

**Autopilot override:** This is autopilot mode — the user has pre-authorized automatic approval of PR content. When the pr:create skill presents PR options via AskUserQuestion:
- For uncommitted changes check: auto-select "Continue anyway" (changes were already committed in Step 1)
- For PR confirmation: auto-select "Create PR" — do NOT select "Edit content" or "Cancel"
- If "Add release notes" option appears and the implementation includes user-facing changes (feat: or fix: commits), auto-select "Add release notes" first, then "Create PR"

Output the PR URL after creation.

3. **Format check** — After creating or updating the PR, validate its format:
   - Run `gh pr view --json title,body`
   - Verify the body contains `**Issues:**` as a section heading (skip for special prefix branches: hotfix/trivial/maintenance)
   - Verify the body contains at least one `---` separator on its own line
   - Verify section ordering: `**Issues:**` MUST appear AFTER the last `---` separator (it must be the final section, not the first)
   - If `**Release notes:**` is present, verify it appears BEFORE `**Issues:**` and AFTER the description text
   - Verify the `**Issues:**` section uses magic words (`Closes`/`Related to`), not markdown links like `[ID](url)`
   - If any check fails:
     - Output: "PR format violation detected — skill may have been bypassed. Running pr:update to fix..."
     - Invoke `Skill(autopilot:pr-update)` (auto-select "Auto-generate", then "Update PR")
     - If the update itself fails, report the error and stop
     - Re-validate once. If still failing, output: "PR format could not be auto-fixed. Manual review required." and continue to Step 3

### Step 3: Monitor PR

Invoke `Skill(autopilot:pr-monitor)` in foreground mode (do NOT use the Agent tool with run_in_background). The skill will:
- Poll every minute for review status
- If changes requested: invoke pr:resolve interactively (user IS involved for review feedback)
- Wait for approval or merge

**Autopilot override for pr:resolve:** When pr:monitor invokes pr:resolve and the skill presents options via AskUserQuestion:
- For review action (Phase 3): auto-select "Address all"
- For replies (Phase 6): auto-select "Post all replies"

### Completion

Output:

Autopilot complete.
PR: <pr-url>
Status: <approved/merged>
```

## Quiz Mode Format

When clarification needed:

```
**Q[N]**: [Clear question]
A) [Option with brief explanation]
B) [Option with brief explanation]
C) [Option with brief explanation]
D) Other: ___
```
