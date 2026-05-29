---
name: pr:review
description: Review a pull request and provide constructive feedback with structured verdict. Used by awinogradov/code-review-action
argument-hint: "REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> PR_AUTHOR: <author-login>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Agent
  - Bash(gh *)
  - Bash(echo *)
  - MCP(github:*)
  - MCP(repomix:*)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
---

## Input

Arguments: `$ARGUMENTS`

Expected form (typically supplied by `awinogradov/code-review-action`):

- `REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> PR_AUTHOR: <author-login>`

## Input resolution

- **`REPO`** — `$ARGUMENTS` → `gh repo view --json nameWithOwner --jq .nameWithOwner` as fallback.
- **`PR_NUMBER`** — `$ARGUMENTS` → `gh pr view --json number --jq .number` for the current branch.
- **`REVIEWER`** — `$ARGUMENTS` → `gh api user --jq .login` (authenticated user).
- **`PR_AUTHOR`** — `$ARGUMENTS` → `gh pr view --json author --jq .author.login`.

Do NOT prompt the user. Return structured output with an explicit error if inputs cannot be resolved.

## Task

$ARGUMENTS

You review the whole PR yourself in a single pass: load context, evaluate the diff against every check in Phase 2, then emit one structured verdict. There are no review sub-agents — Phase 2 is the complete rubric.

---

## Phase 1: Context Loading

### 1.1 PR Context

Fetch PR metadata and the diff:

```bash
gh pr view <PR_NUMBER> -R <REPO> --json title,body,files,commits,reviews,comments
gh pr diff <PR_NUMBER> -R <REPO>
```

Fetch the diff exactly once and review it in-model. Never embed the diff more than once.

### 1.2 Load Context via Sub-Agents

Extract the linked issue ID from PR metadata. Check in order, stop at first match:

1. **PR body `Issues:` section** — lines starting with `Closes` or `Related to` followed by a ticket ID
2. **Branch name** — leading `[a-z]+-[0-9]+` segment, convert to UPPERCASE

Launch context-loading calls **in parallel**. If a linked issue was found, launch 3 calls; otherwise launch 2:

```
Acquire codebase snapshot (prefer the committed pack to avoid re-packing):
  Check whether `.repomix/pack.xml` exists at the repository root.
  - If it exists, call `mcp__repomix__attach_packed_output` with:
    - `path`: [repository root absolute path]/.repomix/pack.xml
  - If it is absent (or the attach fails), fall back to `mcp__repomix__pack_codebase` with:
    - `directory`: [repository root absolute path]
    - `compress`: true
    - `includePatterns`: ".claude/**, **.md, **.yml, .github/**"

Agent 1 (fetch-pr-reviews):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:fetch-pr-reviews"
  - `prompt`: "Fetch reviews for PR #<PR_NUMBER>. Repo: <REPO>. Author: <PR_AUTHOR>."
  - `description`: "Fetch PR reviews"

Agent 2 (resolve-issue-context) — only if linked issue found:
  Use the Agent tool with:
  - `subagent_type`: "autopilot:resolve-issue-context"
  - `prompt`: "Fetch issue context. Issue number: [N]. Repository: <REPO>."
  - `description`: "Resolve issue context"
```

If no issue number found, output: "No linked issue — skipping issue comparison" and skip Agent 2.

If the `gh` call fails (auth/network error) inside `resolve-issue-context`, skip issue context entirely.

After all calls complete, store the `outputId` from the snapshot acquisition (attach or pack) response. Store issue context and review data from the agents.

**Read the pack, don't dump it.** The snapshot exists so you can pull _targeted_ context on demand — use `grep_repomix_output` (regex + `contextLines`) and `read_repomix_output` with a specific `startLine`/`endLine` slice. NEVER `read_repomix_output` over the whole range (that loads the entire codebase into context). When the diff is self-contained and needs no cross-file lookup (the common case), don't read the pack at all — pull cross-file context only for checks that need it (e.g. architecture reuse, duplicated logic).

### 1.3 Review Round Handling

**First review (no previous reviews by REVIEWER):**

- Start with a short greeting to @PR_AUTHOR (triggers notification). Rotate randomly between these tones — never use the same tone twice in a row:
  1. **Dry wit** — "Thanks @PR_AUTHOR — let's see what you've brought to the table."
  2. **Curious** — "New PR from @PR_AUTHOR — interesting, let's take a look."
  3. **Straight shooter** — "Alright @PR_AUTHOR, let's get into it."
  4. **Simple thanks** — "Thanks @PR_AUTHOR!"
