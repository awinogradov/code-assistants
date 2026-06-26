# The `agents` field

> Chapter 2 of the [repository docs](../README.md#repository-docs).

Autopilot skills detect a repository's tech stack and source language by reading a custom `agents` object from the repo-root `package.json`. This document specifies the field, its accepted values, and how each consuming skill uses it.

## Why it exists

Several Autopilot skills behave differently per stack — `/plan` delegates to a stack-specific planning skill, `/todo-cleanup` picks file globs and a verification command per language, `/pr:review` tags the review with stack context. Without a declared stack the skills fall back to an interactive prompt on every invocation. Declaring `agents` once turns that prompt into static configuration.

## Location

An object under the top-level key `agents` in a `package.json`:

```json
{
  "name": "my-app",
  "agents": {
    "rules": "Bun",
    "language": "typescript"
  }
}
```

The field coexists with normal npm metadata. It is not consumed by npm, Bun, or any package manager — only by Autopilot skills.

An optional `trackers` array (entries `{ type: "linear" | "github", ... }`; absent ⇒ a single `github` tracker) opts the project into one or more issue trackers — for example Linear for internal issues and GitHub for external feedback, or several `linear` teams sharing one repo; see [Linear tracker support](./11-linear-tracker.md).

### Workspaces

Consuming skills always read the **repository-root** `package.json` to detect stack and language; workspace members are not walked. Members may declare their own `agents` field anyway, and this repository does so on every workspace member to keep stack metadata visible at every module boundary — consistent with the per-member `docs/`, `CLAUDE.md`, and `AGENTS.md` convention recorded in `docs/01-workspace-structure.md`.

Rules for member declarations:

- The value should match the root unless the member genuinely uses a different stack or language.
- Members do not override the root for skill detection today; if a future consumer reads the nearest `package.json` instead, the member declaration takes effect automatically.
- A member may omit the field; nothing breaks because root still drives detection.

## Spec

```ts
type AgentsField = {
  rules: "Bun" | "Bun+React+Tailwind" | "NodeJS+React" | "NodeJS+React+Tailwind";
  language: "typescript" | "go";
};
```

Both keys are required for full coverage. Missing keys force the consuming skill into its fallback path (see [Fallback behavior](#fallback-behavior)).

### `rules`

Identifies the tech stack and points at a matching rule set under `rules/` in the marketplace repo. Recognized values:

| Value                   | Rule file                        | Used for                            |
| ----------------------- | -------------------------------- | ----------------------------------- |
| `Bun`                   | `rules/Bun.md`                   | Bun + TypeScript (CSS Modules)      |
| `Bun+React+Tailwind`    | `rules/Bun+React+Tailwind.md`    | Bun + React + Tailwind frontend     |
| `NodeJS+React`          | `rules/NodeJS+React.md`          | Node.js + React (CSS Modules)       |
| `NodeJS+React+Tailwind` | `rules/NodeJS+React+Tailwind.md` | Node.js + React + Tailwind frontend |

Any other value is treated as unrecognized.

The resolved rules file is published to `CLAUDE.md` by default. The [`agents-rules-sync`](../.github/actions/agents-rules-sync/README.md) action can additionally expose it as `AGENTS.md` via a Git symlink — see the [`agents-md`](../.github/actions/agents-rules-sync/README.md#inputs) input (default `false`). Opt in when the repo is also worked on by OpenAI/agents-compatible tooling that reads `AGENTS.md`: the symlink keeps both ecosystems on the same rules file with a single source of truth, so the two can never drift.

### `language`

Identifies the source language for code-level operations (scanning, comment syntax). Recognized values:

| Value        | File glob              | Comment prefix |
| ------------ | ---------------------- | -------------- |
| `typescript` | `**/*.{ts,tsx,js,jsx}` | `//`           |
| `go`         | `**/*.go`              | `//`           |

Only consumed by `/todo-cleanup` today.

## Consumers

The matrix below lists every skill that reads `agents`, the key(s) it reads, and what it does with the value. Line numbers point at the canonical detection block in each skill. `/plan` and `/run` additionally read `agents.trackers` to route a Linear `KEY-N` id to its team by key prefix — see [Linear tracker support](./11-linear-tracker.md#how-a-skill-resolves-the-provider). The `agents.trackers` array is validated by the [`agents-rules-sync`](../.github/actions/agents-rules-sync/README.md) action.

| Skill            | Reads                                                  | Behavior                                                                                                                                       | Source                                                                                          |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/plan`          | `agents.rules`                                         | Delegates to `Skill(autopilot:plan-bun)` or `Skill(autopilot:plan-nodejs-react)`                                                               | `claude-plugins/autopilot/skills/plan/SKILL.md` (Phase 1: Detect Stack and Delegate)            |
| `/run`           | `agents.rules`                                         | Same delegation as `/plan`, plus embedded post-implementation autopilot                                                                        | `claude-plugins/autopilot/skills/run/SKILL.md` (Phase 1: Detect Stack and Delegate)             |
| `/pr:review`     | `agents.rules`                                         | Tags the review with the stack identifier; falls back to `unknown` if missing                                                                  | `claude-plugins/autopilot/skills/pr:review/SKILL.md` (Phase 2.1: Detect Stack)                  |
| `/todo-cleanup`  | `agents.language` + `agents.rules` + `agents.trackers` | Picks file globs + comment syntax from `language`, verification command from `rules`; routes new-TODO issues to GitHub or a chosen Linear team | `claude-plugins/autopilot/skills/todo-cleanup/SKILL.md` (Phase 1: Read Repository Context)      |
| `/linear:create` | `agents.trackers`                                      | Files a Linear issue on the configured `team`; prompts to choose when 2+ `linear` trackers exist                                               | `claude-plugins/autopilot/skills/linear:create/SKILL.md` (Phase 0: Resolve Team and Hint)       |
| `/issue:run`     | `agents.trackers`                                      | Resolves the provider and Linear team; prompts to choose the team when 2+ `linear` trackers exist                                              | `claude-plugins/autopilot/skills/issue:run/SKILL.md` (Phase 0: Resolve Repository and Provider) |

### Stack → planning skill (used by `/plan` and `/run`)

| `rules` value           | Planning skill                       |
| ----------------------- | ------------------------------------ |
| `Bun`                   | `Skill(autopilot:plan-bun)`          |
| `Bun+React+Tailwind`    | `Skill(autopilot:plan-bun)`          |
| `NodeJS+React`          | `Skill(autopilot:plan-nodejs-react)` |
| `NodeJS+React+Tailwind` | `Skill(autopilot:plan-nodejs-react)` |

### Stack → verification command (used by `/todo-cleanup`)

| `rules` value  | Command                             |
| -------------- | ----------------------------------- |
| `Bun`          | `bun run typecheck && bun run lint` |
| `NodeJS+React` | `npm run typecheck && npm run lint` |
| Go (fallback)  | `go build ./... && go vet ./...`    |

## Detection algorithm

Each consuming skill follows the same shape:

1. Read `package.json` from the repository root.
2. Parse `agents.rules` (and `agents.language`, where applicable).
3. Map the value via the tables above.
4. If the file is missing, the `agents` object is missing, or the value is unrecognized → fall back.

Implementations may use `Read`, `jq`, or `grep_repomix_output` to read the file. The contract is the JSON path, not the access method.

## Fallback behavior

| Skill           | When detection fails                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/plan`, `/run` | `AskUserQuestion` with the four `rules` values as options; user's choice is used for the current invocation only — not written back to `package.json` |
| `/pr:review`    | Stack stored as `unknown`; the review proceeds without stack-specific tagging                                                                         |
| `/todo-cleanup` | Skill cannot proceed without `language`; the prompt asks the user to populate the field                                                               |

Fallbacks are intentionally non-destructive — no skill writes to `package.json` on its own.

## Examples

### Bun + TypeScript backend

```json
{
  "name": "ingest-service",
  "version": "1.4.0",
  "agents": {
    "rules": "Bun",
    "language": "typescript"
  }
}
```

`/plan` → `Skill(autopilot:plan-bun)`; `/todo-cleanup` scans `**/*.{ts,tsx,js,jsx}` and verifies via `bun run typecheck && bun run lint`.

### Node.js + React + Tailwind frontend

```json
{
  "name": "dashboard",
  "version": "0.9.2",
  "agents": {
    "rules": "NodeJS+React+Tailwind",
    "language": "typescript"
  }
}
```

`/plan` → `Skill(autopilot:plan-nodejs-react)`; `/todo-cleanup` verifies via `npm run typecheck && npm run lint`.

### Go service

```json
{
  "name": "edge-proxy",
  "agents": {
    "language": "go"
  }
}
```

`rules` is intentionally omitted — there is no Go entry in the `rules` table today. `/todo-cleanup` falls back to `go build ./... && go vet ./...`. `/plan` and `/run` will prompt for a stack choice.

## Extending

To add a new stack:

1. Add a rule file under `rules/<Name>.md`.
2. Add the value to the `rules` table in this document.
3. Update the stack-mapping tables inside the consumer skills:
   - `claude-plugins/autopilot/skills/plan/SKILL.md`
   - `claude-plugins/autopilot/skills/run/SKILL.md`
   - `claude-plugins/autopilot/skills/pr:review/SKILL.md`
   - `claude-plugins/autopilot/skills/todo-cleanup/SKILL.md`
4. If the stack needs its own planning phases, add a new `plan-<stack>` skill mirroring `plan-bun` / `plan-nodejs-react` and route to it from `/plan` and `/run`.

To add a new language: extend the language-to-pattern table in `claude-plugins/autopilot/skills/todo-cleanup/SKILL.md` and mirror the change here.
