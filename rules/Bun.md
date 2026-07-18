---
alwaysApply: true
---

<!--
Source: https://github.com/awinogradov/code-assistants/blob/main/rules/Bun.md
This file is distributed to downstream repositories by an automated sync.
Edits made downstream are overwritten on the next run.
To change it, open a pull request against the source file above.
-->

# Bun Project Rules

## Mandatory Context

Before making any changes:

1. Read the root `README.md` — its Documentation section lists every doc in reading order, as a Markdown table (or an equivalent linked list), each with a link and a description
2. Inspect all file names under `docs/` and subfolders in the current repository — some files may be missing from the README
3. Read files that appear relevant to the current task
4. Treat `docs/` as the source of truth for project-specific conventions and follow those documents over this file when they conflict
5. When an `rfc/` folder exists, treat its Accepted RFCs as binding versioned standards — follow them over `docs/` and this file when they conflict; see `rfc/README.md` for the convention
6. When a `principles/` folder exists, read its `README.md` and the principles relevant to the task — they are the long-lived values that standards and reviews appeal to; follow `rfc/` and `docs/` over them for concrete rules

**Rule Markers Legend:**

- 🤖 = Automated by linter (ESLint/Stylelint enforces this)
- 👤 = Human-enforced (requires manual review)

## 1. Core Principles

- 👤 Context first: Gather complete understanding before changes
- 👤 Pattern matching: Check existing codebase for similar implementations
- 👤 Progressive enhancement: Build incrementally, test frequently
- 👤 Functional/declarative patterns; avoid classes
- 👤 Keep dependencies minimal - prefer built-in features
- 👤 Every line of code must be used or removed
- 👤 The fewer lines of code the better
- 👤 Avoid code duplication - maximize reuse
- 👤 Do not over-engineer - only make directly requested changes. No abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite
- 👤 Surface assumptions and ambiguities before coding; if multiple interpretations exist, present them - don't pick silently
- 👤 Define verifiable success criteria before implementing (test, command, or observable behavior)
- 👤 Every changed line must trace to the request - no opportunistic refactors of adjacent code or unrelated formatting
- 👤 When deleting unused code, only remove orphans your changes created; mention pre-existing dead code instead of deleting it
- 👤 Be consistent with existing code style
- 👤 Do not remove existing code/comments unless necessary
- 👤 Write plan before changes, not report after

## 2. Architecture

### 2.1 Technology Stack

- Bun, TypeScript 6.x
- ESLint for linting
- Prettier for formatting

### 2.2 Directory Layout

- `scripts/` - Scripts

## 3. Project Structure

### 3.1 File Organization

```
example.ts     # single module: a file, no directory

example/       # multiple modules: a directory, no index.ts barrel
├── example.ts
├── example.test.ts
├── example.types.ts
└── example.module.css
```

### 3.2 Import Rules

- 🤖 Always import from actual files - never barrel files (`import/order`)
- 🤖 Import order: builtin → external → internal → parent → sibling
- 👤 No generic names (index.ts, init.ts) - use descriptive names

## 4. Naming Conventions

- 🤖 Variables/functions: camelCase (`@typescript-eslint/naming-convention`)
- 🤖 Components/types/interfaces: PascalCase
- 🤖 No I prefix for interfaces
- 👤 Files: Components PascalCase, utilities camelCase
- 👤 Test files: `*.test.ts` suffix
- 🤖 Named exports only - no default exports (`import/no-default-export`)
- 👤 IMPORTANT: camelCase for constants (not SCREAMING_SNAKE_CASE)
- 👤 Descriptive names with auxiliary verbs (isLoading, hasError)

## 5. Development Setup

- Bun 1.x (latest stable)
- `bun install` – Install dependencies
- `bun run` – Run script
- `bun run lint` / `bun run lint:fix` – Linting
- `bun run format` / `bun run format:check` – Formatting
- `bun run typecheck` – Type checking
- `bun test` – Run tests

## 6. Common Standards

### 6.1 JavaScript

