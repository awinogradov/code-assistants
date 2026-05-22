---
alwaysApply: true
---

<!--
Source: https://github.com/awinogradov/code-assistants/blob/main/rules/NodeJS+React+Tailwind.md
This file is distributed to downstream repositories by an automated sync.
Edits made downstream are overwritten on the next run.
To change it, open a pull request against the source file above.
-->

# NodeJS + React + Tailwind Project Rules

## Mandatory Context

Before making any changes:

1. Read the root `README.md` — its Documentation section lists every doc with a link and description
2. Inspect all file names under `docs/` and subfolders in the current repository — some files may be missing from the README
3. Read files that appear relevant to the current task
4. Treat `docs/` as the source of truth for project-specific conventions and follow those documents over this file when they conflict

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
- 👤 Do not over-engineer - only make directly requested changes
- 👤 Be consistent with existing code style
- 👤 Write failing tests first, then write code to pass tests
- 👤 Run tests after any code changes
- 👤 Do not remove existing code/comments unless necessary
- 👤 Write plan before changes, not report after

## 2. Architecture

### 2.1 Technology Stack

- Full-stack React + Node.js with Express
- TypeScript 6.x, React 19, Vite
- npm or pnpm for package management
- Tailwind CSS for styling
- shadcn/ui + Radix UI for components
- Prisma (migrations) + Kysely (application ORM)
- PostgreSQL database
- oRPC or tRPC for API, Zod for validation
- React Router for routing
- React Query for data fetching
- Vitest for testing
- BetterAuth for authentication
- ESLint for linting
- Prettier for formatting

## 3. Project Structure

### 3.1 File Organization

- 👤 Single module file only → no directory. Example: `example.ts`
- 👤 Multiple module files → create directory, NO index.ts. Example: `example/example.ts`, `example/example.test.ts`, `example/example.types.ts`.
- 👤 Order code top-down by importance: public entry points and core domain logic first, lower-level helpers and utilities last

### 3.2 Import Rules

- 🤖 Always import from actual files - never barrel files (`import/order`)
- 🤖 Import order: builtin → external → internal → parent → sibling
- 🤖 Client cannot import server code (`import/no-restricted-paths`)
- 👤 No generic names (index.ts, init.ts) - use descriptive names

### 3.3 Tailwind CSS

- 👤 Use Tailwind utility classes directly in JSX via `className`
- 👤 Use `cn()` helper (clsx + tailwind-merge) for conditional classes
- 👤 Extract reusable components instead of `@apply` for repeated patterns
- 👤 Use Tailwind config for design tokens (colors, spacing, typography)
- 👤 Use responsive prefixes (`sm:`, `md:`, `lg:`) for breakpoints
- 👤 Use dark mode via `dark:` variant

## 4. Naming Conventions

- 🤖 Variables/functions: camelCase (`@typescript-eslint/naming-convention`)
- 🤖 Components/types/interfaces: PascalCase
- 🤖 No I prefix for interfaces
- 👤 Hooks: camelCase with 'use' prefix
- 👤 Files: Components PascalCase, utilities camelCase
- 👤 Test files: `*.test.ts` suffix
- 🤖 Named exports only - no default exports (`import/no-default-export`)
- 👤 IMPORTANT: camelCase for constants (not SCREAMING_SNAKE_CASE)
- 👤 Descriptive names with auxiliary verbs (isLoading, hasError)

## 5. Development Setup

- Node.js 24 LTS via nvm
- 👤 Inspect @package.json before assuming scripts or package-manager commands

## 6. Environment Variables

- 🤖 No direct process.env or import.meta.env outside config (`no-restricted-syntax`)
- 👤 Client: `import.meta.env.VITE_*`
- 👤 Server: `process.env.*`
- 👤 All variables have fallback defaults
- 👤 Use .env.example as template

## 7. Client-Side Standards

### 7.1 React

