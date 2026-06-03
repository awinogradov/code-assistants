---
name: pr:review
description: Review a pull request and provide constructive feedback with structured verdict. Used by awinogradov/code-review-action
argument-hint: "REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> PR_AUTHOR: <author-login> RULES_DOC_URL: <url>"
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

- `REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> PR_AUTHOR: <author-login> RULES_DOC_URL: <url>`

## Input resolution

- **`REPO`** — `$ARGUMENTS` → `gh repo view --json nameWithOwner --jq .nameWithOwner` as fallback.
- **`PR_NUMBER`** — `$ARGUMENTS` → `gh pr view --json number --jq .number` for the current branch.
- **`REVIEWER`** — `$ARGUMENTS` → `gh api user --jq .login` (authenticated user).
- **`PR_AUTHOR`** — `$ARGUMENTS` → `gh pr view --json author --jq .author.login`.
- **`RULES_DOC_URL`** — `$ARGUMENTS` only. The action always supplies it (its `rules_doc_url` input default is the one canonical copy). When absent (e.g. a manual local run), do NOT fabricate a URL — render every `CHECK-` rule code as plain text (the bare code, no link) per [§2.5](#25-rule-codes).

Do NOT prompt the user. Return structured output with an explicit error if inputs cannot be resolved.

## Task

$ARGUMENTS

You review the whole PR yourself in a single pass: load context, evaluate the diff against every check in Phase 2, then emit one structured verdict. There are no review sub-agents — Phase 2 is the complete rubric.

---

## Phase 1: Context Loading

### 1.1 PR Context

Fetch PR metadata and the diff:

```bash
gh pr view <PR_NUMBER> -R <REPO> --json title,body,files,commits,reviews,latestReviews,comments,reviewDecision
gh pr diff <PR_NUMBER> -R <REPO>
```

Fetch the diff exactly once and review it in-model. Never embed the diff more than once.

This `gh pr view` output is the authoritative source for the PR title/body/diff and prior-review verdicts: `reviews`/`latestReviews` carry each prior review's verdict and summary body (the body lists that round's findings). Per-line inline annotations are NOT in any `gh pr view` field — load them via the read-only `gh api` call the `fetch-pr-reviews` agent makes in [§1.2](#12-load-context-via-sub-agents) (the review action now permits `gh api` GETs; only write forms are blocked). A denied or empty fetch must never be silently treated as "no prior findings" (that path produces an empty, content-free approval).

Treat the prior review **bodies** (§1.1) plus the inline threads loaded by `fetch-pr-reviews` (§1.2) as the record of past findings: the review skill writes a self-contained summary body for every non-empty review (see [reviewComment Format](#reviewcomment-format-30-lines-max)), and the inline threads carry the per-line detail. With both loaded, a follow-up review sees exactly what each prior round flagged and where — do not bail when one source is empty; cross-check the other.

### 1.2 Load Context via Sub-Agents

Extract the linked issue ID from PR metadata. Check in order, stop at first match:

1. **PR body `Issues:` section** — lines starting with `Closes` or `Related to` followed by a ticket ID
2. **Branch name** — leading `[a-z]+-[0-9]+` segment, convert to UPPERCASE

Load the remaining context in parallel — the codebase snapshot, the prior inline review threads, and (when an issue is linked) the linked-issue context plus the related TODOs / issue references in the codebase. Prior-review verdicts and summary bodies already come from the [§1.1](#11-pr-context) `gh pr view` output; the `fetch-pr-reviews` agent adds the per-line inline annotations via read-only `gh api`, returning a categorized summary (raw API output stays out of this context).

```
Acquire codebase snapshot (prefer the committed pack to avoid re-packing):
  Check whether `.repomix/pack.xml` exists at the repository root.
  - If it exists, call `mcp__repomix__attach_packed_output` with:
    - `path`: [repository root absolute path]/.repomix/pack.xml
  - If it is absent (or the attach fails), fall back to `mcp__repomix__pack_codebase` with:
    - `directory`: [repository root absolute path]
    - `compress`: true
    - `includePatterns`: ".claude/**, **.md, **.yml, .github/**"

Agent (fetch-pr-reviews):
  Use the Agent tool with:
  - `subagent_type`: "autopilot:fetch-pr-reviews"
  - `prompt`: "Fetch reviews for PR #[PR_NUMBER]. Repo: <REPO>. Author: <PR_AUTHOR>."
  - `description`: "Fetch PR review threads"

Agent (resolve-issue-context) — only if linked issue found:
  Use the Agent tool with:
  - `subagent_type`: "autopilot:resolve-issue-context"
  - `prompt`: "Fetch issue context. Issue number: [N]. Repository: <REPO>."
  - `description`: "Resolve issue context"

Agent (search-codebase-todos) — only if linked issue found:
  Use the Agent tool with:
  - `subagent_type`: "autopilot:search-codebase-todos"
  - `prompt`: "Search for TODOs. Issue number: [N]."
  - `description`: "Search codebase TODOs and issue references"
```

If no issue number found, output: "No linked issue — skipping issue comparison" and skip the issue-context agent.

If a `gh` call fails (auth/network error) inside an agent, continue with whatever context loaded — never treat a failed `fetch-pr-reviews` as "no prior findings", and skip issue comparison only when `resolve-issue-context` itself found no issue.

After all calls complete, store the `outputId` from the snapshot acquisition (attach or pack) response, the categorized review threads from `fetch-pr-reviews`, the issue context from `resolve-issue-context`, and the TODOs / issue references from `search-codebase-todos`. Use these plus the prior-review verdicts from [§1.1](#11-pr-context) for the round handling below.

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

1. Read all previous review findings from the `reviews`/`latestReviews` bodies ([§1.1](#11-pr-context)) and the per-line inline threads from `fetch-pr-reviews` ([§1.2](#12-load-context-via-sub-agents))
2. Check if issues were addressed by re-examining the current diff for each finding named in those bodies
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

### 1.4 Project Context (read before reviewing)

Read the project's own conventions before judging the diff — you enforce them, so you must load them first (mirrors the plan skill's Phase 1):

- **CLAUDE.md (stack rules)** — read the repository-root `CLAUDE.md`; map each changed line to the rule it must satisfy.
- **README + `docs/*` (project conventions)** — read the root `README.md` and the docs it links; treat `docs/` as the source of truth for project-specific conventions.
- **context7 / Ref / Exa** — MANDATORY for any unfamiliar library or API the diff touches; never guess an API's behavior.
- **Perplexity** — web search for general or architectural questions.

### 1.5 Context Map

Phase 1 is the single context-gathering pass. Record a compact map; Phase 2 reasons over it without re-fetching the diff or re-reading the pack:

- **PR diff** — changed files and the one-line role of each change (§1.1).
- **Linked-issue requirements** — acceptance criteria from `resolve-issue-context` (§1.2), or "no linked issue".
- **Related work** — TODOs and `#<issue>` references in the codebase from `search-codebase-todos` (§1.2): flag whether the diff resolves or conflicts with a related TODO, leaves a referenced issue half-addressed, or duplicates work tracked elsewhere; "none" when no issue is linked or none found.
- **Prior-review findings** — unresolved findings from prior review bodies (§1.1) and inline threads from `fetch-pr-reviews` (§1.2); empty on first review.
- **Project conventions** — the CLAUDE.md / README / `docs/*` points that bear on the diff (§1.4).
- **Codebase pointers** — only the targeted pack-`grep` hits pulled for cross-file checks; "none" when the diff is self-contained.
- **Stack** — `agents.rules` value (drives [§2](#phase-2-review-the-diff) thresholds), or `unknown`.

---

## Phase 2: Review the Diff

Review the diff against **all** checks below in a single pass and collect findings, reasoning over the [§1.5](#15-context-map) Context Map rather than re-fetching the diff or re-reading the pack to reconstruct what it already holds. Each finding is `{ severity, file, line, rule, title, detail }`: `severity` is `blocker | suggestion | nitpick`; `line` is `null` for out-of-diff findings; `rule` is the `CHECK-` code from the matched check (or `null` when a finding maps to no defined check — do NOT substitute `UNSPECIFIED`).

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

Each check below carries an HTML anchor so this skill can link its `CHECK-` code back to this file (see [§2.5](#25-rule-codes)). Keep each `<a id="...">` immediately above its rule.

#### Correctness & Bugs

<a id="CHECK-BUG-001"></a>
**CHECK-BUG-001: Wrong variable referenced** — Severity: blocker

A variable from an outer scope, a similarly-named variable, or a copy-paste leftover is used instead of the intended one.

- Example: function receives `requestConfig` but the body reads a `config` from an outer scope; a loop variable shadowing an outer `item`.

<a id="CHECK-BUG-002"></a>
**CHECK-BUG-002: Shared mutable state across async tasks** — Severity: blocker

Multiple async tasks reading/writing the same mutable object (array, object, or instance field) without synchronization; interleaved awaits can cause inconsistent state even in single-threaded async runtimes.

- Example: two async tasks pushing to the same array with awaits between read and write.

<a id="CHECK-BUG-004"></a>
**CHECK-BUG-004: Incorrect serialization/deserialization** — Severity: blocker

Data lost or corrupted during JSON serialization — missing fields, wrong types, enum value mismatch between sender and receiver.

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

<a id="CHECK-SEC-007"></a>
**CHECK-SEC-007: External input crosses a trust boundary without validation** — Severity: suggestion

Data from outside the program — a request body/params, an external API response, a webhook payload, env vars, or file contents — consumed without validating its shape at the boundary before use. Distinct from CHECK-SEC-002 (injection sinks) and CHECK-PLAT-003 (which validation library): this fires when external input is trusted with no validation at all.

- Example: `const { amount } = await res.json()` used directly in a calculation without parsing the response against a schema.
- Skip if the diff does not read external input, or the value is already validated at the boundary before this use.

#### Testing

<a id="CHECK-TEST-001"></a>
**CHECK-TEST-001: Testing mock behavior, not real behavior** — Severity: blocker

Test configures a mock to return X, then asserts the code got X. This tests the mock, not the code.

- Example: `mockService.get.mockReturnValue(42); expect(handler()).toBe(42)`.

<a id="CHECK-TEST-002"></a>
**CHECK-TEST-002: Business logic duplicated in test** — Severity: blocker

Test reimplements the same calculation/logic as production to compute the expected value instead of using known input/output pairs. If production is wrong, the test is wrong the same way.

- Example: `const expected = sum(items) * taxRate + shipping; expect(calculateTotal(items)).toBe(expected)`.

<a id="CHECK-TEST-003"></a>
**CHECK-TEST-003: Mock without verifying call arguments** — Severity: suggestion

Test creates a mock but never checks what arguments it was called with, only that the return value flowed through.

- Example: `mockDb.save.mockReturnValue(true)` but no `expect(mockDb.save).toHaveBeenCalledWith(expectedRecord)`.

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

- Example: 200-line JSON object defined at top of test file.

<a id="CHECK-TEST-008"></a>
**CHECK-TEST-008: New public function without test** — Severity: suggestion

A new public function, method, or endpoint added with zero test coverage. Every non-trivial public interface needs at least a happy-path test.

- Example: new exported function `parseConfig` with no test file changes in the diff.

<a id="CHECK-TEST-009"></a>
**CHECK-TEST-009: Flaky test indicator — sleep or retry in test** — Severity: suggestion

Tests using `setTimeout`, fixed delays, or retry loops to wait for conditions — indicates a timing-dependent test.

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
**CHECK-PLAT-002: Lint or type suppression comment (@ts-ignore / @ts-expect-error / eslint-disable)** — Severity: blocker

Zero tolerance for lint/type suppression comments. Any `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `eslint-disable-next-line` is a blocker.

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

An empty stub body, a `throw new Error("Not implemented")`, or a `// TODO` placeholder in code that should be fully implemented.

- Example: `function handleError(error: Error) { throw new Error("Not implemented"); }` in production.

<a id="CHECK-DEAD-001"></a>
**CHECK-DEAD-001: Dead code introduced by the diff** — Severity: suggestion

Commented-out code blocks, or unused imports / variables / private functions / exports, added or left behind by this change. Ship live code only — recover history from version control instead of parking it in comments.

- Example: a commented-out former implementation kept "just in case"; an `import` added but never referenced.
- Skip: pre-existing dead code your change did not introduce (mention it in prose, do not block on it).

#### Common Sense

<a id="CHECK-CS-001"></a>
**CHECK-CS-001: Constant value is clearly wrong** — Severity: blocker

A constant whose value doesn't match what it represents — too large, too small, wrong units, or nonsensical for the domain.

- Example: `TIMEOUT_MS = 1` (1ms is too short for most network calls).

<a id="CHECK-CS-002"></a>
**CHECK-CS-002: Timeout too short or too long** — Severity: suggestion

Timeout values dangerously short (false failures) or too long (blocking resources). Compare against the expected operation duration.

- Example: `const requestTimeout = 0.5` for a call involving ML inference; `const sessionTimeout = 86400 * 30`.

<a id="CHECK-CS-003"></a>
**CHECK-CS-003: Unbounded growth — no limits on collections** — Severity: suggestion

A data structure that grows without bound (cache, in-memory queue, log buffer) without eviction policy or size limit.

- Example: `this.history = []` that pushes every request but never trims.

<a id="CHECK-CS-004"></a>
**CHECK-CS-004: Error message doesn't help debugging** — Severity: suggestion

An error message lacking enough context to diagnose — missing which value failed, what was expected, or what operation was attempted.

- Example: `throw new Error("invalid input")` instead of including the offending value.

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

<a id="CHECK-PR-010"></a>
**CHECK-PR-010: Task ↔ solution ↔ result alignment** — Severity: suggestion

Compare three artifacts and flag divergence in each leg. Skip a leg only when its source is absent or vague (no linked issue, or empty PR body).

- **declared task** = the linked issue (requirements / acceptance criteria from the [§1.5](#15-context-map) Context Map)
- **declared solution** = the PR title + body
- **exact result** = the diff

Legs:

- **task ↔ solution** — the PR's stated approach omits, contradicts, or silently re-scopes an issue requirement.
- **solution ↔ result** — a claim in the PR description is not backed by any hunk in the diff (asserted but absent). Undescribed changes present in the diff are the blocker CHECK-PR-001 below — do not double-report them here.
- **task ↔ result** — an issue requirement, or a codebase TODO referencing the issue (§1.5 Related work), has no corresponding change in the diff (unaddressed); or the diff addresses something the issue never asked for (scope creep) without explanation.

<a id="CHECK-PR-001"></a>
**CHECK-PR-001: Diff matches PR title/description** — Severity: blocker

The actual changes must match what the PR title and description claim. No hidden changes, no scope creep, no "while I was here" additions. (Scope-creep _claims_ and unaddressed requirements are CHECK-PR-010; this is the blocker for undescribed changes present in the diff.)

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

#### Logging

Applies when the diff adds or changes log calls or error/exception messages in service/backend code. Skip browser `console.*` in frontend code. Sensitive data in logs is CHECK-SEC-006 — do not double-report it here.

<a id="CHECK-LOG-001"></a>
**CHECK-LOG-001: Dynamic value interpolated into a log message** — Severity: suggestion

The log message must be a static string so aggregators group it across occurrences. IDs, counts, durations, hosts, and user input belong in structured context fields, not in the message via interpolation or concatenation.

- Example: `logger.info("Request " + id + " took " + ms + "ms")` → `logger.info({ request_id: id, duration_ms: ms }, "Request processed.")`.

<a id="CHECK-LOG-002"></a>
**CHECK-LOG-002: Log level mismatched to the message pattern** — Severity: suggestion

Progressive ("-ing", about-to-act) messages must be `debug`; completed business events are `info` in past tense; recoverable failures are `warning`; unrecoverable failures are `error` with a reason. A progressive message at `info`, or a bare `error` with no reason, is a mismatch.

- Example: `logger.info("Processing payment.")` → `logger.info("Payment processed.")`, or keep the wording and drop to `debug`.

<a id="CHECK-LOG-003"></a>
**CHECK-LOG-003: Non-static error or exception message** — Severity: suggestion

The string passed to an error constructor or `throw` must be static; put dynamic context as error properties (or structured fields) so error trackers group it as one issue instead of thousands.

- Example: `throw new Error("Couldn't connect to " + host)` → a static message with `host` carried as an error property.

<a id="CHECK-LOG-004"></a>
**CHECK-LOG-004: Asynchronous or fire-and-forget logging** — Severity: suggestion

Log calls must be synchronous. Wrapping them in `setImmediate`, `process.nextTick`, a `Promise` callback, or `await`-ing them solely to defer risks dropping records on shutdown and makes ordering non-deterministic.

- Example: `setImmediate(() => logger.info("Request processed."))` → call `logger.info(...)` directly.

<a id="CHECK-LOG-005"></a>
**CHECK-LOG-005: Logging an error at the throw site** — Severity: suggestion

A function that throws should not also log the same failure — the error carries the context and the handler logs it once. Logging at both the raise and the catch sites double-reports the same incident.

<a id="CHECK-LOG-006"></a>
**CHECK-LOG-006: Large or binary payload logged in full** — Severity: suggestion

Binary or oversized data (audio, images, encoded blobs, whole buffers) logged in full. Log its byte length (and an optional bounded preview), not the content. Useful text such as model prompts/completions may be logged in context fields when the pipeline can handle the volume.

#### Documentation

Applies to repositories carrying a `docs/` folder and `README.md`. Skip when the diff changes neither documented behavior nor documentation.

<a id="CHECK-DOC-001"></a>
**CHECK-DOC-001: Docs not updated in the same PR as the code** — Severity: suggestion

Documentation ships with the code that changes it. A diff that adds or alters a documented behavior, endpoint, or area without updating the corresponding `docs/*.md` (or `README.md`) in the same PR is incomplete.

<a id="CHECK-DOC-002"></a>
**CHECK-DOC-002: New or renamed doc missing from the README index** — Severity: suggestion

The root `README.md` Documentation section is the single index — every `.md` under `docs/` (at any depth) must be listed there. A new or renamed `docs/*.md` not added to the index is a finding.

<a id="CHECK-DOC-003"></a>
**CHECK-DOC-003: Doc filename not kebab-case or not self-descriptive** — Severity: nitpick

`docs/*.md` files must be `kebab-case`, self-descriptive, and share a domain prefix with their siblings (e.g. `tts-google.md`, `tts-elevenlabs.md`, not `elevenlabs.md`). A subfolder must not carry its own `readme.md`; the root README is the only index.

<a id="CHECK-DOC-004"></a>
**CHECK-DOC-004: Doc file too large or covering multiple areas** — Severity: nitpick

A `docs/*.md` file exceeds ~5000 characters or documents more than one area. Split it; keep code examples minimal (link to source, explain the "why" in prose).

#### Service Standards

Applies when the diff adds or changes a backend service's API, entrypoint, or runtime config. Skip libraries, frontend-only changes, and diffs that touch none of these. Secrets in code are CHECK-SEC-001 and missing tests are CHECK-TEST-008 — do not double-report them here.

<a id="CHECK-SVC-001"></a>
**CHECK-SVC-001: New or changed HTTP API without an OpenAPI schema** — Severity: suggestion

A new or changed public HTTP endpoint must have a matching OpenAPI/JSON schema, and a breaking change must be versioned with backward compatibility rather than altering an existing version in place.

<a id="CHECK-SVC-002"></a>
**CHECK-SVC-002: Service entrypoint without health checks** — Severity: suggestion

A new long-running service must expose liveness, readiness, and startup health checks for orchestration. Flag a service entrypoint that wires none.

<a id="CHECK-SVC-003"></a>
**CHECK-SVC-003: Unstructured service logging** — Severity: suggestion

Service logs must be structured JSON carrying a correlation/trace ID for cross-service tracing (the Logging checks then govern their quality). Plain `console.log` or free-form string logs in a service are a finding.

<a id="CHECK-SVC-004"></a>
**CHECK-SVC-004: Runtime or language version below the supported floor** — Severity: nitpick

A new service must target the supported runtimes (e.g. Node.js 22+ LTS with TypeScript 5.8+, or Bun 1.2.19+ with TypeScript 5.8+). A manifest pinning an older floor is a finding.

### 2.4 Aggregate Findings

1. Collect every finding from Phase 2.3 as `{ severity, file, line, rule, title, detail }`.
2. Deduplicate by `(file, line)` — if the same location matches more than one check, keep the higher severity (`blocker` > `suggestion` > `nitpick`) and merge their `rule` codes into one bare comma-separated list (e.g. `CHECK-BUG-002, CHECK-AI-002`). Findings with a `null` line are never merged.
3. Order the merged list by severity: blockers first, then suggestions, then nitpicks.
4. Proceed to Phase 3 with this list.

### 2.5 Rule Codes

Render each rule code based on whether `RULES_DOC_URL` (from Input resolution) was supplied:

**When `RULES_DOC_URL` is set** — emit a markdown link to the code's anchor in this file:

- Single code → `[CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002)`.
- Shared location (multiple codes) → `[[CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002), [CHECK-AI-002](<RULES_DOC_URL>#CHECK-AI-002)]`.

Substitute the resolved `RULES_DOC_URL` value verbatim — do not invent a different host or path. The `#CHECK-...` fragment must match the code exactly so it lands on the right anchor.

**When `RULES_DOC_URL` is absent** (e.g. a manual local run) — emit the bare code as plain text, no link and no brackets:

- Single code → `CHECK-BUG-002`.
- Shared location → `CHECK-BUG-002, CHECK-AI-002`.

In both modes, append nothing when a finding has no rule code (do not emit `[UNSPECIFIED]`).

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
    {"path": "src/file.ts", "line": 42, "body": "🚧 Issue description"},
    {"path": "src/other.ts", "line": 15, "body": "🙋‍♂️ Suggestion here"},
    {"path": "src/calc.ts", "line": 8, "startLine": 7, "body": "🚧 Off-by-one in the running sum [CHECK-BUG-003](<RULES_DOC_URL>#CHECK-BUG-003)", "suggestion": "    for (let i = 0; i < n; i++)\n        total += items[i];"}
  ]
}
```

`startLine` (first line of a multi-line range) and `suggestion` (verbatim replacement for the anchored line(s)) are optional per-comment fields — emit them only for concrete, mechanical fixes (see [Code suggestions](#code-suggestions)).

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
  "reviewComment": "Adds retry logic to the payment webhook handler.\n\n### 🚧 Blockers\n\n1. **Missing idempotency check** - `src/webhooks/payment.ts:45` - Retries can cause duplicate charges [CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002)\n\n### ⛔ Request Changes\n\nAdd idempotency key validation before processing payment.",
  "inlineComments": [
    {
      "path": "src/webhooks/payment.ts",
      "line": 45,
      "body": "🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002)"
    }
  ]
}
```

**Example: approve with suggestions (non-blocking)**

```json
{
  "verdict": "approve",
  "reviewComment": "Adds retry logic to the payment webhook handler.\n\n### 🙋‍♂️ Suggestions\n\n- `src/webhooks/payment.ts:62` - Consider exponential backoff for retries [CHECK-ARCH-002](<RULES_DOC_URL>#CHECK-ARCH-002)\n\n### 👍 Approve",
  "inlineComments": [
    {
      "path": "src/webhooks/payment.ts",
      "line": 62,
      "body": "🙋‍♂️ Consider exponential backoff for retries [CHECK-ARCH-002](<RULES_DOC_URL>#CHECK-ARCH-002)"
    }
  ]
}
```

**reviewComment body template (ONLY when there are findings):**

Every blocker, suggestion, and nitpick line ends with the rule code rendered per [§2.5](#25-rule-codes) (e.g. `[CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002)`). If two checks flagged the same `(path, line)`, render the merged form `[[CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002), [CHECK-AI-002](<RULES_DOC_URL>#CHECK-AI-002)]`. Build the links yourself from `RULES_DOC_URL`. When a finding has no rule code, omit the suffix entirely.

```markdown
[1 factual sentence: what this PR changes — no quality judgment]

### 🚧 Blockers

1. **[Title]** - `src/path/to/file.ts:NN` - [Problem in 1 line] [CHECK-BUG-XXX](<RULES_DOC_URL>#CHECK-BUG-XXX)

### 🙋‍♂️ Suggestions

- `src/path/to/file.ts:NN` - [Recommendation in 1 line] [CHECK-AI-XXX](<RULES_DOC_URL>#CHECK-AI-XXX)

### 💡 Nitpicks

- `src/path/to/file.ts:NN` - [Optional fix in 1 line] [CHECK-CPLX-XXX](<RULES_DOC_URL>#CHECK-CPLX-XXX)

### ⛔ Request Changes / ### 👍 Approve

[1 sentence: what must change — ONLY for requestChanges. Omit for approve.]
```

### inlineComments Usage

Add inline comments for issues with specific code locations:

- **🚧 Blocker** - Always add inline comment at exact location if location is specific
- **🙋‍♂️ Suggestion** - Add if location is specific
- **💡 Nitpicks** - Optional, can be in summary only

Each inline comment: 1-2 sentences, start with severity emoji, end with the rule code rendered per [§2.5](#25-rule-codes) (e.g. `🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002)`).

### Code suggestions

Add an optional `suggestion` to an inline comment when the fix is concrete and mechanical — a rename, a guard clause, a corrected operator — and you can write it as exact replacement text. The action renders it as a one-click GitHub suggestion block ("Commit suggestion").

- `suggestion` REPLACES the anchored line(s). Reproduce the original line(s) verbatim except for your change, **including leading indentation** — GitHub applies the text as-is, so a stray space silently reindents the file.
- Provide raw replacement code only: no ` ```suggestion ` fence, no `+`/`-` diff markers, no prose (the action wraps it).
- Single-line fix: set `line` only. Multi-line fix: set `startLine` (first line) and `line` (last line) over a **contiguous range fully inside the diff**. If the fix touches lines outside the diff, describe it in prose and omit `suggestion`.
- Emit `suggestion` only when confident it applies cleanly; otherwise keep the prose finding alone.

### Deduplication Rules

- NEVER mention the same issue in BOTH reviewComment AND inlineComments
- If adding inline comment → mention location in reviewComment but don't repeat full description
- If issue location is out-of-diff → put in reviewComment only, skip inlineComments

### Include

- ALWAYS full paths for all file references (e.g., `src/services/payment/processor.ts:66`, NOT `processor.ts:66`)
- Direct, confident language
- Clear verdict (rationale only when requesting changes)
- Rule code rendered per [§2.5](#25-rule-codes) (`[<CODE>](<RULES_DOC_URL>#<CODE>)`, or merged `[[<CODE1>](<RULES_DOC_URL>#<CODE1>), [<CODE2>](<RULES_DOC_URL>#<CODE2>)]` for a shared location) on every finding line (blocker, suggestion, nitpick) and every `inlineComments.body`; omit the suffix entirely when no rule code is available

### Exclude

- Code examples or implementation suggestions in the comment prose — put a concrete, mechanical fix in the structured `suggestion` field instead (see Code suggestions); it renders as a one-click GitHub suggestion block
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
