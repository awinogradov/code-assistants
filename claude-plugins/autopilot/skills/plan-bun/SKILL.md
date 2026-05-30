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