- 🤖 Arrow function components only (`react/function-component-definition`)
- 👤 Use `nullable()` helper for conditional rendering (not &&)
- 🤖 Props: interfaces, not types
- 👤 Composition over inheritance
- 👤 useCallback for handlers passed as props
- 👤 useMemo for expensive computations
- 🤖 No inline arrow functions in JSX (`react/jsx-no-bind`)
- 👤 Components > 200 lines should be split
- 👤 Use Suspense for data fetching
- 👤 Use useSuspenseQuery instead of useQuery
- 🤖 One component per file (`react/no-multi-comp`)
- 🤖 Never use array index as `key` prop (`react/no-array-index-key`)
- 🤖 Self-close components with no children (`react/self-closing-comp`)
- 👤 Use Tailwind `className` for styling, avoid inline `style` prop
- 👤 Proactively identify reusable component patterns

### 7.2 JavaScript

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

### 7.3 TypeScript

- 🤖 Prefer interfaces over types (`@typescript-eslint/consistent-type-definitions`)
- 👤 Avoid enums; use const assertions
- 🤖 Never use @ts-ignore (`@typescript-eslint/ban-ts-comment`)
- 👤 No type assertions without runtime validation (use Zod)
- 👤 Return specific types, not generic (string → KnownCallOutcome)
- 👤 Use type guards for narrowing
- 👤 Use React.ComponentProps for extending props
- 👤 Ask user for type information when `any` is unavoidable

### 7.4 State Management

- 👤 Don't useEffect to sync state - causes loops
- 👤 Prefer derived state (useMemo) over synced state
- 👤 Map/Set for lookups, Array only when order matters
- 👤 Initialize text states with "", not undefined
- 👤 Keep state in the lowest component that needs it
- 👤 Split state into individual pieces, not entire objects

### 7.5 React Query

- 👤 Handle isLoading, error, data states (use Suspense)
- 👤 Set appropriate staleTime
- 👤 Invalidate queries after mutations
- 👤 Use onError for specific handling
- 👤 DevTools in development only

### 7.6 shadcn/ui + Radix UI

- 👤 Use shadcn/ui components built on Radix UI primitives
- 👤 Customize components via Tailwind classes in the component source
- 👤 Use Radix UI directly for primitives not covered by shadcn/ui
- 👤 Keep component variants in the component file using `cva` (class-variance-authority)
- 👤 Use `cn()` utility for merging class names

## 8. Server-Side Standards

### 8.1 NodeJS

- 👤 Use ES6 imports, not CommonJS
- 🤖 Use fs/promises for file operations (`n/prefer-promises/fs`)
- 👤 Graceful shutdown with signal handlers
- 👤 Validate env variables at startup
- 🤖 Use `node:` protocol prefix for built-in modules (`unicorn/prefer-node-protocol`)
- 👤 Extend Error class for custom errors with context properties
- 👤 Await promises before returning for complete stack traces
- 👤 Subscribe to 'error' events on EventEmitters and streams

### 8.2 Express

- 👤 Use helmet for security headers
- 👤 Use compression middleware
- 👤 Middleware pattern for request handling

### 8.3 Database (Prisma/Kysely)

- 👤 Prisma: migrations and type generation ONLY
- 👤 Kysely: ALL application queries
- 👤 Never use Prisma Client in application code
- 👤 Use explicit junction tables
- 👤 Use `/// @kyselyType()` in schema.prisma for typed Json fields (never edit kysely.ts directly)

### 8.4 File Operations

- 👤 Use `node:fs/promises` for files < 100MB
- 👤 Use streams for files > 100MB
- 👤 Use `pipeline()` for stream chaining
- 👤 Use `import.meta.dirname` for module-relative paths
- 👤 Handle error codes: ENOENT, EACCES, etc.
- 👤 Always close file handles in finally blocks

## 9. API Standards

### 9.1 oRPC / tRPC

- 👤 Descriptive procedure names
- 👤 Always use Zod schemas for input
- 👤 Use tRPC error codes (NOT_FOUND, UNAUTHORIZED)
- 👤 Export router type for client

### 9.2 Zod

- 👤 Use .merge(), .partial(), .pick(), .omit()
- 👤 Use z.infer<> for types
- 👤 Add custom error messages
- 👤 Use .transform() for normalization
- 👤 Use .refine() for complex validation

