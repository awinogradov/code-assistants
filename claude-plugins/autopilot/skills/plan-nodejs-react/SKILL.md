---
name: plan-nodejs-react
description: Execute NodeJS+React-specific implementation planning phases. Use when plan command delegates to NodeJS+React stack.
user-invocable: false
allowed-tools:
  - TaskList
  - TaskUpdate
  - TaskCreate
  - Read
  - Grep
  - Glob
  - Bash(git *)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
  - MCP(repomix:*)
  - AskUserQuestion
  - Skill(autopilot:ascii-schemas)
---

Continue implementation planning using NodeJS+React-specific configuration. Phase 0 context (issue data, branch info, TODO matches) is available from the conversation history.

### Task Discovery

Call TaskList to find the planning tasks created by the plan command. Match tasks by subject to find the IDs for tasks 2-6:

- Task 2: "Gather context"
- Task 3: "Analyze codebase"
- Task 4: "Validate plan scores"
- Task 5: "Review with experts"
- Task 6: "Output final plan"

Use these IDs for all TaskUpdate calls in the phases below.

## Phase 1: Context Gathering

**FIRST**, call TaskUpdate to set task 2 ("Gather context") to `status: "in_progress"`.

1. **Branch Changes** - Analyze all changes since diverging from main:
   - `git log origin/main..HEAD --oneline` - commits on this branch
   - `git diff origin/main...HEAD` - all code changes
2. **Codebase Exploration** - Launch Explore agents (parallel) to understand:
   - Start from TODO locations found in Phase 0 (if any)
   - Related existing implementations and patterns
   - Similar features and how they were built
   - Test patterns for comparable functionality
   - Search in `*.ts` and `*.tsx` files
3. **Documentation Lookup** (MANDATORY) - Look up docs for ALL task-relevant libraries. Identify libraries from: `package.json`, issue/ticket description, and codebase exploration results (e.g., `react`, `next`, `@tanstack/react-query`). Use all available documentation sources. If a source is unavailable or returns no results, continue with remaining sources.
   - **context7** — For each library, call in sequence: (1) `mcp__context7__resolve-library-id` with the library name to get `libraryId`, then (2) `mcp__context7__query-docs` with `libraryId` and a task-relevant topic. Run multiple `resolve-library-id` calls in parallel, then multiple `query-docs` in parallel.
   - **Ref** — For official documentation: `mcp__Ref__ref_search_documentation` with the technology name and topic, then `mcp__Ref__ref_read_url` to read specific pages from results.
   - **Exa** — For real-world patterns and examples: `mcp__exa__web_search_exa` for API patterns, migration guides, changelogs. `mcp__exa__get_code_context_exa` for code examples.
   - **Perplexity** — For general and architectural questions: `mcp__perplexity__search` for factual lookups. `mcp__perplexity__reason` for trade-off analysis.
4. **CLAUDE.md Compliance** - Map each planned change to project rules
5. **Repomix** - Search codebase via `mcp__repomix__grep_repomix_output` (outputId from Phase 0). Use `mcp__repomix__read_repomix_output` with `startLine`/`endLine` for specific sections only.

After completing all context gathering, call TaskUpdate to set task 2 ("Gather context") to `status: "completed"`.

## Phase 2: Deep Analysis

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

## Phase 3: Validation Scoring

**FIRST**, call TaskUpdate to set task 4 ("Validate plan scores") to `status: "in_progress"`.

Rate the plan (20 points each dimension = 100 total):

| Dimension        | Criteria                                                                                                                            | Score |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Alignment**    | Follows CLAUDE.md, project patterns, naming conventions                                                                             | /20   |
| **Completeness** | All requirements addressed, no missing steps                                                                                        | /20   |
| **Type Safety**  | Proper types, Zod schemas, no unsafe `as` assertions                                                                                | /20   |
| **Testability**  | Clear test strategy, edge cases identified                                                                                          | /20   |
| **Simplicity**   | Minimal code, reuses existing functions, no over-engineering, every change traces to steelmanned intent, no opportunistic refactors | /20   |

### Auto-Iteration Protocol (Target: 95+)

If score < 95, automatically:

1. Identify weak dimensions (score < 19)
2. Ask clarifying questions in quiz format
3. Re-analyze and re-score internally (do not output retry details)
4. Repeat until 95+ achieved

After scoring completes, call TaskUpdate to set task 4 ("Validate plan scores") to `status: "completed"`.

## Phase 4: Dynamic Expert Review

**FIRST**, call TaskUpdate to set task 5 ("Review with experts") to `status: "in_progress"`.

**Always include the Pre-mortem Analyst**, then select 2-3 additional experts based on task scope:

| Expert                         | When to Include           | Focus Areas                                                                                                        |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Pre-mortem Analyst**         | Always (default reviewer) | Imagine the plan failed 6 months from now — return ranked failure narratives, early warning signs, and mitigations |
| **Principal Node.js Engineer** | Server-side logic, APIs   | Performance, async, error handling, memory                                                                         |
| **DBA**                        | Database changes          | Query efficiency, indexes, transactions, migrations                                                                |
| **Principal DevOps Engineer**  | Infra, env, deployment    | Env vars, scaling, monitoring, CI/CD                                                                               |
| **Senior Frontend Engineer**   | UI changes                | React patterns, state, UX, accessibility                                                                           |
| **Senior QA Engineer**         | Any code change           | Test coverage, edge cases, regression risk                                                                         |
| **CISO**                       | Auth, data, APIs, infra   | Security architecture, OWASP, compliance, reliability                                                              |
| **Principal Designer**         | UI/UX changes             | Fast, beautiful, simple, minimal; design patterns                                                                  |
| **Principal SRE**              | Production systems        | Scalability, metrics, stability, performance                                                                       |
| **Boring Tech Writer**         | User-facing changes       | README clarity, usage instructions, JSDoc, comments                                                                |

For each selected expert, launch a `autopilot:expert-review` sub-agent. Launch all experts **in parallel** (single message, multiple Agent tool calls):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:expert-review"
- `prompt`: "You are a [Expert Role]. Review this implementation plan.
  Focus areas: [from table above].
  Scoring target: 95+.
  Limit your report to the 3–5 strongest findings — depth over breadth.

  [full plan text from Phase 5 output]"
- `description`: "Expert review: [Role]"
```

Wait for all agents to complete. Use their findings to refine the implementation plan internally. Do not include expert report blocks in the plan output.

After all expert reviews complete, call TaskUpdate to set task 5 ("Review with experts") to `status: "completed"`.

## Phase 5: Output Format

**FIRST**, call TaskUpdate to set task 6 ("Output final plan") to `status: "in_progress"`.

The template below starts with `# <Title>` — see the canonical "Plan File Header (MANDATORY)" rule in `plan/SKILL.md` `## Common Instructions` for title derivation and section ordering.

```
# <Title>

## Summary
[1-2 sentences: what and why]
Steelmanned intent: [verbatim from Phase 0 Steelmanned Intent block]
Score: [X]/100

<!-- Include the ## Diagrams section only if the change is architectural/visual/UI/flow-related. Generate diagrams via Skill(autopilot:ascii-schemas) per the plan skill's "Visualize with ASCII Schemas" guidance. -->
## Diagrams
[ASCII diagram(s) generated via Skill(autopilot:ascii-schemas) — architecture, data flow, sequence, topology, UI layout, or component interaction. Omit this section entirely for pure logic/refactor changes.]

## Implementation Steps
1. [ ] [Action] in `path/to/file.ts`
   - verify: [observable check — test name, command, or behavior]
2. [ ] [Action] in `path/to/file.ts`
   - verify: [observable check — test name, command, or behavior]

## Files
- `path/to/file.ts:NN` - [what changes]
- `path/to/new.ts` - [purpose] (new)

## Post-Implementation

After all implementation steps and verification are complete, present next actions using AskUserQuestion.

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

After outputting the final plan, call TaskUpdate to set task 6 ("Output final plan") to `status: "completed"`.

## Quiz Mode Format

When clarification needed:

```
**Q[N]**: [Clear question]
A) [Option with brief explanation]
B) [Option with brief explanation]
C) [Option with brief explanation]
D) Other: ___
```