- Keep the greeting to ONE short sentence. No elaboration, no praise of the code after it.
- **Precedence:** Greeting applies only when the review has findings (blockers, suggestions, or nitpicks). For first-time approvals with no issues, use the minimal approval format — empty `reviewComment`, no body text at all.

**Follow-up review (previous review by REVIEWER exists):**

1. Read all previous review comments and their findings
2. Check if issues were addressed
3. Compare current findings against previous review
4. **SKIP (no structured JSON)** if: all findings are identical to previous review, OR no new findings and no unresolved issues
5. If previous review was CHANGES_REQUESTED and all blockers are now fixed with no new findings → approve with empty `reviewComment` (no body text)
6. Only submit a full review body if there are genuinely NEW findings or unresolved issues to confirm
7. DO NOT repeat resolved issues or summarize what was fixed
8. Outdated inline comments from previous reviews are auto-resolved by the bot

When skipping, output only: `Review skipped: no new findings since last review`
Do NOT produce the structured JSON output.

**Consecutive approval (previous review by REVIEWER was APPROVED):**

- If no new commits since last approval → **SKIP (no structured JSON)**. Output only: `Review skipped: already approved, no new commits`
- If new commits exist but no new issues → approve with empty `reviewComment` (no body text)
- Only submit a full review body if new commits introduce genuinely NEW findings

### 1.4 Extended Context

- **CLAUDE.md** - Apply project rules to each change
- **context7/Ref/Exa** - Look up docs for unfamiliar APIs
- **Perplexity** - Web search for general info

---

## Phase 2: Review the Diff

Review the diff against **all** checks below in a single pass and collect findings. Each finding is `{ severity, file, line, rule, title, detail }`: `severity` is `blocker | suggestion | nitpick`; `line` is `null` for out-of-diff findings; `rule` is the `CHECK-` code from the matched check (or `null` when a finding maps to no defined check — do NOT substitute `UNSPECIFIED`).

### 2.1 Detect Stack

Read `package.json` in the repository root (use Read tool or `grep_repomix_output`). Extract the `agents.rules` field value as the stack identifier.

- If the file exists: store the `rules` value (e.g., `Bun`, `NodeJS+React`, `Bun+React+Tailwind`, `NodeJS+React+Tailwind`)
- If the file does not exist or `rules` is missing: set stack to `unknown`

### 2.2 Review Principles

These rules are mandatory. Apply them exactly as written. Exceptions are only those enumerated here or named by a check's own text.

- **Read context to understand a rule; never to excuse it.** You may read surrounding code and configuration to understand what a rule means in this codebase.
- **Project config files describe tooling behavior, not review policy.** `tsconfig.json`, `eslint.config.ts`, `.eslintrc`, `tailwind.config.ts` describe what the local toolchain permits — not what this review permits. They are never a source of exceptions.
- **Prevalence is evidence of debt, not license.** Each new violation is a finding even if the codebase is already full of them. "Everyone does it" does not downgrade a finding.
- **A check may be skipped only when:** (a) the rule's stated scope does not match the diff (wrong stack, wrong file type, no matching diff pattern), or (b) the rule text itself names an exception that applies. "Too hard to fix" and "project settings allow it" are not grounds.
- **Severity is fixed.** A rule declared as blocker is reported as blocker. When in doubt, use the severity the rule declares. Do not invent intermediate severities.
- **Evaluate only changes visible in the diff** (lines prefixed with `+` or `-`). Skip checks that do not apply to the diff.

### 2.3 Review Checks

Each check below carries an HTML anchor so `code-review-action` can link its `CHECK-` code back to this file. Keep each `<a id="...">` immediately above its rule.

#### Correctness & Bugs

<a id="CHECK-BUG-001"></a>
**CHECK-BUG-001: Wrong variable referenced** — Severity: blocker

A variable from an outer scope, a similarly-named variable, or a copy-paste leftover is used instead of the intended one.

- Example: function receives `requestConfig` but body uses `self.config`; loop variable shadowing an outer `item`.

<a id="CHECK-BUG-002"></a>
**CHECK-BUG-002: Shared mutable state across async tasks** — Severity: blocker

Multiple async tasks reading/writing the same mutable object (dict, list, instance attribute) without synchronization; interleaved awaits can cause inconsistent state even in single-threaded async runtimes.

- Example: two coroutines appending to the same list with awaits between read and write.

<a id="CHECK-BUG-004"></a>
**CHECK-BUG-004: Incorrect serialization/deserialization** — Severity: blocker

Data lost or corrupted during JSON/protobuf/HOCON serialization — missing fields, wrong types, enum value mismatch between producer and consumer.

- Example: `JSON.stringify` drops `undefined` fields the consumer expects as `null`.

<a id="CHECK-PERF-001"></a>
**CHECK-PERF-001: Repeated I/O or query inside a loop (N+1)** — Severity: suggestion

