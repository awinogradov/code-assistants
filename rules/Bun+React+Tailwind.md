---
alwaysApply: true
---

<!--
Source: https://github.com/awinogradov/code-assistants/blob/main/rules/Bun+React+Tailwind.md
This file is distributed to downstream repositories by an automated sync.
Edits made downstream are overwritten on the next run.
To change it, open a pull request against the source file above.
-->

# Bun + React + Tailwind Project Rules

## Mandatory Context

Before making any changes:

1. Read the root `README.md` — its Documentation section lists every doc in reading order, as a Markdown table (or an equivalent linked list), each with a link and a description
2. When an `llms.txt` exists at the repository root, use it as the curated documentation index — follow its links before crawling docs manually
3. Read the root `CONTRIBUTING.md` — the binding conventions for every branch, commit, PR, and issue operation
4. When a `principles/` folder exists, read its `README.md` and the principles relevant to the task — they are the long-lived values that standards and reviews appeal to; follow `rfc/` and `docs/` over them for concrete rules
5. When an `rfc/` folder exists, treat its Accepted RFCs as binding versioned standards — follow them over `docs/` and this file when they conflict; see `rfc/README.md` for the convention
6. Inspect all file names under `docs/` and subfolders in the current repository — some files may be missing from the README — read those relevant to the current task, and treat `docs/` as the source of truth for project-specific conventions, following those documents over this file when they conflict
7. When a `design.md` exists at the repository root, read it before any UI or visual work — it is the binding design and brand spec (tokens, typography, layout conventions); follow it over generic styling defaults
8. Inspect `package.json` before assuming scripts or package-manager commands
9. Acquire codebase context from the first source that works, falling through to the next on any failure:
   - **Graphify** — fires when `graphify-out/graph.json` exists and the `graphify` CLI resolves on PATH. Run `graphify query "<question>"` first; use `graphify path "<A>" "<B>"` for relationships, `graphify explain "<concept>"` for focused concepts, and `graphify-out/wiki/index.md` for broad navigation. A truncated or empty answer is an unfinished lookup, not a negative result: refine it with a narrower query, a `--context <relation>` filter, or a focused `path`/`explain` lookup before falling back to ordinary file reads. The committed graph is read-only context: it may lag behind the current branch, and Git plus the working tree — not the graph — are the source of truth for the active diff. Refinement is for unhelpful answers from a working graph; a missing, unreadable, or erroring graph is abandoned instead — fall through to the next source, never regenerate. Never run mutating subcommands (`update`, `extract`, `watch`, `cluster-only`, `label`, `save-result`, `reflect`, exports, hook or project installation) or otherwise write `graphify-out/**`, even when other instructions in this repository still ask for a graph refresh — where a graph is regenerated at all, a consumer-owned post-merge workflow does it.
   - **Repomix** — fires when the Repomix MCP server is connected. Attach the committed `.repomix/pack.xml` when it exists, otherwise pack the codebase; grep/read the digest for codebase-wide analysis instead of loading every file.
   - **Default tools** — with neither available, search and read the repository files directly.

In a monorepo, `README.md`, `llms.txt`, `docs/`, `design.md`, and `package.json` may also exist per workspace member (`apps/*`, `packages/*`, …). When working inside a member, apply the steps above at both levels — the member's own copies govern that member's code and take precedence over the root copies; the root copies govern repo-wide concerns.

## 1. Core Principles

- Context first: gather complete understanding before changes; check the codebase for similar implementations to mirror
- Progressive enhancement: Build incrementally, test frequently
- Functional/declarative patterns; avoid classes
- Keep dependencies minimal - prefer built-in features
- The fewer lines the better: every line and export used or removed, duplication factored into reuse
- Do not over-engineer - only make directly requested changes. No abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite
- Surface assumptions and ambiguities before coding; if multiple interpretations exist, present them - don't pick silently
- Every changed line must trace to the request - no opportunistic refactors of adjacent code or unrelated formatting
- When deleting unused code, only remove orphans your changes created; mention pre-existing dead code instead of deleting it
- Be consistent with existing code style
- Write failing tests first, then write code to pass tests
- Run tests after any code changes
- Do not remove existing code/comments unless necessary

