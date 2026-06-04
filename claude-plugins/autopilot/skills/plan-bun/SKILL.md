---
name: plan-bun
description: Execute Bun/NodeJS-specific implementation planning phases. Use when plan command delegates to Bun stack.
user-invocable: false
allowed-tools:
  - TaskList
  - TaskUpdate
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

Execute the shared **Stack Pipeline (Phases 1–6)** defined in `plan/SKILL.md` — Task Discovery, then Phase 1 through Phase 6 in order — supplying the three Bun deltas below wherever the pipeline references your stack's delta.

## Stack Deltas

**Example libraries** (Phase 1, Documentation Lookup): `zod`, `hono`, `@effect/schema`

**Expert table** (Phase 4, Dynamic Expert Review) — always include the Pre-mortem Analyst, then select 2-3 additional experts based on task scope:

| Expert                            | When to Include                        | Focus Areas                                                                                                        |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Pre-mortem Analyst**            | Always (default reviewer)              | Imagine the plan failed 6 months from now — return ranked failure narratives, early warning signs, and mitigations |
| **Principal Bun/NodeJS Engineer** | Server-side logic, APIs                | Performance, async, error handling, memory                                                                         |
| **Principal DevOps Engineer**     | GitHub API, GitHub Actions workflows   | Env vars, secrets, scaling, monitoring, CI/CD                                                                      |
| **Principal SRE**                 | Production systems, Kubernetes, Docker | Scalability, metrics, stability, performance                                                                       |
| **Boring Tech Writer**            | User-facing changes                    | README clarity, usage instructions, JSDoc, comments                                                                |

**Verify examples** (Phase 3 draft template, Implementation Steps):

1. [ ] [Action] in `path/to/file.ts`
   - verify: `bun test path/to/file.test.ts` passes
2. [ ] [Action] in `path/to/file.ts`
   - verify: CLI prints the new flag in `--help` output

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Render the same kind of reference the same way everywhere:

- File names / paths — link to the file when a URL or repo-relative path is derivable, e.g. `[pr:review/SKILL.md](<repo-blob-url>/claude-plugins/autopilot/skills/pr:review/SKILL.md)`; when no target is derivable, a backticked specimen like `reviewOutput.ts` is fine.
- Section references — ALWAYS a link to the doc anchor, e.g. `[§1.5](<doc-url>#15-context-map)`; never leave a section reference bare.
- Doc names — link the doc you reference, e.g. `[CLAUDE.md](<repo-blob-url>/CLAUDE.md)`, `[README.md](<repo-blob-url>/README.md)`.
- Code identifiers that are not file names (functions, types, vars) — backticks, e.g. `buildReviewComments`.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; if you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