A network call, database query, or filesystem read issued once per item in a loop where a single batched call would do.

- Example: `for (const id of ids) { await db.user(id) }` instead of one `db.users(ids)` batch.

<a id="CHECK-PERF-002"></a>
**CHECK-PERF-002: Quadratic or unbounded per-item work** — Severity: suggestion

An operation whose cost grows super-linearly with input — a nested scan (`Array.find`/`includes` inside a loop over a large collection) where a `Map`/`Set` would give O(1) lookup.

- Example: `items.filter((a) => others.find((b) => b.id === a.id))` with a large `others`.
- Skip: collections known to be small and fixed by the surrounding code.

#### Security

<a id="CHECK-SEC-001"></a>
**CHECK-SEC-001: Hardcoded secret or credential** — Severity: blocker

An API key, token, password, private key, or connection string with embedded credentials committed in source instead of read from a secret store or environment variable.

- Example: `const apiKey = "sk-live-..."`; a database URL with inline `user:password@host`.
- Skip: obvious non-secret placeholders (`"xxx"`, `"<your-token>"`, `process.env.X` references).

<a id="CHECK-SEC-002"></a>
**CHECK-SEC-002: Injection via unsanitized input** — Severity: blocker

Untrusted input concatenated into a SQL query, shell command, file path, or HTML sink without parameterization, escaping, or validation.

- Example: `db.query("SELECT * FROM users WHERE id = " + req.params.id)`; user input in a filesystem path without normalization (path traversal).

<a id="CHECK-SEC-003"></a>
**CHECK-SEC-003: Missing or broken access control** — Severity: blocker

A privileged action, route, or resource accessed without verifying authentication or the caller's authorization; a check present but trivially bypassed.

- Example: a mutation endpoint that never checks the caller owns the resource; an `isAdmin` flag read from client-supplied input.

<a id="CHECK-SEC-004"></a>
**CHECK-SEC-004: Weak or misused cryptography** — Severity: blocker

A broken algorithm (MD5/SHA1 for security), a non-constant-time secret comparison, a hardcoded/static IV or salt, or `Math.random()` for security-sensitive values.

- Example: comparing tokens with `===` instead of `crypto.timingSafeEqual`.

<a id="CHECK-SEC-005"></a>
**CHECK-SEC-005: Unsafe deserialization or dynamic evaluation of untrusted input** — Severity: blocker

`eval`/`Function`, dynamic `import()`/`require()` with a user-controlled path, or deserializing attacker-controlled data into executable structures.

- Example: `eval(req.body.expr)`; `require(userSuppliedPath)`.

<a id="CHECK-SEC-006"></a>
**CHECK-SEC-006: Secrets or PII written to logs or responses** — Severity: suggestion

Tokens, passwords, full request bodies with credentials, or personal data logged or returned in an API/error response.

- Example: `console.log("auth", req.headers.authorization)`; an error handler returning a stack trace with a connection string to the client.

#### Testing

<a id="CHECK-TEST-001"></a>
**CHECK-TEST-001: Testing mock behavior, not real behavior** — Severity: blocker

Test configures a mock to return X, then asserts the code got X. This tests the mock, not the code.

- Example: `mock_service.get.return_value = 42; result = handler(); assert result == 42`.

<a id="CHECK-TEST-002"></a>
**CHECK-TEST-002: Business logic duplicated in test** — Severity: blocker

Test reimplements the same calculation/logic as production to compute the expected value instead of using known input/output pairs. If production is wrong, the test is wrong the same way.

- Example: `expected = sum(items) * tax_rate + shipping; assert calculate_total(items) == expected`.

<a id="CHECK-TEST-003"></a>
**CHECK-TEST-003: Mock without verifying call arguments** — Severity: suggestion

Test creates a mock but never checks what arguments it was called with, only that the return value flowed through.

- Example: `mock_db.save.return_value = True` but no `assert_called_with(expected_record)`.

<a id="CHECK-TEST-004"></a>
**CHECK-TEST-004: Error path untested** — Severity: suggestion

Only the happy path is tested. Error conditions (invalid input, timeout, connection failure, empty result) have no coverage.

- Example: tests for `fetchUser` only cover successful fetch, never user-not-found or network error.

<a id="CHECK-TEST-005"></a>
**CHECK-TEST-005: Edge cases of modified function not tested** — Severity: suggestion

A function is modified (new parameter, changed boundary) but existing tests don't cover the new behavior.

- Example: adding an `offset` parameter to a pagination function but no test exercises non-zero offset.

<a id="CHECK-TEST-006"></a>
**CHECK-TEST-006: Test fixtures duplicated across files** — Severity: suggestion