- 👤 Use async/await, not callbacks
- 🤖 Use template literals for string interpolation, not concatenation (`prefer-template`)
- 🤖 Use `Object.hasOwn()` instead of `hasOwnProperty()` (`prefer-object-has-own`)
- 👤 Use `for...of` for array iteration, avoid classical `for` loops
- 👤 Write pure functions - same input returns same output, no side effects
- 👤 Prefer immutable array methods (map, filter, spread) over mutating (push, splice)
- 🤖 Use destructuring to extract object/array values (`prefer-destructuring`)
- 🤖 Use strict equality `===` and `!==`, never `==` or `!=` (`eqeqeq`)
- 🤖 Never mutate function parameters (`no-param-reassign`)
- 🤖 Always throw Error objects, not primitives (`no-throw-literal`)
- 🤖 Always reject Promises with Error objects (`prefer-promise-reject-errors`)
- 🤖 Use rest params `...args` instead of `arguments` (`prefer-rest-params`)
- 🤖 Limit nesting depth to 2 levels max (`max-depth`)
- 🤖 Limit cyclomatic complexity - few conditional branches (`complexity`)
- 🤖 Use early returns (fail fast) instead of nested else (`no-else-return`)
- 🤖 Functions should be 100 lines max (`max-lines-per-function`)

### 6.2 TypeScript

- 🤖 Prefer interfaces over types (`@typescript-eslint/consistent-type-definitions`)
- 👤 Avoid enums; use const assertions
- 🤖 Never use @ts-ignore (`@typescript-eslint/ban-ts-comment`)
- 👤 No type assertions without runtime validation (use Zod)
- 👤 Return specific types, not generic (string → KnownCallOutcome)
- 👤 Use type guards for narrowing
- 👤 Use React.ComponentProps for extending props
- 👤 Ask user for type information when `any` is unavoidable

### 6.3 Bun

- 👤 Use ES6 imports, not CommonJS
- 🤖 Use fs/promises for file operations (`n/prefer-promises/fs`)
- 👤 Graceful shutdown with signal handlers
- 👤 Validate env variables at startup
- 🤖 Use `bun:` protocol prefix for built-in modules (`unicorn/prefer-node-protocol`)
- 👤 Extend Error class for custom errors with context properties
- 👤 Await promises before returning for complete stack traces
- 👤 Subscribe to 'error' events on EventEmitters and streams

### 8.4 File Operations

- 👤 Use `bun:fs/promises` for files < 100MB
- 👤 Use streams for files > 100MB
- 👤 Use `pipeline()` for stream chaining
- 👤 Use `import.meta.dirname` for module-relative paths
- 👤 Handle error codes: ENOENT, EACCES, etc.
- 👤 Always close file handles in finally blocks

## 9. API Standards

### 9.2 Zod

- 👤 Schemas in scripts/schemas/ by domain
- 👤 Use .merge(), .partial(), .pick(), .omit()
- 👤 Use z.infer<> for types
- 👤 Add custom error messages
- 👤 Use .transform() for normalization
- 👤 Use .refine() for complex validation

## 11. Documentation

### 11.1 JSDoc

- 👤 Every exported interface/type must have JSDoc
- 👤 File-level JSDoc for src/config/ modules
- 👤 Use @example where usage isn't obvious
- 👤 Use @see <link> to add links to documentation
- 👤 Focus on "why" and "how to use", not "what"
- 👤 No useless descriptions repeating function name
- 👤 Skip JSDoc only if no params AND obvious from name
- 👤 Use @deprecated <reason> to mark deprecated code
- 👤 All modules must have top level JSDoc with description and usage examples

### 11.2 Code comments

- 👤 Avoid obvious comments, only when necessary
- 👤 Avoid link to exact lines of code
- 👤 Focus on "why" and "how to use", not "what"
- 👤 Avoid duplicates comments — it means code must be refactored
- 👤 Use only `TODO` (planned improvement) or `FIXME` (known defect) for deferred work — no XXX/HACK/NOTE markers
- 👤 Format: `// TODO: <description>` / `// FIXME: <description>` — uppercase keyword, colon + single space
- 👤 Link every TODO/FIXME with `// @see <issue-url>` on the line immediately below — full issue URL, not a bare `#123` in the description
- 👤 Remove the TODO and its `@see` line when the linked issue closes
- 👤 Use `Skill(autopilot:todo-cleanup)` to create, link, and clean up TODO issues. If the autopilot plugin is not installed, follow CONTRIBUTING.md

### 11.3 docs/ structure

- 👤 Organize `docs/` as numbered chapters in reading order (`NN-topic.md`, plus `appendix-X-topic.md` for non-sequential references), matching the README Documentation order

## 12. Performance

- 👤 O(1) lookups: Use Object/Map, not Array.find()
- 👤 Avoid map/reduce/for combinations
- 👤 Pre-compute lookups, not in render
- 👤 Memoize data transformations creating objects/arrays
- 👤 Use React.memo with displayName for stable-prop components
- 👤 Use factory functions for handlers with parameters
- 👤 Profile with React DevTools before adding useMemo/useCallback