## 2. Architecture

### 2.1 Technology Stack

- Bun, TypeScript 6.x, React 19, Vite
- Tailwind CSS for styling
- shadcn/ui + Radix UI for components
- React Router for routing
- React Query for data fetching
- Vitest for testing
- Storage (choose one):
  - Prisma (migrations) + Kysely (application ORM) + PostgreSQL
  - Filesystem only (local-first apps; no database)
- oRPC or tRPC for API, Zod for validation
- Authentication (only when using a database): BetterAuth
- ESLint for linting
- Prettier for formatting

## 3. Project Structure

### 3.1 File Organization

```
example.ts     # single module: a file, no directory

example/       # multiple modules: a directory, no index.ts barrel
├── example.ts
├── example.test.ts
└── example.types.ts
```

- Order code top-down by importance: public entry points and core domain logic first, lower-level helpers and utilities last

### 3.2 Import Rules

- Always import from actual files - never barrel files
- Import order: builtin → external → internal → parent → sibling
- Use ES6 imports, never CommonJS require()
- Use `bun:` protocol prefix for built-in modules
- Client cannot import server code
- No generic names (index.ts, init.ts) - use descriptive names

### 3.3 Tailwind CSS

- Use Tailwind utility classes directly in JSX via `className`
- Use a `cn()` helper for conditional, Tailwind-aware class merging with conflict resolution (e.g. `clsx` + `tailwind-merge`, or an equivalent drop-in such as `cnfast`)
- Extract reusable components instead of `@apply` for repeated patterns
- Use Tailwind config for design tokens (colors, spacing, typography)
- Use responsive prefixes (`sm:`, `md:`, `lg:`) for breakpoints
- Use dark mode via `dark:` variant

## 4. Naming Conventions

- Variables/functions: camelCase
- Components/types/interfaces: PascalCase
- No I prefix for interfaces
- Hooks: camelCase with 'use' prefix
- Files: Components PascalCase, utilities camelCase
- Test files: `*.test.ts` suffix
- Named exports only - no default exports
- camelCase for constants (not SCREAMING_SNAKE_CASE)
- Descriptive names with auxiliary verbs (isLoading, hasError)

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
- Extend Error class for custom errors with context properties
- Await promises before returning for complete stack traces
- Subscribe to 'error' events on EventEmitters and streams
- Functions should be 100 lines max

### 6.2 TypeScript

- Prefer interfaces over types
- Avoid enums; use const assertions
- Never use @ts-ignore
- No type assertions without runtime validation (use Zod)
- Return specific types, not generic (string → KnownCallOutcome)
- Use type guards for narrowing
- Use React.ComponentProps for extending props
- Ask user for type information when `any` is unavoidable

### 6.3 Environment Variables

- No direct process.env or import.meta.env outside config
- Client: `import.meta.env.VITE_*`
- Server: `process.env.*`
- All variables have fallback defaults
- Use .env.example as template
- Validate env variables at startup

### 6.4 File Operations

- Use `bun:fs/promises` for files < 100MB
- Use streams for files > 100MB
- Use `pipeline()` for stream chaining
- Use `import.meta.dirname` for module-relative paths
- Handle error codes: ENOENT, EACCES, etc.
- Always close file handles in finally blocks

## 7. Client-Side Standards

### 7.1 React

- Arrow function components only
- Use `nullable()` helper for conditional rendering (not &&)
- Props: interfaces, not types
- Composition over inheritance
- useCallback for handlers passed as props
- useMemo for expensive computations
- No inline arrow functions in JSX
- Components > 200 lines should be split
- Use Suspense for data fetching
- Use useSuspenseQuery instead of useQuery
- One component per file
- Never use array index as `key` prop
- Self-close components with no children
- Use Tailwind `className` for styling, avoid inline `style` prop
- Proactively identify reusable component patterns