Same test data or setup copy-pasted in multiple test files instead of shared fixtures.

- Example: three test files each creating the same `mockGrpcChannel` with identical setup.

<a id="CHECK-TEST-007"></a>
**CHECK-TEST-007: Test asset (fixture data) inlined as giant string** — Severity: suggestion

Large JSON blobs, XML payloads, or byte strings hardcoded in test files instead of loaded from `tests/assets/` or `tests/fixtures/`.

- Example: 200-line JSON dict defined at top of test file.

<a id="CHECK-TEST-008"></a>
**CHECK-TEST-008: New public function without test** — Severity: suggestion

A new public function, method, or endpoint added with zero test coverage. Every non-trivial public interface needs at least a happy-path test.

- Example: new exported function `parseConfig` with no test file changes in the diff.

<a id="CHECK-TEST-009"></a>
**CHECK-TEST-009: Flaky test indicator — sleep or retry in test** — Severity: suggestion

Tests using `time.sleep()`, `asyncio.sleep()`, `setTimeout`, or retry loops to wait for conditions — indicates a timing-dependent test.

- Example: `await new Promise(r => setTimeout(r, 500)); expect(queue).toBeEmpty()`.

#### Complexity & Readability

<a id="CHECK-CPLX-001"></a>
**CHECK-CPLX-001: Function exceeds 100 lines** — Severity: blocker

Any function or method longer than 100 lines (all stacks).

<a id="CHECK-CPLX-002"></a>
**CHECK-CPLX-002: Nesting depth too deep**

Control flow nested beyond the stack-specific threshold. Prefer early returns over nested conditionals.

- **Bun / NodeJS+React / Bun+React+Tailwind / NodeJS+React+Tailwind**: blocker at 3+ levels (ESLint `max-depth: 2` per CLAUDE.md).
- **unknown**: blocker at 5+ levels.

<a id="CHECK-CPLX-003"></a>
**CHECK-CPLX-003: Cyclomatic complexity exceeds 15** — Severity: suggestion

Function has more than 15 independent code paths (branches, loops, exception handlers).

<a id="CHECK-CPLX-004"></a>
**CHECK-CPLX-004: File exceeds 1000 lines** — Severity: blocker

Any code file longer than 1000 lines. Long files must be split.

<a id="CHECK-CPLX-005"></a>
**CHECK-CPLX-005: Misleading function/variable name** — Severity: blocker

Name implies different behavior than the code does. `get*` that mutates state, `is*` that returns non-boolean, `validate*` that also transforms.

- Example: `getUser()` that creates the user if not found.

<a id="CHECK-CPLX-006"></a>
**CHECK-CPLX-006: Inconsistent naming within module** — Severity: suggestion

Same concept named differently in the same file or closely related files — `user_id`, `uid`, `userId`.

- Scope: identifier (variable/function) naming **inside code**. Inconsistent **file/path** naming is CHECK-CS-008 — do not double-report.

<a id="CHECK-CPLX-007"></a>
**CHECK-CPLX-007: Magic numbers or magic strings** — Severity: suggestion

Numeric or string literals used in logic without a named constant explaining their meaning.

- Example: `if (buffer.length > 8192)` without explaining what 8192 represents.

<a id="CHECK-CPLX-008"></a>
**CHECK-CPLX-008: Long parameter list (>9 total or >6 positional)** — Severity: suggestion

Function accepts more than 9 total parameters or more than 6 positional, indicating it should accept a config/options object instead.

<a id="CHECK-CPLX-009"></a>
**CHECK-CPLX-009: Comment explains "what" instead of "why"** — Severity: suggestion

Comments describing what the code does (obvious from the code) instead of why.

- Example: `// increment counter` above `counter += 1`.

#### Platform Standards

<a id="CHECK-PLAT-001"></a>
**CHECK-PLAT-001: No issue IDs in commit messages** — Severity: blocker

GitHub issue references (`#123`, `Closes #123`) must NOT appear in commit messages. The PR description handles issue linking via magic words.

- Platform ref: `commitlint.config.mjs` custom rule `no-issue-id`.

<a id="CHECK-PLAT-002"></a>
**CHECK-PLAT-002: noqa / type: ignore / @ts-ignore / eslint-disable** — Severity: blocker

Zero tolerance for lint/type suppression comments. Any `# noqa`, `# type: ignore`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `eslint-disable-next-line` is a blocker.

- Example: `// @ts-ignore — TODO fix later`.

<a id="CHECK-PLAT-003"></a>
**CHECK-PLAT-003: Wrong validation library** — Severity: suggestion

Data validation must use the stack-appropriate library, not manual validation or plain classes.

