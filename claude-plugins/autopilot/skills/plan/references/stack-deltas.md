# Stack deltas

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md).

Planning is stack-agnostic except for three values. Resolve them once from `package.json` `agents.rules`, then use them wherever the [pipeline](pipeline.md) says "your stack's delta".

These deltas previously lived in two dedicated skills (`plan-bun`, `plan-nodejs-react`), which cost a full skill load and round trip to deliver three values — and drifted, because each caller kept its own routing table. A table cannot drift from itself.

## Routing

| `agents.rules`          | Delta set                    |
| ----------------------- | ---------------------------- |
| `Bun`                   | [Bun](#bun)                  |
| `Bun+React+Tailwind`    | [Bun](#bun)                  |
| `NodeJS+React`          | [NodeJS+React](#nodejsreact) |
| `NodeJS+React+Tailwind` | [NodeJS+React](#nodejsreact) |

When `package.json` is missing, has no `agents` field, or carries an unrecognized `agents.rules`, ask via AskUserQuestion:

- `question`: "Could not detect tech stack from package.json agents.rules. Which stack should be used for planning?"
- `header`: "Stack"
- `options`: [
  { label: "Bun", description: "Bun/NodeJS TypeScript projects (CSS Modules)" },
  { label: "Bun+React+Tailwind", description: "Bun + React + Tailwind frontend" },
  { label: "NodeJS+React", description: "Node.js + React (CSS Modules)" },
  { label: "NodeJS+React+Tailwind", description: "Node.js + React + Tailwind frontend" }
  ]
- `multiSelect`: false

**Formatting Note:** Read [`askuserquestion-format.md`](../../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

## Bun

**Example libraries** (documentation lookup): `zod`, `hono`, `@effect/schema`

**Expert table** — always include the Pre-mortem Analyst, then 2-3 more by task scope:

| Expert                            | When to Include                        | Focus Areas                                                                                                        |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Pre-mortem Analyst**            | Always (default reviewer)              | Imagine the plan failed 6 months from now — return ranked failure narratives, early warning signs, and mitigations |
| **Principal Bun/NodeJS Engineer** | Server-side logic, APIs                | Performance, async, error handling, memory                                                                         |
| **Principal DevOps Engineer**     | GitHub API, GitHub Actions workflows   | Env vars, secrets, scaling, monitoring, CI/CD                                                                      |
| **Principal SRE**                 | Production systems, Kubernetes, Docker | Scalability, metrics, stability, performance                                                                       |
| **Boring Tech Writer**            | User-facing changes                    | README clarity, usage instructions, JSDoc, comments                                                                |

**Verify examples** for the draft template's Implementation Steps:

1. [ ] [Action] in `path/to/file.ts`
   - verify: `bun test path/to/file.test.ts` passes
2. [ ] [Action] in `path/to/file.ts`
   - verify: CLI prints the new flag in `--help` output

## NodeJS+React

**Example libraries** (documentation lookup): `react`, `next`, `@tanstack/react-query`

**Expert table** — always include the Pre-mortem Analyst, then 2-3 more by task scope:

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

**Verify examples** for the draft template's Implementation Steps:

1. [ ] [Action] in `path/to/file.ts`
   - verify: `vitest run path/to/file.test.ts` passes
2. [ ] [Action] in `path/to/file.ts`
   - verify: rendered component shows the new label in the page
