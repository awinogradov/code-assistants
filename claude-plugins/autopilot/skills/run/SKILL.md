---
name: run
description: Plan, implement, commit, create PR, and monitor until approved
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

**Difference from `/autopilot:plan`:** invoking `/autopilot:run` authorizes the entire flow up front — there is **no plan-approval gate**. Autopilot plans, implements, commits, creates a PR, and monitors for review approval, without ever pausing for plan confirmation or per-step approval. (`/autopilot:plan`, by contrast, has two gates: it stops to get the plan approved, then asks again before creating a PR.)

## Input

Arguments: `$ARGUMENTS`

Expected forms (same as `plan`):

- `<task description>` — free-form description
- `<GitHub-issue-number>` / `<GitHub-issue-URL>`
- `<Linear-issue-id>` (e.g. `ENG-123`) or a Linear issue URL — when a `linear` tracker is configured
- `<code-scanning-alert>` — `alert#<n>` or a code-scanning alert URL

## Input resolution

Identical to the `plan` skill. See the [`plan` skill's `## Input resolution` section](../plan/SKILL.md#input-resolution).

## Task Progress Protocol

All phases MUST use Claude Code's built-in task system for progress tracking. Create all tasks upfront, then update status as work progresses. Skills invoked from this command follow the same protocol.

### Task Setup (MANDATORY - do FIRST before any work)

Create all 9 tasks using TaskCreate, in order, before starting any work:

| #   | Subject              | ActiveForm             | Source    |
| --- | -------------------- | ---------------------- | --------- |
| 1   | Resolve input        | Resolving input        | autopilot |
| 2   | Gather context       | Gathering context      | skill     |
| 3   | Analyze codebase     | Analyzing codebase     | skill     |
| 4   | Review with experts  | Reviewing with experts | skill     |
| 5   | Validate plan scores | Validating plan scores | skill     |
| 6   | Output final plan    | Outputting final plan  | skill     |
| 7   | Commit changes       | Committing changes     | autopilot |
| 8   | Create PR            | Creating PR            | autopilot |
| 9   | Monitor PR           | Monitoring PR          | autopilot |

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

1. Create all 9 tasks as defined in the Task Progress Protocol above (call TaskCreate 9 times)
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

After all calls complete, store the `outputId` from the snapshot acquisition (attach or pack) response — the stack pipeline's Context Gathering phase is the single place that reads the codebase from it. [Phase 0](#phase-0-input-resolution) does NOT grep or read code: render the issue/alert context below from the resolved JSON (and, for issues, the TODO results) alone. Defer every codebase read to Context Gathering.

### Alert Context Output (code-scanning-alert input)

For a `code-scanning-alert` input, render the context from the `resolve-alert-context` JSON instead of the issue block — `source`, `ruleId`, `severity`, `state`, `file:line`, and `message`. There is no TODO search and no assignee. The Steelmanned Intent derives from the alert rule and message. Everything downstream keys off the `code-scanning-alert` type: the branch is `security-<slug>` (NOT `issue-<n>-…`), the PR uses a `SECURITY:` title that records the alert reference (`htmlUrl`) and emits **no** `Closes #`, and the verify step polls alert state via `gh api repos/{owner}/{repo}/code-scanning/alerts/{n} --jq .state` (expecting `fixed` after merge + the next scan).

### Issue Context Output

The [`resolve-issue-context`](../../agents/resolve-issue-context.md) and [`search-codebase-todos`](../../agents/search-codebase-todos.md) agents each return a single JSON object (see each agent's output schema). Parse both, then render the issue context for display from the `resolve-issue-context` fields — `source`, `title`, `status`, `labels`, `assignee` (only when non-null), `description`, and `comments` — and append the TODO results rendered from `search-codebase-todos`:

```
### Related TODOs in Codebase
[render from the `todos` array (each as `location` — `text`) and `total`; when `total` is 0, output "No related TODOs found"]
```

After completing the Issue Context Output, call TaskUpdate to set task 1 ("Resolve input") to `status: "completed"`.

## Preflight Check

After completing [Phase 0](#phase-0-input-resolution), invoke the preflight check skill to validate the git branch state:

```
Skill(autopilot:preflight-check)
```

The skill receives `mode: plan` and the [Phase 0](#phase-0-input-resolution) context (input type, issue ID) from the conversation history. It validates the current branch, checks for merged/stale branches, detects issue ID mismatches, and ensures main is up to date.

If the skill outputs "Planning cancelled", stop execution immediately — do not proceed to [Phase 1](#phase-1-detect-stack-and-delegate).

## Common Instructions

The following apply to ALL stacks before delegating to the stack-specific skill:

### Documentation Lookup Protocol (MANDATORY)

Before planning, look up documentation for every technology and library relevant to the task. **Scale the lookup to the task:** a small or well-understood change needs a single targeted lookup (or none); reserve the full multi-source fan-out below for tasks that touch unfamiliar libraries, APIs, or recent changes.

**Step 1: Identify technologies** from all sources:

- Manifest file (`package.json`) — libraries relevant to the task
- Issue/ticket description — libraries explicitly mentioned by the user
- Codebase exploration — libraries discovered during [Phase 1](#phase-1-detect-stack-and-delegate) exploration

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

4. Invoke the skill. The skill receives the full [Phase 0](#phase-0-input-resolution) context (issue data, branch info, TODO matches) from the conversation history and executes the stack-specific phases.

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

Embed branch creation and autopilot post-implementation into the plan file, then proceed directly to implementing it. **Do NOT call `ExitPlanMode`, and do NOT pause for plan approval** — invoking `/autopilot:run` is the approval. Never tell the user "after you approve I'll implement"; that is `/autopilot:plan` behavior, not run's.

### Pre-Implementation (Branch Creation)

Check conditions:

1. Input type from [Phase 0](#phase-0-input-resolution) Issue Context
2. Current branch: `git branch --show-current`
3. Worktree detection — run both commands:
   - `git rev-parse --git-dir`
   - `git rev-parse --git-common-dir`
   - If the two values differ → `isWorktree = true`, otherwise `isWorktree = false`
4. If `isWorktree` is true AND not on `main`, check for unmerged commits: `git log origin/main..HEAD --oneline`
   - If output is empty → `worktreeNeedsBranch = true`
   - If output is non-empty → `worktreeNeedsBranch = false`

#### If on `main` branch OR `worktreeNeedsBranch` is true

Add `## Pre-Implementation` as the FIRST section of the plan file (before `## Summary`). The block content depends on input type from [Phase 0](#phase-0-input-resolution).

##### Input type is `github-issue` (bare number, `#`-prefixed number, or GitHub issue URL)

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with arguments `<issue-number> --autopilot` (e.g., `42 --autopilot` for `#42`). The branch-create skill fetches the issue, generates an `issue-<number>-<slug>` branch name, and creates the branch directly without a confirmation prompt (the `--autopilot` flag suppresses Phase 5). Do NOT present a Hotfix/Trivial/Maintenance prefix prompt — issue inputs always use the `issue-<number>-<slug>` convention so the PR can link back via `Closes #<number>`. Conflict resolution still surfaces if the branch already exists.
```

##### Input type is `linear-issue` or `linear-issue-url` (a Linear id such as `ENG-123`, or a Linear issue URL)

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with arguments `<LINEAR-ID> --start --autopilot` (e.g., `ENG-123 --start --autopilot`). The branch-create skill fetches the ticket, generates a `<team>-<number>-<slug>` branch name, and creates the branch directly without a confirmation prompt (the `--autopilot` flag suppresses Phase 5). The `--start` flag then moves the ticket to "In Progress" (best-effort — it never blocks branch creation), mirroring how `github-issue` inputs are auto-assigned to the current user the moment work starts. Do NOT present a Hotfix/Trivial/Maintenance prefix prompt — Linear inputs always use the `<team>-<number>-<slug>` convention so the PR can link back via `Closes <LINEAR-ID>`. Conflict resolution still surfaces if the branch already exists.
```

##### Input type is `code-scanning-alert`

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Invoke `Skill(autopilot:branch-create)` with arguments `--security "<slug>" --autopilot`, where `<slug>` paraphrases the resolved alert's rule/file (e.g., `tainted-format-string`). The branch-create skill creates a `security-<slug>` branch directly (the `--autopilot` flag suppresses Phase 5). The alert is NOT a GitHub issue, so the `issue-<number>-<slug>` form does not apply and the PR emits no `Closes #` — it records the alert reference instead. Conflict resolution still surfaces if the branch already exists.
```

##### Input type is `plain description`

Use this body for the `## Pre-Implementation` section:

```
## Pre-Implementation

Choose a branch type for this change using AskUserQuestion (this is the one prompt autopilot keeps — picking a special-prefix type cannot be inferred from a free-form description):

Tool parameters:
- `question`: "Choose a branch type for this change."
- `header`: "Branch type"
- `options`: [
  { label: "Hotfix", description: "Emergency production fix (hotfix-<slug>)" },
  { label: "Trivial", description: "Typos, docs, formatting (trivial-<slug>)" },
  { label: "Maintenance", description: "Deps, CI, configs (maintenance-<slug>)" }
  ]
- `multiSelect`: false

Then invoke `Skill(autopilot:branch-create)` with arguments `--<chosen-prefix> "<description>" --autopilot`, where `<description>` is a short summary derived from the user description. The `--autopilot` flag suppresses the Phase 5 confirmation so the branch is created directly with the generated name. Conflict resolution still surfaces if the branch already exists.
```

#### Otherwise (not on `main` AND (`isWorktree` is false OR `worktreeNeedsBranch` is false))

Do NOT add `## Pre-Implementation` — already on a feature branch with active work.

### Autopilot Post-Implementation (REPLACE plan skill's default)

After the plan-\* skill writes its plan output, **REPLACE** the `## Post-Implementation` section in the plan file with the following autopilot-specific flow:

```
## Post-Implementation (Autopilot)

After all implementation steps and verification are complete, execute the following steps automatically. Do NOT present a "What's next?" AskUserQuestion — proceed through all steps without pausing for user input.

### Step 1: Auto-Commit

Call TaskUpdate to set task 7 ("Commit changes") to `status: "in_progress"`. Invoke `Skill(autopilot:commits-create)` with arguments `--autopilot`. The `--autopilot` flag suppresses commits:create's commit-strategy prompt (Phase 3), commit-message confirmation (Phase 4), and PR-update offer (Phase 5). Follow the skill's full workflow — do NOT run `git commit` directly.

If the commit fails due to a pre-commit hook, check `git status` for modified files (hook may have auto-formatted), re-stage with `git add -u`, and retry the commit once. If still fails, report the error and stop.

After committing, push: `git push -u origin <branch>`. Then set task 7 ("Commit changes") to `completed`.

### Step 2: Auto-Create PR

Call TaskUpdate to set task 8 ("Create PR") to `status: "in_progress"`.

**CRITICAL — direct `gh pr create` and `gh pr edit` are FORBIDDEN in autopilot.** ALL PR creation and updates MUST go through `Skill(autopilot:pr-create)` and `Skill(autopilot:pr-update)`. Direct CLI calls produce PRs in the incorrect format. If a skill call fails or times out, report the error and stop — do NOT fall back to direct CLI commands.

1. Check if PR already exists: `gh pr view --json number,url`
   - If exit code 0 (PR exists): invoke `Skill(autopilot:pr-update)` — NEVER run `gh pr edit` directly. (pr:update has no user-facing confirmation prompt in the autopilot flow today, so no flag is needed.) Proceed to format check below.
   - If exit code 1 (no PR): proceed with creation below
   - If other error (network/auth): report error and stop

2. Invoke `Skill(autopilot:pr-create)` with arguments `--autopilot` (append `--release-notes` when the branch's commits include `feat:` or `fix:` types so user-facing notes are included). The `--autopilot` flag suppresses pr:create's Phase 5 confirmation. Release notes are added automatically for breaking changes regardless of the flag. NEVER run `gh pr create` directly — even if the skill fails or times out. If the skill errors, report the failure and stop. Do NOT fall back to direct CLI.

Output the PR URL after creation. Set task 8 ("Create PR") to `completed`.

3. **Format check** — After creating or updating the PR, validate its format:
   - Run `gh pr view --json title,body`
   - Verify the body contains `**Issues:**` as a section heading (skip for special prefix branches: hotfix/trivial/maintenance/proposal/security). For a `security-*` branch, instead verify the body contains an `**Alert:**` reference (the code-scanning alert URL) and NO `Closes #` — alerts close on re-scan, not via PR magic words.
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

Call TaskUpdate to set task 9 ("Monitor PR") to `status: "in_progress"`. Invoke `Skill(autopilot:pr-monitor)` in foreground mode (do NOT use the Agent tool with run_in_background). The skill will:
- Poll every minute for review status
- If changes requested: invoke pr:resolve interactively (user IS involved for review feedback)
- Wait for approval or merge

**Autopilot override for pr:resolve:** When pr:monitor invokes pr:resolve and the skill presents options via AskUserQuestion:
- For review action (Phase 3): auto-select "Address all"
- For replies (Phase 6): auto-select "Post all replies"

### Completion

Set task 9 ("Monitor PR") to `completed`. Output:

Autopilot complete.
PR: <pr-url>
Status: <approved/merged>
```

When you write the plan file, apply the reference-formatting rules inlined at the end of this skill (the **Reference formatting & readability** block below, RFC-0001 v3) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

## Phase 3: Implement and Proceed

Once the plan file is written (with `## Pre-Implementation` and `## Post-Implementation (Autopilot)` embedded), proceed straight through with no approval gate:

1. Run the `## Pre-Implementation` branch creation.
2. Implement every step in the plan, verifying each as you go.
3. Execute the `## Post-Implementation (Autopilot)` chain — commit → push → PR → monitor — without prompting.

The only user prompts in the entire run are the branch-type pick for plain-description inputs ([Phase 2](#phase-2-embed-branch-creation--autopilot-post-implementation)) and review-feedback handling during PR monitoring. There is no plan-approval step — do not call `ExitPlanMode` and do not ask the user to confirm the plan before implementing.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