- **Bun / NodeJS+React / Bun+React+Tailwind / NodeJS+React+Tailwind**: must use Zod, not manual validation or plain interfaces for runtime validation.
- Skip if the diff does not add or modify validation logic.

#### Architecture & Patterns

<a id="CHECK-ARCH-001"></a>
**CHECK-ARCH-001: Shared library utility not used** — Severity: suggestion

Code reimplements functionality already available in a shared library (logging, telemetry, pooling, database client, metrics). Check shared libraries before writing new utilities. Use Grep to confirm an existing implementation when in doubt.

<a id="CHECK-ARCH-002"></a>
**CHECK-ARCH-002: Reinventing stdlib or well-known library** — Severity: suggestion

Custom implementation of functionality available in the language stdlib or an approved dependency.

- Example: a custom retry helper when `p-retry` is already a dependency.

<a id="CHECK-ARCH-003"></a>
**CHECK-ARCH-003: Copy-paste from another service without abstraction** — Severity: suggestion

Large code blocks copied from another repo/service instead of extracting to a shared library.

<a id="CHECK-ARCH-004"></a>
**CHECK-ARCH-004: New dependency for trivial functionality** — Severity: suggestion

Adding a package for something doable in <20 lines with stdlib. Each dependency adds supply-chain risk.

- Example: adding `dotenv` to read 2 environment variables when `process.env` suffices.

<a id="CHECK-DEP-001"></a>
**CHECK-DEP-001: Deprecated or unmaintained dependency added** — Severity: suggestion

A newly added dependency is deprecated, archived, or visibly unmaintained, or pulls a heavy/duplicate transitive tree for a small need.

- Example: adding `request` (deprecated) instead of the built-in `fetch`.

<a id="CHECK-DEP-002"></a>
**CHECK-DEP-002: Dependency with incompatible or missing license** — Severity: suggestion

A new dependency carries a license incompatible with the project (e.g. GPL into a permissively-licensed project) or has no discernible license.

<a id="CHECK-ARCH-007"></a>
**CHECK-ARCH-007: Inconsistent error handling pattern** — Severity: suggestion

New code uses a different error-handling pattern than existing code in the same module (some methods raise, some return null).

<a id="CHECK-ARCH-008"></a>
**CHECK-ARCH-008: Inconsistent async pattern** — Severity: suggestion

Mixing sync and async code in the same layer. If the module is async, new code should be async too.

<a id="CHECK-ARCH-010"></a>
**CHECK-ARCH-010: Duplicated logic across files** — Severity: suggestion

Same or near-identical logic (>5 lines) appearing in multiple places. Should be extracted to a shared utility.

- Example: 13-line gRPC channel setup duplicated in 3 service files.

#### AI Code Smells

<a id="CHECK-AI-001"></a>
**CHECK-AI-001: Unnecessary abstraction layer** — Severity: suggestion

Interface/protocol/base class with exactly one implementation and no plan for others.

- Example: `AudioConverterProtocol` with only `WavConverter` implementing it.

<a id="CHECK-AI-002"></a>
**CHECK-AI-002: Output parameters (mutable args used for returning data)** — Severity: blocker

Function mutates a passed-in object to "return" data through it instead of using actual return values. A C-ism with no place in TypeScript.

- Example: `function getStatus(result) { result.status = "active"; result.code = 200; }` — should return a value.

<a id="CHECK-AI-003"></a>
**CHECK-AI-003: Unnecessary async wrapping** — Severity: suggestion

Function marked `async` with no `await` — synchronous code wearing an async costume.

- Example: `async function getConfig() { return { key: "value" }; }`.

<a id="CHECK-AI-004"></a>
**CHECK-AI-004: Logging every line of execution** — Severity: suggestion

Debug logging at entry, exit, and every intermediate step. Logs should capture decisions and state changes, not trace every line.

<a id="CHECK-AI-005"></a>
**CHECK-AI-005: Excessive type annotations on obvious code** — Severity: suggestion

Type annotations on every local variable, including trivially obvious ones, adding noise without aiding understanding.

- Example: `const items: string[] = []; const count: number = 0;`.

<a id="CHECK-AI-006"></a>
**CHECK-AI-006: Placeholder implementation left in production code** — Severity: blocker

`pass`, `...`, `NotImplementedError`, or `TODO` placeholder in code that should be fully implemented.

- Example: `function handleError(error: Error) { throw new Error("Not implemented"); }` in production.

#### Common Sense

<a id="CHECK-CS-001"></a>
**CHECK-CS-001: Constant value is clearly wrong** — Severity: blocker

A constant whose value doesn't match what it represents — too large, too small, wrong units, or nonsensical for the domain.