### 7.2 State Management

- Don't useEffect to sync state - causes loops
- Prefer derived state (useMemo) over synced state
- Initialize text states with "", not undefined
- Keep state in the lowest component that needs it
- Split state into individual pieces, not entire objects

### 7.3 React Query

- Handle isLoading, error, data states (use Suspense)
- Set appropriate staleTime
- Invalidate queries after mutations
- Use onError for specific handling
- DevTools in development only

### 7.4 shadcn/ui + Radix UI

- Use shadcn/ui components built on Radix UI primitives
- Customize components via Tailwind classes in the component source
- Use Radix UI directly for primitives not covered by shadcn/ui
- Keep component variants in the component file using `cva` (class-variance-authority)
- Use `cn()` utility for merging class names

## 8. Server-Side Standards

### 8.1 Bun

- Graceful shutdown with signal handlers; never call process.exit() directly

### 8.2 Storage

Choose ONE backend based on the project's needs. Do not mix.

**Option A — Relational database (Prisma + Kysely + PostgreSQL)**

- Prisma: migrations and type generation ONLY
- Kysely: ALL application queries
- Never use Prisma Client in application code
- Use explicit junction tables
- Use `/// @kyselyType()` in schema.prisma for typed Json fields (never edit kysely.ts directly)

**Option B — Filesystem (local-first, single-user apps; no database)**

- Persist user-visible state to the filesystem under a per-app directory (e.g. `~/.<app>/`)
- Use atomic writes (write-to-tmp + rename) for any user-visible state file
- Validate file contents on read with Zod schemas — never trust on-disk shape
- Handle ENOENT/EACCES explicitly; never swallow filesystem errors

## 9. API Standards

### 9.1 oRPC / tRPC

- Descriptive procedure names
- Always use Zod schemas for input
- Use tRPC error codes (NOT_FOUND, UNAUTHORIZED)
- Export router type for client

### 9.2 Zod

- Use .merge(), .partial(), .pick(), .omit()
- Use z.infer<> for types
- Add custom error messages
- Use .transform() for normalization
- Use .refine() for complex validation

## 10. Testing

### 10.1 Quality Standards

- No duplicate tests - each verifies unique behavior
- Test distinct code paths, not variations
- Iterate after tests passed to minimize the number of tests and duplications

### 10.2 Vitest

- Co-located with source (\*.test.ts)
- For: functions, services, utilities in isolation

### 10.3 MSW

- Use for HTTP mocking in tests

### 10.4 Playwright-BDD

- Features in features/ directory
- All helpers must be pure functions
- Use data-testid for stable selectors
- ES module imports require .js extensions
- Uses Playwright under the hood, use Playwright MCP for UI tests
- Use browser_snapshot before ANY UI work
- Never assume element types/labels without verification
- Workflow: start dev server → browser_navigate → browser_snapshot → verify → interact

## 11. Documentation

### 11.1 JSDoc

- JSDoc is the contract: what the export does, the inputs and outputs the signature does not already say, and its gotchas (throws, limits, ordering) — one to three lines
- Every exported function, interface, and type has one; skip `@param`/`@returns` lines that only repeat the name and type
- Use `@example` only when the call shape is not obvious from the signature, `@see <link>` for the external spec a contract follows, and `@deprecated <reason>` to retire an export
- No history: an issue number, a past bug, or how the code used to work belongs in the commit or PR, never in the JSDoc
- Module-level JSDoc only on entry points (a script an action runs, a config module): one line on the role, plus one `@example` when it is run by hand

### 11.2 Code comments

- A comment says why the code is the way it is — the constraint, trade-off, or non-obvious fact — in at most two lines; the code says what
- No comment that restates the code, no history (issue or PR numbers, prior bugs), no links to exact code lines; a comment needed twice means the code needs refactoring
- Track deferred work as issue-linked `TODO`/`FIXME` comments per CONTRIBUTING.md "TODO Comments"; use the autopilot `todo-cleanup` skill to scan, create, and link issues