## 13. Security

- 👤 Validate all external input before processing
- 👤 Never trust user data in object operations
- 👤 Use crypto.timingSafeEqual() for secret comparison
- 👤 Never log or expose secrets, tokens, or PII (logs, error messages, API responses)
- 👤 Use exact versions in package.json (no ^ or ~)
- 👤 Never enable debug inspector in production
- 👤 Never pass untrusted data to Object.assign()
- 👤 Use Object.create(null) for user-provided keys
- 👤 Use bun ci in CI/CD, not bun install
- 👤 Run bun audit before deploying
- 🤖 Never use eval() or Function() constructor (`no-eval`)
- 👤 Avoid dynamic require()/import() with user-controlled paths

## 14. Anti-Patterns

- 🤖 No CommonJS require() - use ES6 imports
- 👤 No callback-based APIs - use Promise-based
- 🤖 No sync file operations in servers (`n/no-sync`)
- 👤 No direct process.exit() - use graceful shutdown
- 👤 No TailwindCSS/CSS-in-JS - use CSS Modules
- 👤 No barrel files (index.ts re-exports)
- 👤 No unused exports - delete immediately
- 👤 No commented-out code - delete it (recover from version control if needed)
- 👤 No empty catch blocks - never swallow errors; rethrow or handle with context
- 👤 No wrapper functions without added logic
- 👤 No Array.find() for lookups - use Map/Object
- 👤 No useEffect for state sync
- 👤 No inline functions in loops
- 👤 No incomplete configurations
- 👤 No raw `git commit` — use `Skill(autopilot:commits:create)`
- 👤 No raw `git checkout -b` / `git branch` — use `Skill(autopilot:branch:create)`
- 👤 No raw `gh pr create` — use `Skill(autopilot:pr:create)`
- 👤 No raw `gh issue create` — use `Skill(autopilot:issue:create)`

## 15. Git Workflow

- 👤 **MANDATORY**: `CONTRIBUTING.md` in the repository root is the binding standard for every branch, commit, PR, and issue operation — read the governing section before acting; never restate or improvise its rules
- 👤 Governing sections: "Branches" for branch names, "Commits" for commit messages, "PR Title" and "Special PR Prefixes" for PR titles, "PR Description" and "Magic Words" for PR bodies and issue linking, "How to Contribute" for issues
- 👤 The `Skill(autopilot:*)` commands in §16.1 implement these conventions — invoking the skill satisfies this section
- 👤 Never bypass validation hooks with `--no-verify` — fix the violation instead

## 16. AI Assistant Workflow

### 16.1 Claude Code

- 👤 Use TodoWrite to track complex tasks
- 👤 Mark todos as completed immediately
- 👤 Parallel tool execution when possible
- 👤 Gather context before editing
- 👤 Use `gh` CLI for GitHub issues, PRs, comments, and Actions info
- 👤 **MANDATORY**: Commit only via `Skill(autopilot:commits:create)` — no raw `git commit`, no `git commit -m`, no `--amend`, no exceptions. If the autopilot plugin is not installed, follow CONTRIBUTING.md
- 👤 **MANDATORY**: Create branches only via `Skill(autopilot:branch:create)` — no raw `git checkout -b`, `git branch`, or `git switch -c`. If the autopilot plugin is not installed, follow CONTRIBUTING.md
- 👤 **MANDATORY**: Create PRs only via `Skill(autopilot:pr:create)` — no raw `gh pr create` or web-UI PR creation. If the autopilot plugin is not installed, follow CONTRIBUTING.md
- 👤 **MANDATORY**: Create issues only via `Skill(autopilot:issue:create)` — no raw `gh issue create` or web-UI issue creation. If the autopilot plugin is not installed, follow CONTRIBUTING.md

### 16.2 MCP Servers

Prefer the project-registered MCP servers declared in the repo's own `.mcp.json`. The repository README and `docs/` are the authoritative list of which servers are registered and when to reach for each — consult them before hand-rolling work a registered server handles.

- 👤 **Documentation servers** (context7, Ref, Exa) — look up docs for any technology, framework, or API (global/user servers, not project-registered)
- 👤 **Repomix MCP server** — pack the codebase into one digest and grep/read it for codebase-wide analysis instead of loading every file

## 17. Code Review

- All rules from CLAUDE.md must be applied to the code review
