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
2. Read the root `CONTRIBUTING.md` — the binding conventions for every branch, commit, PR, and issue operation
3. When a `principles/` folder exists, read its `README.md` and the principles relevant to the task — they are the long-lived values that standards and reviews appeal to; follow `rfc/` and `docs/` over them for concrete rules
4. When an `rfc/` folder exists, treat its Accepted RFCs as binding versioned standards — follow them over `docs/` and this file when they conflict; see `rfc/README.md` for the convention
5. Inspect all file names under `docs/` and subfolders in the current repository — some files may be missing from the README — read those relevant to the current task, and treat `docs/` as the source of truth for project-specific conventions, following those documents over this file when they conflict
6. Acquire codebase context from the first source that works, falling through to the next on any failure:
   - **Graphify** — fires when `graphify-out/graph.json` exists and the `graphify` CLI resolves on PATH. Run `graphify query "<question>"` first; use `graphify path "<A>" "<B>"` for relationships, `graphify explain "<concept>"` for focused concepts, and `graphify-out/wiki/index.md` for broad navigation. After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
   - **Repomix** — fires when the Repomix MCP server is connected. Attach the committed `.repomix/pack.xml` when it exists, otherwise pack the codebase; grep/read the digest for codebase-wide analysis instead of loading every file.
   - **Default tools** — with neither available, search and read the repository files directly.

## 1. Core Principles

- Context first: Gather complete understanding before changes
- Pattern matching: Check existing codebase for similar implementations
- Progressive enhancement: Build incrementally, test frequently
- Functional/declarative patterns; avoid classes
- Keep dependencies minimal - prefer built-in features
- Every line of code must be used or removed
- The fewer lines of code the better
- Avoid code duplication - maximize reuse
- Do not over-engineer - only make directly requested changes. No abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite
- Surface assumptions and ambiguities before coding; if multiple interpretations exist, present them - don't pick silently
- Define verifiable success criteria before implementing (test, command, or observable behavior)
- Every changed line must trace to the request - no opportunistic refactors of adjacent code or unrelated formatting
- When deleting unused code, only remove orphans your changes created; mention pre-existing dead code instead of deleting it
- Be consistent with existing code style
- Write failing tests first, then write code to pass tests
- Run tests after any code changes
- Do not remove existing code/comments unless necessary
- Write plan before changes, not report after

## 2. Architecture

### 2.1 Technology Stack

- Bun, TypeScript 6.x
- ESLint for linting
- Prettier for formatting

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

- Order code top-down by importance: public entry points and core domain logic first, lower-level helpers and utilities last

### 3.2 Import Rules

- Always import from actual files - never barrel files
- Import order: builtin → external → internal → parent → sibling
- No generic names (index.ts, init.ts) - use descriptive names

## 4. Naming Conventions

- Variables/functions: camelCase
- Components/types/interfaces: PascalCase
- No I prefix for interfaces
- Files: Components PascalCase, utilities camelCase
- Test files: `*.test.ts` suffix
- Named exports only - no default exports
- IMPORTANT: camelCase for constants (not SCREAMING_SNAKE_CASE)
- Descriptive names with auxiliary verbs (isLoading, hasError)

## 5. Development Setup

- Bun 1.x (latest stable)
- Inspect @package.json before assuming scripts or package-manager commands

## 6. Common Standards

### 6.1 JavaScript

- Use async/await, not callbacks
- Use template literals for string interpolation, not concatenation
- Use `Object.hasOwn()` instead of `hasOwnProperty()`
- Use `for...of` for array iteration, avoid classical `for` loops
- Write pure functions - same input returns same output, no side effects
- Prefer immutable array methods (map, filter, spread) over mutating (push, splice)
- Use destructuring to extract object/array values
- Use strict equality `===` and `!==`, never `==` or `!=`
- Never mutate function parameters
- Always throw Error objects, not primitives
- Always reject Promises with Error objects
- Use rest params `...args` instead of `arguments`
- Limit nesting depth to 2 levels max
- Limit cyclomatic complexity - few conditional branches
- Use early returns (fail fast) instead of nested else
- Functions should be 100 lines max

### 6.2 TypeScript

- Prefer interfaces over types
- Avoid enums; use const assertions
- Never use @ts-ignore
- No type assertions without runtime validation (use Zod)
- Return specific types, not generic (string → KnownCallOutcome)
- Use type guards for narrowing
- Ask user for type information when `any` is unavoidable

## 8. Server-Side Standards

### 8.1 Bun

- Use ES6 imports, not CommonJS
- Use fs/promises for file operations
- Graceful shutdown with signal handlers
- Validate env variables at startup
- Use `bun:` protocol prefix for built-in modules
- Extend Error class for custom errors with context properties
- Await promises before returning for complete stack traces
- Subscribe to 'error' events on EventEmitters and streams

### 8.4 File Operations

