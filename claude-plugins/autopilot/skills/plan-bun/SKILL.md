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

These rules govern references — when you point the reader at a real file, standard, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Prefer stable references that never rot; render the same kind of reference the same way everywhere:

- Code identifiers and file names — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked specimen names the thing without a link that breaks when a file moves or a doc is restructured.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Other docs and sections — do NOT link a doc name or a section anchor; those rot the moment the doc is restructured. Inline a short gist of the point you need instead.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