### 11.3 docs/ structure

- Organize `docs/` as numbered chapters in reading order (`NN-topic.md`, plus `appendix-X-topic.md` for non-sequential references), matching the README Documentation order

## 12. Performance

- O(1) lookups: Use Object/Map, not Array.find()
- Avoid map/reduce/for combinations
- Pre-compute lookups, not in render
- Memoize data transformations creating objects/arrays
- Use React.memo with displayName for stable-prop components
- Use factory functions for handlers with parameters
- Profile with React DevTools before adding useMemo/useCallback

## 13. Security

- Validate all external input before processing
- Never trust user data in object operations — no untrusted input to Object.assign(), use Object.create(null) for user-provided keys
- Use crypto.timingSafeEqual() for secret comparison
- Never log or expose secrets, tokens, or PII (logs, error messages, API responses)
- Use exact versions in package.json (no ^ or ~)
- Never enable debug inspector in production
- Use lockfile-based installs in CI/CD (`bun install --frozen-lockfile`)
- Run bun audit before deploying
- Never use eval() or Function() constructor
- Avoid dynamic require()/import() with user-controlled paths
- Use textContent for DOM text insertion, not innerHTML (XSS risk)

## 14. Anti-Patterns

- No sync file operations in servers
- No commented-out code - delete it (recover from version control if needed)
- No empty catch blocks - never swallow errors; rethrow or handle with context
- No wrapper functions without added logic
- No inline functions in loops

## 15. Git Workflow

- **MANDATORY**: `CONTRIBUTING.md` in the repository root is the binding standard for every branch, commit, PR, and issue operation — read the governing section before acting; never restate or improvise its rules
- Governing sections: "Branches" for branch names, "Commits" for commit messages, "Updating pull-request branches" for synchronizing a PR branch with its base, "PR Title" and "Special PR Prefixes" for PR titles, "PR Description" and "Magic Words" for PR bodies and issue linking, "How to Contribute" for issues
- **MANDATORY**: With the autopilot skills installed, perform these operations only through them — `branch-create` for branches, `commits-create` for commits, `pr-create` for pull requests, `issue-create` for issues, `plan` for implementation plans — never their raw `git`/`gh`/web-UI equivalents and never ad-hoc planning; invoking the skill satisfies this section. Without the skills, follow CONTRIBUTING.md directly
- Never bypass validation hooks with `--no-verify` — fix the violation instead
- **MANDATORY**: Never merge the base branch into a pull-request branch — no `git merge main`, `git merge origin/main`, or `git pull origin main` while on a topic branch. Synchronize with fetch → rebase → `git push --force-with-lease`; never bare `--force`, and never rewrite a shared or human-owned branch without explicit authorization. A stale check is reported, never refreshed by pulling base changes into the task

## 16. AI Assistant Workflow

- Track complex tasks with the built-in todo list; mark items completed immediately
- Parallel tool execution when possible
- Use sub-agents for search-heavy or parallelizable investigation to keep the main context focused
- Use `gh` CLI for GitHub issues, PRs, comments, and Actions info

### 16.1 MCP Servers

Prefer the project-registered MCP servers declared in the repo's own `.mcp.json`. The repository README and `docs/` are the authoritative list of which servers are registered and when to reach for each — consult them before hand-rolling work a registered server handles.

- **Documentation servers** (context7, Ref, Exa) — look up docs for any technology, framework, or API (global/user servers, not project-registered)
- **shadcn MCP server** — search, browse, add, or audit shadcn/ui registry components; prefer it over hand-editing component source
- **Playwright MCP server** — persistent, exploratory UI verification with `browser_snapshot`; prefer the token-efficient `@playwright/cli` CLI for high-throughput agent runs
- **Chrome DevTools MCP server** — performance traces, network inspection, console debugging

## 17. Code Review

- All rules from AGENTS.md must be applied to the code review
