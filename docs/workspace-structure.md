# Workspace structure

Where new actions, packages, and apps go in this repository, and how each kind plugs into the Bun workspace, `tsconfig.json`, `action.yml`, and the Turbo task graph.

## Overview

This repo is a single Bun workspace (`bun@1`). Workspace members live in two places today: composite GitHub Actions under `.github/actions/<name>/` and shared libraries under `packages/<name>/`. Standalone apps (CLIs, services) are reserved for a future iteration.

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
- `src/` — all helpers, tests, and (eventually) entry files
- `README.md`

**Target rule:** every `.ts` file should live under `src/`. Today two actions still have a root entry file (`files-sync.ts`, `agents-rules-sync.ts`) invoked directly by `action.yml`. That is the current state, not a violation — see [Current vs. target](#current-vs-target).

Worked examples:

| Action                                                         | Layout              | Entry invoked from `action.yml`                  |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------ |
| [`files-sync`](../.github/actions/files-sync/)                 | root entry + `src/` | `${{ github.action_path }}/files-sync.ts`        |
| [`agents-rules-sync`](../.github/actions/agents-rules-sync/)   | root entry + `src/` | `${{ github.action_path }}/agents-rules-sync.ts` |
| [`release-action`](../.github/actions/release-action/)         | `src/`-only         | `${{ github.action_path }}/src/<entry>.ts`       |
| [`code-review-action`](../.github/actions/code-review-action/) | `src/`-only         | `${{ github.action_path }}/src/<entry>.ts`       |

Required `package.json` scripts: `typecheck`, `test`, `clean`. Turbo reads them per-package.

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
└── src/
    └── <module>.ts       # one file per exported module
```

No `.ts` files at the package root.

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

Required scripts: `typecheck`, `clean`. The `test` script is optional — add it only when the package has test files (`actions-core` today has none).

**Extract vs. duplicate:** extract into a package when two or more actions need the same helper. Duplicate when it's used in only one place.

Worked example: [`actions-core`](../packages/actions-core/) (single export `fetchRawContent`).

## Apps

No `apps/` directory exists yet. Location and naming convention will be decided in a follow-up issue when the first app lands.

## Run and test a new member

From the repo root:

```bash
bun install              # refresh the lockfile after editing workspaces
bun run typecheck        # runs the `typecheck` task across the workspace via Turbo
bun test                 # runs the `test` task in packages that declare it
```

Turbo handles per-package execution and caching. You don't need to `cd` into the member.

## Cross-cutting

### The `agents` field

The root `package.json` declares the repo's stack via a top-level `agents` object — see [`docs/agents-field.md`](./agents-field.md) for the contract. This repo sets:

```json
{
  "agents": {
    "rules": "Bun",
    "language": "typescript"
  }
}
```

### Turbo task graph

`turbo.json` defines three tasks: `typecheck`, `test`, `clean`. Each task's `inputs` glob covers `action.yml`, `*.ts`, `src/**/*.ts`, `tsconfig.json`, and `package.json`. Tasks run only in workspace members that declare the matching `package.json` script — there is no global config to update when you add a new member.

### CLAUDE.md §3.1 file organization

- Single module → flat file (`foo.ts`).
- Multiple related files → directory with NO `index.ts` (`foo/foo.ts`, `foo/foo.test.ts`, `foo/foo.types.ts`).

These rules are inherited from CLAUDE.md (a symlink to `rules/Bun.md`); not duplicated here.

### Registering a new member

For TypeScript actions and packages:

1. Add the directory path to root `package.json` `workspaces`, then run `bun install` from the repo root to refresh the lockfile.
2. Create the directory layout described above.
3. Add a row to root `README.md` under the appropriate section (`## GitHub Actions` for actions, `## Repository docs` for docs, etc.).

For YAML composite actions:

1. Create the directory with just `action.yml` + `README.md`.
2. Add a row to root `README.md` under `## GitHub Actions`.
3. Skip the `workspaces` entry — YAML composite actions are not workspace members.

No CI matrix entry, no release-workflow registration, no extra `turbo.json` config is required today.

## Current vs. target

As of 2026-05-23.

| Rule                                                      | State                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| All `.ts` under `src/`                                    | Target — `files-sync` and `agents-rules-sync` still have root entries |
| Package name `@code-assistants/<name>-action` for actions | Current                                                               |
| Package name `@code-assistants/<name>` for packages       | Current                                                               |
| `test` script in every TS workspace member                | N/A — `actions-core` has none by design                               |
| `apps/` directory                                         | Target — no apps exist yet                                            |