- Example: `TIMEOUT_MS = 1` (1ms is too short for most network calls).

<a id="CHECK-CS-002"></a>
**CHECK-CS-002: Timeout too short or too long** — Severity: suggestion

Timeout values dangerously short (false failures) or too long (blocking resources). Compare against the expected operation duration.

- Example: `GRPC_TIMEOUT = 0.5` for a call involving ML inference; `SESSION_TIMEOUT = 86400 * 30`.

<a id="CHECK-CS-003"></a>
**CHECK-CS-003: Unbounded growth — no limits on collections** — Severity: suggestion

A data structure that grows without bound (cache, in-memory queue, log buffer) without eviction policy or size limit.

- Example: `self.history = []` that appends every request but never trims.

<a id="CHECK-CS-004"></a>
**CHECK-CS-004: Error message doesn't help debugging** — Severity: suggestion

An error message lacking enough context to diagnose — missing which value failed, what was expected, or what operation was attempted.

- Example: `raise ValueError("invalid input")` instead of including the offending value.

<a id="CHECK-CS-005"></a>
**CHECK-CS-005: Log message at wrong level** — Severity: suggestion

Expected/handled conditions logged as errors (noisy), or critical failures logged as warnings (hidden).

- Example: `logger.error("user not found")` for a normal 404 flow.

<a id="CHECK-CS-006"></a>
**CHECK-CS-006: Feature flag or environment variable undocumented** — Severity: suggestion

A new environment variable or feature flag added without documenting it in README, config template, or deployment docs.

#### Surface Correctness

<a id="CHECK-BUG-005"></a>
**CHECK-BUG-005: Unreachable code after early return** — Severity: suggestion

Code placed after an unconditional `return`, `raise`, `break`, or `continue` that can never execute.

<a id="CHECK-BUG-006"></a>
**CHECK-BUG-006: Timezone-naive datetime operations** — Severity: suggestion

Mixing timezone-aware and timezone-naive datetimes, or assuming local time when UTC is required.

- Example: `new Date()` without explicit UTC handling when the codebase standardizes on a UTC helper.

<a id="CHECK-BUG-007"></a>
**CHECK-BUG-007: Incorrect exception handling — catching too broadly** — Severity: suggestion

Bare `catch (e) { ... }` that swallows errors without rethrowing — especially where an `AbortError` or a programmer error should propagate.

- Example: `catch (e) { logger.error("failed"); }` swallowing an `AbortError` from a cancelled fetch.

<a id="CHECK-BUG-008"></a>
**CHECK-BUG-008: Return type mismatch with type annotation** — Severity: suggestion

A function's actual return value doesn't match its type annotation on some code paths.

- Example: `function getName(): string` with an implicit `return undefined` on cache miss.

#### Surface Naming & Structure

<a id="CHECK-CS-007"></a>
**CHECK-CS-007: Filename too broad for its contents** — Severity: suggestion

File named generically (`utils.ts`, `helpers.ts`, `common.ts`) when it contains code for a specific domain and sits among 10+ other files.

- Example: `maintenance.ts` containing only queue maintenance routines should be `queueMaintenance.ts`.

<a id="CHECK-CS-008"></a>
**CHECK-CS-008: Inconsistent naming scheme across related files** — Severity: suggestion

Related files follow different naming patterns — some `_client`, others `_service`, mixing conventions.

- Scope: **file and path** naming. Inconsistent **identifier** naming inside code is CHECK-CPLX-006 — do not double-report.

<a id="CHECK-CS-009"></a>
**CHECK-CS-009: New file in wrong directory** — Severity: suggestion

File placed in a directory that doesn't match its purpose per the project's directory-structure conventions.

- Example: a service module placed in `src/api/` instead of `src/services/`.

#### PR Hygiene

Stack is not relevant for PR hygiene — these apply universally.

**Issue alignment** (Severity: suggestion, `rule`: `null`) — if issue context is provided, every requirement in the linked issue must be addressed; flag unexplained scope creep. Skip if the issue description is vague or empty.

<a id="CHECK-PR-001"></a>
**CHECK-PR-001: Diff matches PR title/description** — Severity: blocker

The actual changes must match what the PR title and description claim. No hidden changes, no scope creep, no "while I was here" additions.

<a id="CHECK-PR-002"></a>
**CHECK-PR-002: PR is atomic — single concern** — Severity: suggestion

PR addresses one logical change. Bug fixes shouldn't include refactoring; features shouldn't include unrelated cleanup.

<a id="CHECK-PR-003"></a>
**CHECK-PR-003: PR is reviewable size (<1000 lines of meaningful diff)** — Severity: suggestion

Exclude generated files, lockfiles, and config, but the meaningful code diff should be reviewable in one sitting.

