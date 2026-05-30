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

Continue implementation planning using NodeJS+React-specific configuration. Phase 0 context (issue data, branch info, TODO matches) is available from the conversation history.

Execute the shared **Stack Pipeline (Phases 1–6)** defined in `plan/SKILL.md` — Task Discovery, then Phase 1 through Phase 6 in order — supplying the three NodeJS+React deltas below wherever the pipeline references your stack's delta.

## Stack Deltas

**Example libraries** (Phase 1, Documentation Lookup): `react`, `next`, `@tanstack/react-query`

**Expert table** (Phase 4, Dynamic Expert Review) — always include the Pre-mortem Analyst, then select 2-3 additional experts based on task scope:

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

**Verify examples** (Phase 3 draft template, Implementation Steps):

1. [ ] [Action] in `path/to/file.ts`
   - verify: `vitest run path/to/file.test.ts` passes
2. [ ] [Action] in `path/to/file.ts`
   - verify: rendered component shows the new label in the page
