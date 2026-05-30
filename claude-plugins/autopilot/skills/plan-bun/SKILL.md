---
name: plan-bun
description: Execute Bun/NodeJS-specific implementation planning phases. Use when plan command delegates to Bun stack.
user-invocable: false
allowed-tools:
  - TaskList
  - TaskUpdate
  - TaskCreate
  - Read
  - Grep
  - Glob
  - Agent
  - Bash(git *)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
  - MCP(repomix:*)
  - AskUserQuestion
  - Skill(autopilot:ascii-schemas)
---

Continue implementation planning using Bun/NodeJS-specific configuration. Phase 0 context (issue data, branch info, TODO matches) is available from the conversation history.

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
2. **Codebase Exploration** - Decide where context comes from before crawling, so the snapshot and live tools don't re-traverse the same tree:
   - **Snapshot (default — broad/whole-repo reads):** the Phase 0 repomix snapshot already covers the whole tree. Search it with `grep_repomix_output`/`read_repomix_output` (step 6) for related implementations, similar features, and test patterns. Do NOT crawl the tree live for what the snapshot can answer.
   - **Live tools (Explore agents / Grep / Glob — only what the snapshot cannot serve):** the snapshot reflects `main` at the last merge, so on a feature branch it lags by the in-flight changes; those are in the Phase 1 branch diff (step 1), not the pack. Reach for live tools only for in-flight working-tree code, or a targeted fresh read the snapshot is too stale or too coarse to answer.
   - Launch Explore agents (parallel) ONLY when the rule above calls for a live read; otherwise skip them. When you do, start from TODO locations found in Phase 0 (if any) and search `*.ts`/`*.tsx` files.
3. **Documentation Lookup** (MANDATORY) - Look up docs for ALL task-relevant libraries. Identify libraries from: `package.json`, issue/ticket description, and codebase exploration results (e.g., `zod`, `hono`, `@effect/schema`). Use all available documentation sources. If a source is unavailable or returns no results, continue with remaining sources.
   - **context7** — For each library, call in sequence: (1) `mcp__context7__resolve-library-id` with the library name to get `libraryId`, then (2) `mcp__context7__query-docs` with `libraryId` and a task-relevant topic. Run multiple `resolve-library-id` calls in parallel, then multiple `query-docs` in parallel.
   - **Ref** — For official documentation: `mcp__Ref__ref_search_documentation` with the technology name and topic, then `mcp__Ref__ref_read_url` to read specific pages from results.
   - **Exa** — For real-world patterns and examples: `mcp__exa__web_search_exa` for API patterns, migration guides, changelogs. `mcp__exa__get_code_context_exa` for code examples.
   - **Perplexity** — For general and architectural questions: `mcp__perplexity__search` for factual lookups. `mcp__perplexity__reason` for trade-off analysis.
4. **Repository Documentation** (MANDATORY) - Read the repo's own docs as the project's source of truth: read the root `README.md` and inspect/read all files under `docs/` and its subfolders. Feed project-specific conventions into the plan.
5. **CLAUDE.md Compliance** - Map each planned change to project rules
6. **Repomix** - Search codebase via `mcp__repomix__grep_repomix_output` (outputId from Phase 0). Use `mcp__repomix__read_repomix_output` with `startLine`/`endLine` for specific sections only.

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

## Phase 3: Draft Plan

**FIRST**, call TaskUpdate to set task 6 ("Output final plan") to `status: "in_progress"`.

Assemble a complete plan draft now — before scoring and expert review — so both operate on a concrete artifact instead of an imagined one. Build the draft from the output template below and keep it available for Phase 4 (expert review) and Phase 5 (scoring). Leave the `Score:` line as a placeholder; Phase 5 fills it. Do NOT mark task 6 completed yet — it stays in progress until Phase 6 finalizes the plan.

The template below starts with `# <Title>` — see the canonical "Plan File Header (MANDATORY)" rule in `plan/SKILL.md` `## Common Instructions` for title derivation and section ordering.

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

Every step MUST include a `verify:` line — an observable check (test name, command, or behavior).

1. [ ] [Action] in `path/to/file.ts`
   - verify: `bun test path/to/file.test.ts` passes
2. [ ] [Action] in `path/to/file.ts`
   - verify: CLI prints the new flag in `--help` output

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

## Phase 4: Dynamic Expert Review

**FIRST**, call TaskUpdate to set task 5 ("Review with experts") to `status: "in_progress"`.

**Always include the Pre-mortem Analyst**, then select 2-3 additional experts based on task scope:

| Expert                            | When to Include                        | Focus Areas                                                                                                        |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Pre-mortem Analyst**            | Always (default reviewer)              | Imagine the plan failed 6 months from now — return ranked failure narratives, early warning signs, and mitigations |
| **Principal Bun/NodeJS Engineer** | Server-side logic, APIs                | Performance, async, error handling, memory                                                                         |
| **Principal DevOps Engineer**     | GitHub API, GitHub Actions workflows   | Env vars, secrets, scaling, monitoring, CI/CD                                                                      |
| **Principal SRE**                 | Production systems, Kubernetes, Docker | Scalability, metrics, stability, performance                                                                       |
| **Boring Tech Writer**            | User-facing changes                    | README clarity, usage instructions, JSDoc, comments                                                                |

For each selected expert, launch a `autopilot:expert-review` sub-agent. Launch all experts **in parallel** (single message, multiple Agent tool calls):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:expert-review"
- `prompt`: "You are a [Expert Role]. Review this implementation plan.
  Focus areas: [from table above].
  Scoring target: 95+.
  Limit your report to the 3–5 strongest findings — depth over breadth.

  [full plan text from the Phase 3 draft]"
- `description`: "Expert review: [Role]"
```

Wait for all agents to complete. Use their findings to refine the Phase 3 draft internally. Do not include expert report blocks in the plan output.

After all expert reviews complete, call TaskUpdate to set task 5 ("Review with experts") to `status: "completed"`.

## Phase 5: Validation Scoring

**FIRST**, call TaskUpdate to set task 4 ("Validate plan scores") to `status: "in_progress"`.

Rate the reviewed plan (20 points each dimension = 100 total):

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

## Phase 6: Finalize Output

Apply the expert findings (Phase 4) and the validated score (Phase 5) to the Phase 3 draft, then write the final plan file. Replace the `Score:` placeholder in the `## Summary` block with the Phase 5 result (`Score: [X]/100`).

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