<a id="CHECK-PR-004"></a>
**CHECK-PR-004: No merge commits in feature branch** — Severity: suggestion

Feature branches should be rebased on main, not merged. Merge commits clutter history.

<a id="CHECK-PR-005"></a>
**CHECK-PR-005: No "fix review" or "address feedback" commits** — Severity: suggestion

Review feedback should be squashed into the relevant original commit, not added as separate commits.

<a id="CHECK-PR-006"></a>
**CHECK-PR-006: No unrelated file changes** — Severity: suggestion

Files modified that have nothing to do with the PR's purpose — whitespace, import reordering, formatting in unrelated files.

<a id="CHECK-PR-007"></a>
**CHECK-PR-007: Description explains "why", not just "what"** — Severity: suggestion

The PR description should explain motivation and context, not just list changed files.

<a id="CHECK-PR-008"></a>
**CHECK-PR-008: Breaking changes called out** — Severity: blocker

Breaking changes (API changes, config format changes, removed features) must be explicitly listed in the PR description with migration steps.

<a id="CHECK-PR-009"></a>
**CHECK-PR-009: Release notes section present for user-facing changes** — Severity: suggestion

Feature/fix PRs affecting users should include a `**Release notes:**` section in the PR description.

### 2.4 Aggregate Findings

1. Collect every finding from Phase 2.3 as `{ severity, file, line, rule, title, detail }`.
2. Deduplicate by `(file, line)` — if the same location matches more than one check, keep the higher severity (`blocker` > `suggestion` > `nitpick`) and merge their `rule` codes into one bare comma-separated list (e.g. `CHECK-BUG-002, CHECK-AI-002`). Findings with a `null` line are never merged.
3. Order the merged list by severity: blockers first, then suggestions, then nitpicks.
4. Proceed to Phase 3 with this list.

### 2.5 Rule Codes (resolved to links by the action)

Emit rule codes **bare** — `[CHECK-BUG-002]`, or `[CHECK-BUG-002, CHECK-AI-002]` for a shared location. `code-review-action` rewrites each bare code into a markdown link to this skill file's anchor (`src/ruleUrls.ts`) after the model returns its structured output. The model MUST therefore:

- Emit bare codes only — never construct `https://github.com/...` links.
- Append nothing when a finding has no rule code (do not emit `[UNSPECIFIED]`).

Map `severity` to its emoji when rendering in Phase 3: `blocker` → 🚧, `suggestion` → 🙋‍♂️, `nitpick` → 💡. The emoji stays first so downstream severity filters keep working.

---

## Phase 3: Submit Review

### Issue Severity

- **🚧 Blocking** - Must fix before merge (bugs, security, missing tests, RFC violations)
- **🙋‍♂️ Suggestions** - Should fix, can discuss (architecture, patterns)
- **💡 Nitpicks** - Optional improvement (style, naming)

### Verdict Decision Rules

**STRICT RULES - No exceptions:**

0. **Nothing new to report** → no structured output (review skipped)
   - Follow-up with identical findings as previous review
   - Follow-up with no findings and no unresolved issues
   - Already approved + no new commits since last approval
1. **Any 🚧 Blockers exist** → `verdict: "requestChanges"`
2. **No blockers, only 🙋‍♂️ suggestions** → `verdict: "approve"` (suggestions are non-blocking)
3. **No issues at all** → `verdict: "approve"`, `reviewComment: ""`

**FORBIDDEN:**

- Never use "👍 Approve" when blockers exist
- Never use conditional approval language ("Once X is fixed, approve")
- Never mismatch verdict field and section header

---

## Output Format

### Structured Output Schema

```json
{
  "verdict": "approve" | "requestChanges" | "comment",
  "reviewComment": "...",
  "inlineComments": [
    {"path": "src/file.py", "line": 42, "body": "🚧 Issue description"},
    {"path": "src/other.py", "line": 15, "body": "🙋‍♂️ Suggestion here"}
  ]
}
```

### reviewComment Format (~30 lines max)

**CRITICAL: Use these EXACT section names. "Observations", "Positive Notes", or similar variations are NOT allowed.**

**SKIP empty sections entirely. Do NOT write "None" or "N/A" - just omit the section.**

**WHEN TO USE EMPTY reviewComment (`""`):**

- Approve with no findings (no blockers, no suggestions, no nitpicks)
- Follow-up approve after all blockers fixed, no new findings
- Consecutive approve with no new issues

The `verdict` field drives the GitHub review event. An empty `reviewComment` means no body text is posted — the approval/rejection event speaks for itself.

**WHEN TO USE NON-EMPTY reviewComment:**

