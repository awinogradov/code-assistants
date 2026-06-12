# Workspace structure

> Chapter 1 of the [repository docs](../README.md#repository-docs).

Where new actions, packages, and apps go in this repository, and how each kind plugs into the Bun workspace, `tsconfig.json`, `action.yml`, and the Turbo task graph.

## Overview

This repo is a single Bun workspace (`bun@1`). Workspace members live in three places today: composite GitHub Actions under `.github/actions/<name>/`, shared libraries under `packages/<name>/`, and Claude Code plugins under `claude-plugins/<name>/`. Standalone apps (CLIs, services) are reserved for a future iteration.

The top-level layout — illustrative, not exhaustive:

```text
code-assistants/
├── .github/
│   ├── actions/          # composite GitHub Actions (workspace members + YAML-only)
│   └── workflows/
├── claude-plugins/       # Claude Code plugins
├── docs/                 # repository docs (you are here)
├── packages/             # shared TypeScript libraries (workspace members)
├── rules/                # stack-specific rule sets surfaced via CLAUDE.md
├── scripts/              # repo-root scripts
├── CLAUDE.md             # symlink → rules/Bun.md
├── package.json          # root manifest, defines `workspaces` and `agents`
└── turbo.json            # task graph (typecheck, test, clean)
```

Read this doc top to bottom on your first day. After that, the [Current vs. target](#current-vs-target) table is the fastest way to check what's settled and what's still in motion.

## Actions

Composite GitHub Actions live under `.github/actions/<name>/`. They come in two flavors. Both are valid — pick the one that matches the work.

### TypeScript action

A composite action that runs Bun-executed TypeScript. It IS a Bun workspace member.

Directory contents:

- `action.yml` — composite step definitions, invokes the entry via `${{ github.action_path }}/<entry-path>`
- `package.json` — workspace member, package name `@code-assistants/<name>-action`
- `tsconfig.json` — includes `src/**/*.ts`
- `src/` — all source code (helpers, tests, and entry files)
- `README.md`
- Optional: `docs/`, `CLAUDE.md`, `AGENTS.md` (see [Per-member docs and agent files](#per-member-docs-and-agent-files))
- Optional: tool config files with a `.ts`/`.mjs` extension (e.g., `vitest.config.ts`) — configs live at the root, not under `src/`

**Target rule:** every `.ts` source file (entries, helpers, tests) should live under `src/`. Tool config files keyed by extension (`*.config.ts`, `*.config.mjs`) are exempt and remain at the root. Today two actions still have a root entry file (`files-sync.ts`, `agents-rules-sync.ts`) invoked directly by `action.yml` — that is the current state for source code, not a violation; see [Current vs. target](#current-vs-target).

Worked examples:

| Action                                                         | Layout              | Entry invoked from `action.yml`                    |
| -------------------------------------------------------------- | ------------------- | -------------------------------------------------- |
| [`files-sync`](../.github/actions/files-sync/)                 | root entry + `src/` | `${{ github.action_path }}/files-sync.ts`          |
| [`agents-rules-sync`](../.github/actions/agents-rules-sync/)   | root entry + `src/` | `${{ github.action_path }}/agents-rules-sync.ts`   |
| [`release-action`](../.github/actions/release-action/)         | `src/`-only         | `${{ github.action_path }}/src/<entry>.ts`         |
| [`release-automerge`](../.github/actions/release-automerge/)   | `src/`-only         | `${{ github.action_path }}/src/automerge.ts`       |
| [`code-review-action`](../.github/actions/code-review-action/) | `src/`-only         | `${{ github.action_path }}/src/<entry>.ts`         |
| [`auto-label`](../.github/actions/auto-label/)                 | `src/`-only         | `${{ github.action_path }}/src/autoLabel.ts`       |
| [`validate-actions`](../.github/actions/validate-actions/)     | `src/`-only         | `${{ github.action_path }}/src/validateActions.ts` |

Required `package.json` scripts: see [Workspace scripts](#workspace-scripts).

### YAML composite action

A composite action that only stitches together existing third-party steps — no TypeScript, no `package.json`, no `tsconfig.json`. NOT a workspace member.

Directory contents:

- `action.yml`
- `README.md`

Worked examples: [`contributing-check`](../.github/actions/contributing-check/), [`contributing-sync`](../.github/actions/contributing-sync/).

Use this flavor when the action only composes other actions (no logic of your own). Otherwise pick the TypeScript flavor.

## Packages

Shared libraries reused by actions or other packages. NOT consumed standalone. Always a Bun workspace member.

Directory layout (`packages/<name>/`):

```text
packages/<name>/
├── package.json          # workspace name `@code-assistants/<name>` (no -action suffix)
├── tsconfig.json
├── README.md             # optional
├── docs/                 # optional (see Per-member docs and agent files)
├── CLAUDE.md             # optional
├── AGENTS.md             # optional
└── src/
    └── <module>.ts       # one file per exported module
```

Source code (entries, helpers, tests) lives under `src/`, never at the package root. Tool config files with a `.ts`/`.mjs` extension (e.g., `vitest.config.ts`) are the exception — like at the repo root (`lint-staged.config.ts`, `prettier.config.ts`), configs stay at the package root and are not imported as modules.

`package.json` `exports` field maps the public surface — one entry per `src/` module:

```json
{
  "name": "@code-assistants/<name>",
  "exports": {
    "./<module>": "./src/<module>.ts"
  }
}
```

Consumers import per-module (copy-pasted from `.github/actions/files-sync/src/changeDetector.ts`):

```ts
import { fetchRawContent } from "@code-assistants/actions-core/fetchRawContent";
```

Required scripts: see [Workspace scripts](#workspace-scripts) (`test` is opt-in for packages — add it only when test files exist).

**Extract vs. duplicate:** extract into a package when two or more actions need the same helper. Duplicate when it's used in only one place.

Worked example: [`actions-core`](../packages/actions-core/) (four exports: `fetchRawContent`, `checkStatus`, `parseRepo`, `releaseField`).

## Apps

No `apps/` directory exists yet. Location and naming convention will be decided in a follow-up issue when the first app lands.

## Run and test a new member

From the repo root:

```bash
bun install              # refresh the lockfile after editing workspaces
bun run typecheck        # runs the `typecheck` task across the workspace via Turbo
bun run test             # runs the `test` task across the workspace via Turbo
```

Use `bun run test`, not `bun test` — the root `package.json` maps `test` to `turbo run test` (`bun test` is Bun's own test runner and does not dispatch workspace scripts; it exits with "No tests found" when invoked at the repo root).

Turbo handles per-package execution and caching. You don't need to `cd` into the member.

## Cross-cutting

### The `agents` field

The root `package.json` declares the repo's stack via a top-level `agents` object — see [`docs/02-agents-field.md`](./02-agents-field.md) for the contract. This repo sets:

```json
{
  "agents": {
    "rules": "Bun",
    "language": "typescript"
  }
}
```

### The `release` field

A workspace member's `package.json` declares its release config via a top-level `release` object — see [`docs/06-release-field.md`](./06-release-field.md) for the contract. Consumed by [`release-action`](../.github/actions/release-action/README.md) to pick the version source, npm-publish step, major-version tag, and the optional Slack notification channel. The repo-root `package.json` may also declare `release.members` to opt specific workspace paths into monorepo mode — see [`docs/06-release-field.md`](./06-release-field.md#monorepo-root) and the [release-action monorepo section](../.github/actions/release-action/README.md#monorepo-mode). Example for a Node.js library member:

```json
{
  "name": "@org/ingest",
  "release": {
    "type": "lib-nodejs",
    "slack": "#releases"
  }
}
```

### Workspace scripts

Every TypeScript workspace member (actions and packages) declares its scripts in its own `package.json`. Turbo discovers them per-package — there is no central script registry to update when you add a member.

| Script      | Required?                            | Command (today)              | Notes                                                                                                                                                                                            |
| ----------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typecheck` | Yes                                  | `tsc --noEmit`               | Runs in Turbo's `typecheck` task. Always present in TS members.                                                                                                                                  |
| `test`      | Yes for actions, opt-in for packages | `bun test`                   | Bun's runner handles unit, integration, and e2e tests in the same invocation — test files live alongside source under `src/` per CLAUDE.md §3.1. Add this script only when the member has tests. |
| `clean`     | Yes                                  | `rm -rf node_modules .turbo` | Removes per-member install and Turbo caches.                                                                                                                                                     |
| `build`     | Optional                             | (none today)                 | Add only when the member produces a compiled output. Today every member runs TypeScript directly via Bun (`bun <entry>.ts`), so no build step is needed.                                         |

**Other script names** (`lint`, `format`, `validate`, `prepare`) are root-only: they live in the root `package.json` and operate across the whole repo (Prettier, the `scripts/validate-plugins.ts` check, Husky setup). Do NOT duplicate them at the member level.

Specialised script types as the project grows — e.g., `test:unit`, `test:integration`, `test:e2e`, `bench`, `start` — should be added per-member only when there is a reason to run them in isolation (the default `bun test` already covers everything under `src/`). Mirror the Turbo task graph if you add a name that should be cache-aware.

### Turbo task graph

`turbo.json` defines three tasks. Each task runs only in workspace members that declare the matching `package.json` script — there is no global config to update when you add a new member.

| Task        | `inputs`                                                                 | Cached?             |
| ----------- | ------------------------------------------------------------------------ | ------------------- |
| `typecheck` | `action.yml`, `*.ts`, `src/**/*.ts`, `tsconfig.json`, `package.json`     | Yes                 |
| `test`      | `*.ts`, `src/**/*.ts`, `tsconfig.json`, `package.json` (no `action.yml`) | Yes                 |
| `clean`     | _none_                                                                   | No (`cache: false`) |

`action.yml` is intentionally excluded from `test` inputs — changes to action metadata invalidate `typecheck` but not the test cache. If you add a task that needs cache-aware action-metadata sensitivity, include `action.yml` in its `inputs`.

### Per-member docs and agent files

Any action or package directory (TypeScript action, YAML composite action, or package) MAY include:

- `docs/` — a member-scoped docs directory for material too specific or too long for the README
- `CLAUDE.md` — agent rules that apply only inside that member's directory (Claude Code loads these in addition to the repo-root `CLAUDE.md`)
- `AGENTS.md` — optional, same scope as `CLAUDE.md` but consumed by other agent tooling

None of these are required. Use them when a member has enough surface area to need it; for small members a `README.md` alone is fine.

### CLAUDE.md §3.1 file organization

- Single module → flat file (`foo.ts`).
- Multiple related files → directory with NO `index.ts` (`foo/foo.ts`, `foo/foo.test.ts`, `foo/foo.types.ts`).

These rules are inherited from CLAUDE.md (a symlink to `rules/Bun.md`); not duplicated here.

### Registering a new member

For TypeScript actions and packages:

1. Create the directory layout described above.
2. Add the directory path to root `package.json` `workspaces`, then run `bun install` from the repo root to refresh the lockfile.
3. Add a row to root `README.md` under the appropriate section (`## GitHub Actions` for actions, `## Repository docs` for docs, etc.).

For YAML composite actions:

1. Create the directory with just `action.yml` + `README.md`.
2. Add a row to root `README.md` under `## GitHub Actions`.
3. Skip the `workspaces` entry — YAML composite actions are not workspace members.

No CI matrix entry, no release-workflow registration, no extra `turbo.json` config is required today.

## Current vs. target

As of 2026-06-12.

| Rule                                                      | State                                                                                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All source `.ts` (entries, helpers, tests) under `src/`   | Target — `files-sync` and `agents-rules-sync` still have root entries (configs like `*.config.ts` always stay at the root)                                                                                           |
| Package name `@code-assistants/<name>-action` for actions | Current — with two settled exceptions: directories already ending in `-action` keep their name as-is (`release-action`, `code-review-action`), and `release-automerge` is named `@code-assistants/release-automerge` |
| Package name `@code-assistants/<name>` for packages       | Current                                                                                                                                                                                                              |
| `test` script in every TS workspace member                | Current — every TS member, including `actions-core`, now has tests                                                                                                                                                   |
| `apps/` directory                                         | Target — no apps exist yet                                                                                                                                                                                           |
