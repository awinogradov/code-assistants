# Stack deltas

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md).

Planning is stack-agnostic except for two values. Resolve them once from `package.json` `agents.rules`, then use them wherever the [pipeline](pipeline.md) says "your stack's delta".

These deltas previously lived in two dedicated skills (`plan-bun`, `plan-nodejs-react`), which cost a full skill load and round trip to deliver two values — and drifted, because each caller kept its own routing table. A table cannot drift from itself.

## Routing

| `agents.rules`          | Delta set                    |
| ----------------------- | ---------------------------- |
| `Bun`                   | [Bun](#bun)                  |
| `Bun+React+Tailwind`    | [Bun](#bun)                  |
| `NodeJS+React`          | [NodeJS+React](#nodejsreact) |
| `NodeJS+React+Tailwind` | [NodeJS+React](#nodejsreact) |

When `package.json` is missing, has no `agents` field, or carries an unrecognized `agents.rules`, ask via AskUserQuestion (header "Stack"): the stack could not be detected from `package.json` `agents.rules` — which one should planning use? The choice set is exactly the four `agents.rules` values from the routing table above, offered by name; selecting one routes to its delta set as if it had been detected:

- **Bun** — Bun/NodeJS TypeScript project (CSS Modules): use the [Bun](#bun) deltas.
- **Bun+React+Tailwind** — Bun + React + Tailwind frontend: use the [Bun](#bun) deltas.
- **NodeJS+React** — Node.js + React (CSS Modules): use the [NodeJS+React](#nodejsreact) deltas.
- **NodeJS+React+Tailwind** — Node.js + React + Tailwind frontend: use the [NodeJS+React](#nodejsreact) deltas.

**Formatting Note:** Read [`askuserquestion-format.md`](../../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

## Bun

**Example libraries** (documentation lookup): `zod`, `hono`, `@effect/schema`

**Verify examples** for the draft template's Implementation Steps:

1. [Action] in `path/to/file.ts`
   - verify: `bun test path/to/file.test.ts` passes
2. [Action] in `path/to/file.ts`
   - verify: CLI prints the new flag in `--help` output

## NodeJS+React

**Example libraries** (documentation lookup): `react`, `next`, `@tanstack/react-query`

**Verify examples** for the draft template's Implementation Steps:

1. [Action] in `path/to/file.ts`
   - verify: `vitest run path/to/file.test.ts` passes
2. [Action] in `path/to/file.ts`
   - verify: rendered component shows the new label in the page