- Use `bun:fs/promises` for files < 100MB
- Use streams for files > 100MB
- Use `pipeline()` for stream chaining
- Use `import.meta.dirname` for module-relative paths
- Handle error codes: ENOENT, EACCES, etc.
- Always close file handles in finally blocks

## 9. API Standards

### 9.2 Zod

- Use .merge(), .partial(), .pick(), .omit()
- Use z.infer<> for types
- Add custom error messages
- Use .transform() for normalization
- Use .refine() for complex validation

## 11. Documentation

### 11.1 JSDoc

- Every exported interface/type must have JSDoc
- File-level JSDoc for config modules
- Use @example where usage isn't obvious
- Use @see <link> to add links to documentation
- Focus on "why" and "how to use", not "what"
- No useless descriptions repeating function name
- Skip JSDoc only if no params AND obvious from name
- Use @deprecated <reason> to mark deprecated code
- All modules must have top level JSDoc with description and usage examples

### 11.2 Code comments

- Avoid obvious comments, only when necessary
- Avoid link to exact lines of code
- Focus on "why" and "how to use", not "what"
- Avoid duplicates comments — it means code must be refactored
- Use only `TODO` (planned improvement) or `FIXME` (known defect) for deferred work — no XXX/HACK/NOTE markers
- Format: `// TODO: <description>` / `// FIXME: <description>` — uppercase keyword, colon + single space
- Link every TODO/FIXME with `// @see <issue-url>` on the line immediately below — full issue URL, not a bare `#123` in the description
- Remove the TODO and its `@see` line when the linked issue closes
- Use `Skill(autopilot:todo-cleanup)` to create, link, and clean up TODO issues. If the autopilot plugin is not installed, follow CONTRIBUTING.md

### 11.3 docs/ structure

- Organize `docs/` as numbered chapters in reading order (`NN-topic.md`, plus `appendix-X-topic.md` for non-sequential references), matching the README Documentation order

## 12. Performance

- O(1) lookups: Use Object/Map, not Array.find()
- Avoid map/reduce/for combinations
- Memoize data transformations creating objects/arrays
- Use factory functions for handlers with parameters

## 13. Security

- Validate all external input before processing
- Never trust user data in object operations
- Use crypto.timingSafeEqual() for secret comparison
- Never log or expose secrets, tokens, or PII (logs, error messages, API responses)
- Use exact versions in package.json (no ^ or ~)
- Never enable debug inspector in production
- Never pass untrusted data to Object.assign()
- Use Object.create(null) for user-provided keys
- Use lockfile-based installs in CI/CD (`bun install --frozen-lockfile`)
- Run bun audit before deploying
- Never use eval() or Function() constructor
- Avoid dynamic require()/import() with user-controlled paths

## 14. Anti-Patterns

- No CommonJS require() - use ES6 imports
- No callback-based APIs - use Promise-based
- No sync file operations in servers
- No direct process.exit() - use graceful shutdown
- No barrel files (index.ts re-exports)
- No unused exports - delete immediately
- No commented-out code - delete it (recover from version control if needed)
- No empty catch blocks - never swallow errors; rethrow or handle with context
- No wrapper functions without added logic
- No Array.find() for lookups - use Map/Object
- No inline functions in loops
- No incomplete configurations

## 15. Git Workflow

- **MANDATORY**: `CONTRIBUTING.md` in the repository root is the binding standard for every branch, commit, PR, and issue operation — read the governing section before acting; never restate or improvise its rules
- Governing sections: "Branches" for branch names, "Commits" for commit messages, "PR Title" and "Special PR Prefixes" for PR titles, "PR Description" and "Magic Words" for PR bodies and issue linking, "How to Contribute" for issues
- **MANDATORY**: With the autopilot plugin installed, perform these operations only through its skills — `Skill(autopilot:branch-create)` for branches, `Skill(autopilot:commits-create)` for commits, `Skill(autopilot:pr-create)` for pull requests, `Skill(autopilot:issue-create)` for issues, `Skill(autopilot:plan)` for implementation plans — never their raw `git`/`gh`/web-UI equivalents and never ad-hoc planning; invoking the skill satisfies this section. Without the plugin, follow CONTRIBUTING.md directly
- Never bypass validation hooks with `--no-verify` — fix the violation instead

## 16. AI Assistant Workflow

### 16.1 Claude Code

- Use TodoWrite to track complex tasks
- Mark todos as completed immediately
- Parallel tool execution when possible
- Gather context before editing
- Use sub-agents for search-heavy or parallelizable investigation to keep the main context focused
- Use `gh` CLI for GitHub issues, PRs, comments, and Actions info

### 16.2 MCP Servers

Prefer the project-registered MCP servers declared in the repo's own `.mcp.json`. The repository README and `docs/` are the authoritative list of which servers are registered and when to reach for each — consult them before hand-rolling work a registered server handles.

- **Documentation servers** (context7, Ref, Exa) — look up docs for any technology, framework, or API (global/user servers, not project-registered)

## 17. Code Review

- All rules from AGENTS.md must be applied to the code review