- Any review with findings (blockers, suggestions, or nitpicks)
- `requestChanges` verdict (always needs explanation)
- Nothing new to report → no structured output at all (skip review entirely)

**If reviewComment is non-empty, use these verdict headers at the END:**

- `verdict: "requestChanges"` → `### ⛔ Request Changes`
- `verdict: "approve"` (with suggestions/nitpicks) → `### 👍 Approve`
- `verdict: "comment"` → `### 💬 Comment`

**Example: approve with no findings (most common case)**

```json
{
  "verdict": "approve",
  "reviewComment": "",
  "inlineComments": []
}
```

**Example: requestChanges with blockers**

```json
{
  "verdict": "requestChanges",
  "reviewComment": "Adds retry logic to the payment webhook handler.\n\n### 🚧 Blockers\n\n1. **Missing idempotency check** - `src/webhooks/payment.ts:45` - Retries can cause duplicate charges [CHECK-BUG-002]\n\n### ⛔ Request Changes\n\nAdd idempotency key validation before processing payment.",
  "inlineComments": [
    {
      "path": "src/webhooks/payment.ts",
      "line": 45,
      "body": "🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002]"
    }
  ]
}
```

**Example: approve with suggestions (non-blocking)**

```json
{
  "verdict": "approve",
  "reviewComment": "Adds retry logic to the payment webhook handler.\n\n### 🙋‍♂️ Suggestions\n\n- `src/webhooks/payment.ts:62` - Consider exponential backoff for retries [CHECK-ARCH-002]\n\n### 👍 Approve",
  "inlineComments": [
    {
      "path": "src/webhooks/payment.ts",
      "line": 62,
      "body": "🙋‍♂️ Consider exponential backoff for retries [CHECK-ARCH-002]"
    }
  ]
}
```

**reviewComment body template (ONLY when there are findings):**

Every blocker, suggestion, and nitpick line ends with the **bare** rule code (e.g. `[CHECK-BUG-002]`). If two checks flagged the same `(path, line)`, list all codes comma-separated inside a single bracket pair (e.g. `[CHECK-BUG-002, CHECK-AI-002]`). Do NOT build markdown links — `code-review-action` resolves codes to links after submission (§2.5). When a finding has no rule code, omit the bracket suffix entirely.

```markdown
[1 factual sentence: what this PR changes — no quality judgment]

### 🚧 Blockers

1. **[Title]** - `src/path/to/file.py:NN` - [Problem in 1 line] [CHECK-BUG-XXX]

### 🙋‍♂️ Suggestions

- `src/path/to/file.py:NN` - [Recommendation in 1 line] [CHECK-AI-XXX]

### 💡 Nitpicks

- `src/path/to/file.py:NN` - [Optional fix in 1 line] [CHECK-CPLX-XXX]

### ⛔ Request Changes / ### 👍 Approve

[1 sentence: what must change — ONLY for requestChanges. Omit for approve.]
```

### inlineComments Usage

Add inline comments for issues with specific code locations:

- **🚧 Blocker** - Always add inline comment at exact location if location is specific
- **🙋‍♂️ Suggestion** - Add if location is specific
- **💡 Nitpicks** - Optional, can be in summary only

Each inline comment: 1-2 sentences, start with severity emoji, end with the **bare** rule code (e.g. `🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002]`). `code-review-action` resolves it to a link after submission (§2.5).

### Deduplication Rules

- NEVER mention the same issue in BOTH reviewComment AND inlineComments
- If adding inline comment → mention location in reviewComment but don't repeat full description
- If issue location is out-of-diff → put in reviewComment only, skip inlineComments

### Include

- ALWAYS full paths for all file references (e.g., `src/history/kafka/consumer.py:66`, NOT `consumer.py:66`)
- Direct, confident language
- Clear verdict (rationale only when requesting changes)
- Bare rule code `[<CODE>]` (or `[<CODE1>, <CODE2>]`) suffix on every finding line (blocker, suggestion, nitpick) and every `inlineComments.body` — `code-review-action` resolves codes to links (§2.5); omit the suffix entirely when no rule code is available

### Exclude

- Code examples or implementation suggestions
- "## Summary", "## Verdict", or any top-level markdown headers in review body
- "Observations", "Positive Observations", or any praise/compliment sections
- Multi-sentence greetings or praise after the opening greeting ("Great work", "Clean implementation", "well-structured", etc.)
- Explanations of why code is good or well-written — if no issues, just approve silently
- "🔁 Follow-up review" prefix or any round-labeling preamble
- CLAUDE.md compliance checklists
- File/line change statistics
- Hedging words: "should", "could", "might", "consider"
- Duplicate content between reviewComment and inlineComments
- Empty sections with "None", "N/A", or similar placeholders