## 10. Testing

### 10.1 Quality Standards

- 👤 No duplicate tests - each verifies unique behavior
- 👤 Test distinct code paths, not variations
- 👤 Iterate after tests passed to minimize the number of tests and duplications

### 10.2 Vitest

- 👤 Co-located with source (\*.test.ts)
- 👤 For: functions, services, utilities in isolation

### 10.3 MSW

- 👤 Use for HTTP mocking in tests

### 10.4 Playwright-BDD

- 👤 Features in features/ directory
- 👤 All helpers must be pure functions
- 👤 Use data-testid for stable selectors
- 👤 ES module imports require .js extensions
- 👤 Uses Playwright under the hood, use Playwright MCP for UI tests
- 👤 IMPORTANT: Use browser_snapshot before ANY UI work
- 👤 Never assume element types/labels without verification
- 👤 Workflow: start dev server → browser_navigate → browser_snapshot → verify → interact

## 11. Documentation

### 11.1 JSDoc

- 👤 Every exported interface/type must have JSDoc
- 👤 File-level JSDoc for config modules
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
- 👤 Use exact versions in package.json (no ^ or ~)
- 👤 Never enable debug inspector in production
- 👤 Never pass untrusted data to Object.assign()
- 👤 Use Object.create(null) for user-provided keys
- 👤 Use lockfile-based installs in CI/CD (`pnpm install --frozen-lockfile` or `npm ci`)
- 👤 Run the matching audit command before deploying (`pnpm audit` or `npm audit`)
- 🤖 Never use eval() or Function() constructor (`no-eval`)
- 👤 Avoid dynamic require()/import() with user-controlled paths
- 👤 Use textContent for DOM text insertion, not innerHTML (XSS risk)

## 14. Anti-Patterns

- 🤖 No CommonJS require() - use ES6 imports
- 👤 No callback-based APIs - use Promise-based
- 🤖 No sync file operations in servers (`n/no-sync`)
- 👤 No direct process.exit() - use graceful shutdown
- 👤 No CSS Modules/CSS-in-JS - use Tailwind CSS
- 👤 No barrel files (index.ts re-exports)
- 👤 No unused exports - delete immediately
- 👤 No wrapper functions without added logic
- 👤 No Array.find() for lookups - use Map/Object
- 👤 No useEffect for state sync
- 👤 No inline functions in loops
- 👤 No incomplete configurations
- 👤 No raw `git commit` — use `Skill(autopilot:commits:create)`
- 👤 No raw `git checkout -b` / `git branch` — use `Skill(autopilot:branch:create)`
- 👤 No raw `gh pr create` — use `Skill(autopilot:pr:create)`

## 16. AI Assistant Workflow

### 16.1 Claude Code

- 👤 Use TodoWrite to track complex tasks
- 👤 Mark todos as completed immediately
- 👤 Parallel tool execution when possible
- 👤 Gather context before editing
- 👤 Use sub-agents for search-heavy or parallelizable investigation to keep the main context focused
- 👤 Use `gh` CLI for GitHub issues, PRs, comments, and Actions info
- 👤 **MANDATORY**: Commit only via `Skill(autopilot:commits:create)` — no raw `git commit`, no `git commit -m`, no `--amend`, no exceptions. If the autopilot plugin is not installed, follow CONTRIBUTING.md
- 👤 **MANDATORY**: Create branches only via `Skill(autopilot:branch:create)` — no raw `git checkout -b`, `git branch`, or `git switch -c`. If the autopilot plugin is not installed, follow CONTRIBUTING.md
- 👤 **MANDATORY**: Create PRs only via `Skill(autopilot:pr:create)` — no raw `gh pr create` or web-UI PR creation. If the autopilot plugin is not installed, follow CONTRIBUTING.md

### 16.2 MCP Servers

**context7**, **Ref**, **Exa**: Look up documentation for all technologies

**Playwright**: Verify UI state with browser_snapshot

**Chrome DevTools**: Performance analysis, network debugging, console logging, etc.

## 17. Code Review

- All rules from CLAUDE.md must be applied to the code review
