---
name: pr-review
description: Review a pull request and provide constructive feedback with structured verdict. Used by awinogradov/code-review-action
argument-hint: "REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> PR_AUTHOR: <author-login> RULES_DOC_URL: <url> (all but RULES_DOC_URL fall back to gh when omitted)"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Agent
  - Bash(gh *)
  - Bash(echo *)
  - MCP(github:*)
  - Bash(command -v graphify)
  - Bash(graphify *)
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

You review the whole PR yourself in a single pass: load context, evaluate the diff against every check in [Phase 2](#phase-2-review-the-diff), then emit one structured verdict. There are no review sub-agents — [Phase 2](#phase-2-review-the-diff) is the complete rubric.

---

## Phase 1: Context Loading

### 1.1 PR Context

Fetch PR metadata and the diff:

```bash
gh pr view <PR_NUMBER> -R <REPO> --json title,body,files,commits,reviews,latestReviews,comments,reviewDecision,headRefOid,baseRefOid
gh pr diff <PR_NUMBER> -R <REPO>
```

Fetch the diff exactly once and review it in-model. Never embed the diff more than once.

This `gh pr view` output is the authoritative source for the PR title/body/diff and prior-review verdicts: `reviews`/`latestReviews` carry each prior review's verdict and summary body (the body lists that round's findings). Per-line inline annotations are NOT in any `gh pr view` field — load them via the read-only `gh api` call the `fetch-pr-reviews` agent makes in [§1.2](#12-load-context-via-sub-agents) (the review action now permits `gh api` GETs; only write forms are blocked). A denied or empty fetch must never be silently treated as "no prior findings" (that path produces an empty, content-free approval).

Treat the prior review **bodies** ([§1.1](#11-pr-context)) plus the inline threads loaded by `fetch-pr-reviews` ([§1.2](#12-load-context-via-sub-agents)) as the record of past findings: the review skill writes a self-contained summary body for every non-empty review (see [reviewComment Format](#reviewcomment-format-30-lines-max)), and the inline threads carry the per-line detail. With both loaded, a follow-up review sees exactly what each prior round flagged and where — do not bail when one source is empty; cross-check the other.

### 1.2 Load Context via Sub-Agents

Extract the linked issue ID from PR metadata. Check in order, stop at first match:

1. **PR body `Issues:` section** — lines starting with `Closes` or `Related to` followed by a ticket ID; the id may be bare (`#12`, `ENG-123`) or inside a tracker issue URL (`https://linear.app/<workspace>/issue/ENG-123/<slug>`) — extract the `#N` / `KEY-N` token either way
2. **Branch name** — leading `[a-z]+-[0-9]+` segment, convert to UPPERCASE

Load the remaining context in parallel — the codebase snapshot, the prior inline review threads, and (when an issue is linked) the linked-issue context plus the related TODOs / issue references in the codebase. Prior-review verdicts and summary bodies already come from the [§1.1](#11-pr-context) `gh pr view` output; the `fetch-pr-reviews` agent adds the per-line inline annotations via read-only `gh api`, returning a categorized summary (raw API output stays out of this context).

Read [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md) for the ordered context-acquisition chain; this skill passes the review-scoped `includePatterns` (repomix tier only) shown below.

```
Acquire codebase context: follow the shared repomix-snapshot chain,
  passing `includePatterns`: ".claude/**, **.md, **.yml, .github/**"

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

After all calls complete, store the selected context source (and its `outputId` when the repomix tier was selected), the categorized review threads from `fetch-pr-reviews`, the issue context from `resolve-issue-context`, and the TODOs / issue references from `search-codebase-todos`. Use these plus the prior-review verdicts from [§1.1](#11-pr-context) for the round handling below.

**Read the pack, don't dump it.** The context source exists so you can pull _targeted_ context on demand — via its read contract: `graphify` queries on the graph tier, or `grep_repomix_output` (regex + `contextLines`) and `read_repomix_output` with a specific `startLine`/`endLine` slice on the repomix tier. NEVER `read_repomix_output` over the whole range (that loads the entire codebase into context). When the diff is self-contained and needs no cross-file lookup (the common case), don't read the pack at all — pull cross-file context only for checks that need it (e.g. architecture reuse, duplicated logic).

### 1.3 Review Round Handling

**First review (no previous reviews by REVIEWER):**

- Start with a greeting: ONE short sentence that @-mentions PR_AUTHOR — the @-mention is what triggers their notification. Vary the wording each time in your own voice; no praise, no round-labeling, no elaboration after it.
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

Read the project's own conventions before judging the diff — you enforce them, so you must load them first (mirrors the [`digest-repo-standards` agent](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-repo-standards.md) that the `plan` skill's context fan-out uses):

- **`CODE_REVIEW.md` (consumer review rules — check first)** — if a non-empty `CODE_REVIEW.md` exists at the repository root, read it in full as the applicable-standards source and SKIP the README + `docs/*`, `rfc/`, and `principles/` bullets below: the file is the consumer's distilled, review-ready rules corpus, so its rules apply as written there — ids, severities, source citations; a rule with no declared severity is a suggestion. The [Consumer Review Rules check](#consumer-review-rules) enforces it. A `CODE_REVIEW.md` the diff itself modifies is enforced at its **base-branch version** — fetch it via `gh api repos/<REPO>/contents/CODE_REVIEW.md?ref=<baseRefOid>` (from [§1.1](#11-pr-context)) — so a PR cannot legalize its own diff by editing the rules. The CLAUDE.md bullet and the external lookups below apply on both branches of this check.
- **CLAUDE.md (stack rules)** — read the repository-root `CLAUDE.md`; map each changed line to the rule it must satisfy.
- **README + `docs/*` (project conventions)** — read the root `README.md` and the docs it links; treat `docs/` as the source of truth for project-specific conventions. When the root README carries no docs index, fall back to `docs/README.md`, then to the Glob `docs/*.md` file names.
- **`rfc/` (versioned standards)** — if `rfc/` exists at the repository root, build a standards inventory and read the diff-relevant standards; the [Repository Standards checks](#repository-standards-rfcs) enforce them:
  - **Inventory** — read the `rfc/README.md` index table into `{id, title, status, path}`; when it is absent, Glob `rfc/[0-9]*.md` and read each file's frontmatter block. Derive a missing id/title from the `NNNN-slug` filename (or the first H1). A missing or unparseable `status` counts as Draft — record it as defaulted. `Superseded` entries are never enforcement sources.
  - **Selection** — match each entry's title+slug tokens against the changed file paths and the diff's visible domains (log calls → a logging standard, HTTP routes → an API standard, new files → a file-structure standard). When in doubt whether a standard applies, load it — capped at 3 standards per review, ranked by match strength; record dropped candidates in the Context Map (no silent truncation).
  - **Reads** — use the Read tool on matched standards (do not rely on the pack; a fallback pack may omit nested markdown); for a standard longer than ~300 lines, read only the matched sections. An RFC the diff itself modifies is enforced at its **base-branch version** — fetch it via `gh api repos/<REPO>/contents/<path>?ref=<baseRefOid>` (from [§1.1](#11-pr-context)) — so a PR cannot legalize its own diff by editing the standard; the hygiene checks still apply to the modified version.
- **`principles/` (long-lived values)** — if `principles/` exists at the repository root, read its `README.md` index and any principle whose title matches the diff's domain; the [Repository Principles check](#repository-principles) enforces them. The folder is root-only, and its entries carry no `status` frontmatter — a principle is prose, never a blocking source.
- **context7 / Ref / Exa** — MANDATORY for any unfamiliar library or API the diff touches; never guess an API's behavior.
- **Perplexity** — web search for general or architectural questions.

### 1.5 Context Map

[Phase 1](#phase-1-context-loading) is the single context-gathering pass. Record a compact map; [Phase 2](#phase-2-review-the-diff) reasons over it without re-fetching the diff or re-reading the pack:

- **PR diff** — changed files and the one-line role of each change ([§1.1](#11-pr-context)).
- **Linked-issue requirements** — acceptance criteria from `resolve-issue-context` ([§1.2](#12-load-context-via-sub-agents)), or "no linked issue".
- **Related work** — TODOs and `#<issue>` references in the codebase from `search-codebase-todos` ([§1.2](#12-load-context-via-sub-agents)): flag whether the diff resolves or conflicts with a related TODO, leaves a referenced issue half-addressed, or duplicates work tracked elsewhere; "none" when no issue is linked or none found.
- **Prior-review findings** — unresolved findings from prior review bodies ([§1.1](#11-pr-context)) and inline threads from `fetch-pr-reviews` ([§1.2](#12-load-context-via-sub-agents)); empty on first review.
- **Project conventions** — the CLAUDE.md / README / `docs/*` points that bear on the diff ([§1.4](#14-project-context-read-before-reviewing)).
- **Applicable standards** — name the source first. When the [§1.4](#14-project-context-read-before-reviewing) check-first tier fired: `CODE_REVIEW.md`, plus the rule ids that bear on the diff. Otherwise the discovered inventory: the standards and any `principles/` values selected in [§1.4](#14-project-context-read-before-reviewing), each as id + status (marked "defaulted" when the status was inferred) with a one-line why, plus any dropped candidates; "none" when nothing matched or the sources are absent. This map is the audit log of what was loaded and why.
- **Codebase pointers** — only the targeted pack-`grep` hits pulled for cross-file checks; "none" when the diff is self-contained.
- **Stack** — `agents.rules` value (drives [§2](#phase-2-review-the-diff) thresholds), or `unknown`.

---

## Phase 2: Review the Diff

Review the diff against **all** checks below in a single pass and collect findings, reasoning over the [§1.5](#15-context-map) Context Map rather than re-fetching the diff or re-reading the pack to reconstruct what it already holds. Each finding is `{ severity, file, line, rule, title, detail }`: `severity` is `blocker | suggestion | nitpick`; `line` is `null` for out-of-diff findings; `rule` is the `CHECK-` code from the matched check (or `null` when a finding maps to no defined check — do NOT substitute `UNSPECIFIED`).

### 2.1 Detect Stack

Use the **Stack** already recorded in the [§1.5 Context Map](#15-context-map) — the `agents.rules` value (e.g. `Bun`, `NodeJS+React`, `Bun+React+Tailwind`, `NodeJS+React+Tailwind`), or `unknown` when `package.json` or the field is missing. Do not re-read `package.json` here; §1.5 already captured it.

### 2.2 Review Principles

These rules are mandatory. Apply them exactly as written. Exceptions are only those enumerated here or named by a check's own text.

- **Read context to understand a rule; never to excuse it.** You may read surrounding code and configuration to understand what a rule means in this codebase.
- **Project config files describe tooling behavior, not review policy.** `tsconfig.json`, `eslint.config.ts`, `.eslintrc`, `tailwind.config.ts` describe what the local toolchain permits — not what this review permits. They are never a source of exceptions.
- **Prevalence is evidence of debt, not license.** Each new violation is a finding even if the codebase is already full of them. "Everyone does it" does not downgrade a finding.
- **A check may be skipped only when:** (a) the rule's stated scope does not match the diff (wrong stack, wrong file type, no matching diff pattern), or (b) the rule text itself names an exception that applies. "Too hard to fix" and "project settings allow it" are not grounds.
- **Severity is fixed.** A rule declared as blocker is reported as blocker. When in doubt, use the severity the rule declares. Do not invent intermediate severities.
- **Evaluate only changes visible in the diff** (lines prefixed with `+` or `-`). Skip checks that do not apply to the diff.

### 2.3 Review Checks

Each check below carries an HTML anchor so this skill can link its `CHECK-` code back to this file (see [§2.5](#25-rule-codes)). Every `<a id="...">` anchor lives in this file, on its rule's index line — never move an anchor into a `references/` file.

The full rule bodies live in per-family files under [`references/`](./references/). Each family below keeps its applicability precondition and a one-line-per-rule index here; the [§1.5](#15-context-map) Context Map (stack, changed files, presence of a root `CODE_REVIEW.md` or of `rfc/`, `docs/`, `principles/` folders) already determines which preconditions hold. Before applying a family whose precondition holds for this PR, read its `references/checks-*.md` file for the full rule bodies. A family whose precondition fails is applied from the index alone — i.e. skipped without reading its file.

#### Correctness & Bugs

- <a id="CHECK-BUG-001"></a>**CHECK-BUG-001** (blocker) — Wrong variable referenced
- <a id="CHECK-BUG-002"></a>**CHECK-BUG-002** (blocker) — Shared mutable state across async tasks
- <a id="CHECK-BUG-004"></a>**CHECK-BUG-004** (blocker) — Incorrect serialization/deserialization
- <a id="CHECK-PERF-001"></a>**CHECK-PERF-001** (suggestion) — Repeated I/O or query inside a loop (N+1)
- <a id="CHECK-PERF-002"></a>**CHECK-PERF-002** (suggestion) — Quadratic or unbounded per-item work

Rule details: read [references/checks-correctness-bugs.md](./references/checks-correctness-bugs.md) before applying this family.

#### Security

- <a id="CHECK-SEC-001"></a>**CHECK-SEC-001** (blocker) — Hardcoded secret or credential
- <a id="CHECK-SEC-002"></a>**CHECK-SEC-002** (blocker) — Injection via unsanitized input
- <a id="CHECK-SEC-003"></a>**CHECK-SEC-003** (blocker) — Missing or broken access control
- <a id="CHECK-SEC-004"></a>**CHECK-SEC-004** (blocker) — Weak or misused cryptography
- <a id="CHECK-SEC-005"></a>**CHECK-SEC-005** (blocker) — Unsafe deserialization or dynamic evaluation of untrusted input
- <a id="CHECK-SEC-006"></a>**CHECK-SEC-006** (suggestion) — Secrets or PII written to logs or responses
- <a id="CHECK-SEC-007"></a>**CHECK-SEC-007** (suggestion) — External input crosses a trust boundary without validation

Rule details: read [references/checks-security.md](./references/checks-security.md) before applying this family.

#### Testing

- <a id="CHECK-TEST-001"></a>**CHECK-TEST-001** (blocker) — Testing mock behavior, not real behavior
- <a id="CHECK-TEST-002"></a>**CHECK-TEST-002** (blocker) — Business logic duplicated in test
- <a id="CHECK-TEST-003"></a>**CHECK-TEST-003** (suggestion) — Mock without verifying call arguments
- <a id="CHECK-TEST-004"></a>**CHECK-TEST-004** (suggestion) — Error path untested
- <a id="CHECK-TEST-005"></a>**CHECK-TEST-005** (suggestion) — Edge cases of modified function not tested
- <a id="CHECK-TEST-006"></a>**CHECK-TEST-006** (suggestion) — Test fixtures duplicated across files
- <a id="CHECK-TEST-007"></a>**CHECK-TEST-007** (suggestion) — Test asset (fixture data) inlined as giant string
- <a id="CHECK-TEST-008"></a>**CHECK-TEST-008** (suggestion) — New public function without test
- <a id="CHECK-TEST-009"></a>**CHECK-TEST-009** (suggestion) — Flaky test indicator — sleep or retry in test

Rule details: read [references/checks-testing.md](./references/checks-testing.md) before applying this family.

#### Complexity & Readability

- <a id="CHECK-CPLX-001"></a>**CHECK-CPLX-001** (blocker) — Function exceeds 100 lines
- <a id="CHECK-CPLX-002"></a>**CHECK-CPLX-002** (blocker; threshold by stack) — Nesting depth too deep
- <a id="CHECK-CPLX-003"></a>**CHECK-CPLX-003** (suggestion) — Cyclomatic complexity exceeds 15
- <a id="CHECK-CPLX-004"></a>**CHECK-CPLX-004** (blocker) — File exceeds 1000 lines
- <a id="CHECK-CPLX-005"></a>**CHECK-CPLX-005** (blocker) — Misleading function/variable name
- <a id="CHECK-CPLX-006"></a>**CHECK-CPLX-006** (suggestion) — Inconsistent naming within module
- <a id="CHECK-CPLX-007"></a>**CHECK-CPLX-007** (suggestion) — Magic numbers or magic strings
- <a id="CHECK-CPLX-008"></a>**CHECK-CPLX-008** (suggestion) — Long parameter list (>9 total or >6 positional)
- <a id="CHECK-CPLX-009"></a>**CHECK-CPLX-009** (suggestion) — Comment explains "what" instead of "why"

Rule details: read [references/checks-complexity-readability.md](./references/checks-complexity-readability.md) before applying this family.

#### Platform Standards

- <a id="CHECK-PLAT-001"></a>**CHECK-PLAT-001** (blocker) — No issue IDs in commit messages
- <a id="CHECK-PLAT-002"></a>**CHECK-PLAT-002** (blocker) — Lint or type suppression comment (@ts-ignore / @ts-expect-error / eslint-disable)
- <a id="CHECK-PLAT-003"></a>**CHECK-PLAT-003** (suggestion) — Wrong validation library

Rule details: read [references/checks-platform-standards.md](./references/checks-platform-standards.md) before applying this family.

#### Architecture & Patterns

- <a id="CHECK-ARCH-001"></a>**CHECK-ARCH-001** (suggestion) — Shared library utility not used
- <a id="CHECK-ARCH-002"></a>**CHECK-ARCH-002** (suggestion) — Reinventing stdlib or well-known library
- <a id="CHECK-ARCH-003"></a>**CHECK-ARCH-003** (suggestion) — Copy-paste from another service without abstraction
- <a id="CHECK-ARCH-004"></a>**CHECK-ARCH-004** (suggestion) — New dependency for trivial functionality
- <a id="CHECK-DEP-001"></a>**CHECK-DEP-001** (suggestion) — Deprecated or unmaintained dependency added
- <a id="CHECK-DEP-002"></a>**CHECK-DEP-002** (suggestion) — Dependency with incompatible or missing license
- <a id="CHECK-ARCH-007"></a>**CHECK-ARCH-007** (suggestion) — Inconsistent error handling pattern
- <a id="CHECK-ARCH-008"></a>**CHECK-ARCH-008** (suggestion) — Inconsistent async pattern
- <a id="CHECK-ARCH-010"></a>**CHECK-ARCH-010** (suggestion) — Duplicated logic across files

Rule details: read [references/checks-architecture-patterns.md](./references/checks-architecture-patterns.md) before applying this family.

#### AI Code Smells

- <a id="CHECK-AI-001"></a>**CHECK-AI-001** (suggestion) — Unnecessary abstraction layer
- <a id="CHECK-AI-002"></a>**CHECK-AI-002** (blocker) — Output parameters (mutable args used for returning data)
- <a id="CHECK-AI-003"></a>**CHECK-AI-003** (suggestion) — Unnecessary async wrapping
- <a id="CHECK-AI-004"></a>**CHECK-AI-004** (suggestion) — Logging every line of execution
- <a id="CHECK-AI-005"></a>**CHECK-AI-005** (suggestion) — Excessive type annotations on obvious code
- <a id="CHECK-AI-006"></a>**CHECK-AI-006** (blocker) — Placeholder implementation left in production code
- <a id="CHECK-DEAD-001"></a>**CHECK-DEAD-001** (suggestion) — Dead code introduced by the diff

Rule details: read [references/checks-ai-code-smells.md](./references/checks-ai-code-smells.md) before applying this family.

#### Common Sense

- <a id="CHECK-CS-001"></a>**CHECK-CS-001** (blocker) — Constant value is clearly wrong
- <a id="CHECK-CS-002"></a>**CHECK-CS-002** (suggestion) — Timeout too short or too long
- <a id="CHECK-CS-003"></a>**CHECK-CS-003** (suggestion) — Unbounded growth — no limits on collections
- <a id="CHECK-CS-004"></a>**CHECK-CS-004** (suggestion) — Error message doesn't help debugging
- <a id="CHECK-CS-005"></a>**CHECK-CS-005** (suggestion) — Log message at wrong level
- <a id="CHECK-CS-006"></a>**CHECK-CS-006** (suggestion) — Feature flag or environment variable undocumented

Rule details: read [references/checks-common-sense.md](./references/checks-common-sense.md) before applying this family.

#### Surface Correctness

- <a id="CHECK-BUG-005"></a>**CHECK-BUG-005** (suggestion) — Unreachable code after early return
- <a id="CHECK-BUG-006"></a>**CHECK-BUG-006** (suggestion) — Timezone-naive datetime operations
- <a id="CHECK-BUG-007"></a>**CHECK-BUG-007** (suggestion) — Incorrect exception handling — catching too broadly
- <a id="CHECK-BUG-008"></a>**CHECK-BUG-008** (suggestion) — Return type mismatch with type annotation

Rule details: read [references/checks-surface-correctness.md](./references/checks-surface-correctness.md) before applying this family.

#### Surface Naming & Structure

- <a id="CHECK-CS-007"></a>**CHECK-CS-007** (suggestion) — Filename too broad for its contents
- <a id="CHECK-CS-008"></a>**CHECK-CS-008** (suggestion) — Inconsistent naming scheme across related files
- <a id="CHECK-CS-009"></a>**CHECK-CS-009** (suggestion) — New file in wrong directory

Rule details: read [references/checks-surface-naming-structure.md](./references/checks-surface-naming-structure.md) before applying this family.

#### PR Hygiene

Stack is not relevant for PR hygiene — these apply universally.

- <a id="CHECK-PR-010"></a>**CHECK-PR-010** (suggestion) — Task ↔ solution ↔ result alignment
- <a id="CHECK-PR-001"></a>**CHECK-PR-001** (blocker) — Diff matches PR title/description
- <a id="CHECK-PR-002"></a>**CHECK-PR-002** (suggestion) — PR is atomic — single concern
- <a id="CHECK-PR-003"></a>**CHECK-PR-003** (suggestion) — PR is reviewable size (<1000 lines of meaningful diff)
- <a id="CHECK-PR-004"></a>**CHECK-PR-004** (suggestion) — No merge commits in feature branch
- <a id="CHECK-PR-005"></a>**CHECK-PR-005** (suggestion) — No "fix review" or "address feedback" commits
- <a id="CHECK-PR-006"></a>**CHECK-PR-006** (suggestion) — No unrelated file changes
- <a id="CHECK-PR-007"></a>**CHECK-PR-007** (suggestion) — Description explains "why", not just "what"
- <a id="CHECK-PR-008"></a>**CHECK-PR-008** (blocker) — Breaking changes called out
- <a id="CHECK-PR-009"></a>**CHECK-PR-009** (suggestion) — Release notes section present for user-facing changes

Rule details: read [references/checks-pr-hygiene.md](./references/checks-pr-hygiene.md) before applying this family.

#### Logging

Applies when the diff adds or changes log calls or error/exception messages in service/backend code. Skip browser `console.*` in frontend code. Sensitive data in logs is CHECK-SEC-006 — do not double-report it here.

- <a id="CHECK-LOG-001"></a>**CHECK-LOG-001** (suggestion) — Dynamic value interpolated into a log message
- <a id="CHECK-LOG-002"></a>**CHECK-LOG-002** (suggestion) — Log level mismatched to the message pattern
- <a id="CHECK-LOG-003"></a>**CHECK-LOG-003** (suggestion) — Non-static error or exception message
- <a id="CHECK-LOG-004"></a>**CHECK-LOG-004** (suggestion) — Asynchronous or fire-and-forget logging
- <a id="CHECK-LOG-005"></a>**CHECK-LOG-005** (suggestion) — Logging an error at the throw site
- <a id="CHECK-LOG-006"></a>**CHECK-LOG-006** (suggestion) — Large or binary payload logged in full

Rule details: read [references/checks-logging.md](./references/checks-logging.md) before applying this family.

#### Documentation

Applies to repositories carrying a `docs/` folder and `README.md`. Skip when the diff changes neither documented behavior nor documentation.

- <a id="CHECK-DOC-001"></a>**CHECK-DOC-001** (suggestion) — Docs not updated in the same PR as the code
- <a id="CHECK-DOC-002"></a>**CHECK-DOC-002** (suggestion) — New or renamed doc missing from the README index
- <a id="CHECK-DOC-003"></a>**CHECK-DOC-003** (nitpick) — Doc filename not kebab-case or not self-descriptive
- <a id="CHECK-DOC-004"></a>**CHECK-DOC-004** (nitpick) — Doc file too large or covering multiple areas
- <a id="CHECK-DOC-005"></a>**CHECK-DOC-005** (suggestion) — Diff contradicts a documented project convention

Rule details: read [references/checks-documentation.md](./references/checks-documentation.md) before applying this family.

#### Repository Standards (RFCs)

Applies to repositories carrying an `rfc/` folder ([§1.4](#14-project-context-read-before-reviewing) builds the inventory). Skip CHECK-RFC-001/002 when the [§1.5](#15-context-map) Applicable standards map is "none"; CHECK-RFC-003/004 apply whenever the diff touches `rfc/` files. When a violation also matches a generic check above, report that check once and cite the RFC in its detail — do not double-report. Every CHECK-RFC-001/002 finding must quote the violated clause verbatim (≤2 lines) from the standard in its detail — a finding that only paraphrases the rule is not reportable — and cite the standard by its stable ID as a `<pr-blob-url>` link (e.g. `[RFC-0003](<pr-blob-url>/rfc/0003-service-logging-standard.md)`; `<pr-blob-url>` is defined in [reviewComment Format](#reviewcomment-format-30-lines-max)).

- <a id="CHECK-RFC-001"></a>**CHECK-RFC-001** (blocker) — Diff violates an Accepted repository RFC
- <a id="CHECK-RFC-002"></a>**CHECK-RFC-002** (suggestion) — Diff conflicts with a Draft repository RFC
- <a id="CHECK-RFC-003"></a>**CHECK-RFC-003** (blocker) — Accepted RFC edited without a version bump
- <a id="CHECK-RFC-004"></a>**CHECK-RFC-004** (suggestion) — RFC file hygiene

Rule details: read [references/checks-repository-standards.md](./references/checks-repository-standards.md) before applying this family.

#### Repository Principles

Applies to repositories carrying a `principles/` folder ([§1.4](#14-project-context-read-before-reviewing) builds the inventory). Skip when the [§1.5](#15-context-map) Applicable standards map lists no principle. Principles are prose values rather than normative clauses, so this family never blocks — the same reasoning that caps CHECK-DOC-005 at suggestion; a value that must block belongs in an Accepted RFC.

- <a id="CHECK-PRINCIPLE-001"></a>**CHECK-PRINCIPLE-001** (suggestion) — Diff conflicts with a stated repository principle

Rule details: read [references/checks-repository-principles.md](./references/checks-repository-principles.md) before applying this family.

#### Consumer Review Rules

Applies to repositories carrying a root `CODE_REVIEW.md` ([§1.4](#14-project-context-read-before-reviewing) read it as the standards source). When that tier fired, skip CHECK-RFC-001/002, CHECK-DOC-005, and CHECK-PRINCIPLE-001 — their source corpus was deliberately not read; CHECK-RFC-003/004 still apply whenever the diff touches `rfc/` files, and every other generic check is unaffected. Each finding's `rule` is the consumer rule id as written in the file (e.g. `STR-2`), never CHECK-REVIEWFILE-001 itself — the code below defines the family, it does not replace the consumer's ids ([§2.5](#25-rule-codes) defines the rendering). Every finding must quote the violated rule verbatim (≤2 lines) in its detail; severity is the rule's own declaration, suggestion when it declares none.

- <a id="CHECK-REVIEWFILE-001"></a>**CHECK-REVIEWFILE-001** (severity as the violated rule declares) — Diff violates a rule in the consumer `CODE_REVIEW.md`

Rule details: read [references/checks-consumer-review-rules.md](./references/checks-consumer-review-rules.md) before applying this family.

#### Service Standards

Applies when the diff adds or changes a backend service's API, entrypoint, or runtime config. Skip libraries, frontend-only changes, and diffs that touch none of these. Secrets in code are CHECK-SEC-001 and missing tests are CHECK-TEST-008 — do not double-report them here.

- <a id="CHECK-SVC-001"></a>**CHECK-SVC-001** (suggestion) — New or changed HTTP API without an OpenAPI schema
- <a id="CHECK-SVC-002"></a>**CHECK-SVC-002** (suggestion) — Service entrypoint without health checks
- <a id="CHECK-SVC-003"></a>**CHECK-SVC-003** (suggestion) — Unstructured service logging
- <a id="CHECK-SVC-004"></a>**CHECK-SVC-004** (nitpick) — Runtime or language version below the supported floor

Rule details: read [references/checks-service-standards.md](./references/checks-service-standards.md) before applying this family.

### 2.4 Aggregate Findings

1. Collect every finding from Phase 2.3 as `{ severity, file, line, rule, title, detail }`.
2. Deduplicate by `(file, line)` — if the same location matches more than one check, keep the higher severity (`blocker` > `suggestion` > `nitpick`) and merge their `rule` codes into one bare comma-separated list (e.g. `CHECK-BUG-002, CHECK-AI-002`). Findings with a `null` line are never merged.
3. Order the merged list by severity: blockers first, then suggestions, then nitpicks.
4. Proceed to [Phase 3](#phase-3-submit-review) with this list.

### 2.5 Rule Codes

Render each rule code based on whether `RULES_DOC_URL` (from Input resolution) was supplied:

**When `RULES_DOC_URL` is set** — emit a markdown link to the code's anchor in this file:

- Single code → `[CHECK-BUG-002](<RULES_DOC_URL>#check-bug-002)`.
- Shared location (multiple codes) → `[[CHECK-BUG-002](<RULES_DOC_URL>#check-bug-002), [CHECK-AI-002](<RULES_DOC_URL>#check-ai-002)]`.

Substitute the resolved `RULES_DOC_URL` value verbatim — do not invent a different host or path. The fragment is the rule code lowercased verbatim (e.g. `#check-bug-002`), nothing prepended — GitHub rewrites each rule's `<a id>` anchor to a lowercase `user-content-*` id and fragment lookup is case-sensitive, so an uppercase fragment never lands. The link display text keeps the uppercase code.

**When `RULES_DOC_URL` is absent** (e.g. a manual local run) — emit the bare code as plain text, no link and no brackets:

- Single code → `CHECK-BUG-002`.
- Shared location → `CHECK-BUG-002, CHECK-AI-002`.

In both modes, append nothing when a finding has no rule code (do not emit `[UNSPECIFIED]`).

**Consumer rule ids** — a finding from the [Consumer Review Rules](#consumer-review-rules) family carries the consumer's own rule id, not a `CHECK-*` code, and it links into `CODE_REVIEW.md` at the PR head instead of `RULES_DOC_URL`: `[STR-2](<pr-blob-url>/CODE_REVIEW.md#str-2)` when the file carries an `<a id>` anchor for the id — the fragment is the id lowercased (GitHub rewrites `<a id="STR-2">` to a lowercase `user-content-str-2` id, and fragment lookup is case-sensitive) — or the bare id as plain text when it carries none; never guess an anchor. This rendering does not depend on `RULES_DOC_URL`.

Map `severity` to its emoji when rendering in [Phase 3](#phase-3-submit-review): `blocker` → 🚧, `suggestion` → 🙋‍♂️, `nitpick` → 💡. The emoji stays first so downstream severity filters keep working.

---

## Phase 3: Submit Review

### Issue Severity

- **🚧 Blocking** - Must fix before merge (bugs, security, missing tests, Accepted-RFC violations)
- **🙋‍♂️ Suggestions** - Should fix, can discuss (architecture, patterns)
- **💡 Nitpicks** - Optional improvement (style, naming)

### Verdict Decision Rules

This mapping is exhaustive and deterministic — every review lands in exactly one case. Apply it as written:

0. **Nothing new to report** → no structured output (review skipped)
   - Follow-up with identical findings as previous review
   - Follow-up with no findings and no unresolved issues
   - Already approved + no new commits since last approval
1. **Any 🚧 Blockers exist** → `verdict: "requestChanges"` — stated as required changes, not as a conditional approval ("Once X is fixed, approve")
2. **No blockers, only 🙋‍♂️ suggestions** → `verdict: "approve"` (suggestions are non-blocking)
3. **No issues at all** → `verdict: "approve"`, `reviewComment: ""`

A non-empty body's closing verdict header must match the `verdict` field per the header mapping in [reviewComment Format](#reviewcomment-format-30-lines-max).

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
    {"path": "src/calc.ts", "line": 8, "startLine": 7, "body": "🚧 Off-by-one in the running sum [CHECK-BUG-001](<RULES_DOC_URL>#check-bug-001)", "suggestion": "    for (let i = 0; i < n; i++)\n        total += items[i];"}
  ]
}
```

`startLine` (first line of a multi-line range) and `suggestion` (verbatim replacement for the anchored line(s)) are optional per-comment fields — emit them only for concrete, mechanical fixes (see [Code suggestions](#code-suggestions)).

### reviewComment Format (~30 lines max)

Section names are fixed because downstream tooling keys on them — use exactly the four defined in the body template below (🚧 Blockers, 🙋‍♂️ Suggestions, 💡 Nitpicks, and the closing verdict header).

**SKIP empty sections entirely. Do NOT write "None" or "N/A" - just omit the section.**

**Ticket references:** when the body cites the linked ticket, cite it as a markdown link built from the [§1.2](#12-load-context-via-sub-agents) `resolve-issue-context` `url` (e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)`) — a bare tracker id GitHub does not auto-link is dead text; fall back to the bare id only when no URL is resolvable. GitHub issue numbers stay bare (`#42` auto-links).

**File and doc links:** define `<pr-blob-url>` = `https://github.com/<REPO>/blob/<headRefOid>` (`headRefOid` from [§1.1](#11-pr-context); valid for fork PRs too — PR head commits stay reachable in the base repo via `refs/pull/N/head`). Percent-encode path characters that break markdown links (spaces → `%20`, parentheses → `%28`/`%29`, `:` → `%3A`). Then:

- **Locations and mentions** — every finding location AND every file/doc/RFC mention in prose renders as a link, wherever it appears: the leading finding location, the summary sentence, mid-description text, and inside `inlineComments` bodies. With a known line: `[<path>:<NN>](<pr-blob-url>/<path>#L<NN>)` (ranges `#L<start>-L<end>`). With no line — a plain prose mention of a repo file/doc — drop the fragment and still link the path: `[<path>](<pr-blob-url>/<path>)`. A bare `RFC-NNNN` links to its doc via the [§1.4](#14-project-context-read-before-reviewing) standards inventory even when a trailing `§X` section anchor is unresolvable (link the document; omit the anchor).
- **Only resolvable targets** — link a path from the [§1.1](#11-pr-context) `files` list or one the [§1.2](#12-load-context-via-sub-agents) snapshot / `Glob` / `gh` lookup confirmed; a standard's id resolves to its path via the [§1.4](#14-project-context-read-before-reviewing) standards inventory. An id with no resolved path, or a path with no blob at head (deleted, or a renamed-from old path), is NEVER linked by guess — keep it backticked/bare; a fabricated 404 is worse than no link. A token that is not a real target — a glob or pattern (`*.steps.ts`), a bare directory, a config key (`agents.trackers`), or an illustrative name that resolves to no repo blob — is a code specimen, not a reference: keep it backticked and never link it.
- **Anchors** — a line cite into a `.md` target inserts `?plain=1` before `#L` so the anchor lands (e.g. `[docs/setup.md:96](<pr-blob-url>/docs/setup.md?plain=1#L96)`); a section cite uses the rendered heading-anchor form `<pr-blob-url>/<path>#<heading-anchor>`, no `?plain=1`; never combine the two.
- **Inline-comment exception** — an inline comment's own anchored location stays a backticked full path (GitHub anchors it).
- **Self-check** — before emitting the structured output, scan the entire `reviewComment` (including the summary sentence, not just finding lines) and every `inlineComments` body: outside code spans/fences, any resolvable repo-relative file or doc path — with OR without a line number — a bare `RFC-NNNN` id, or a bare 7–40-char hex token is a violation unless it is one of the two allowed forms above (inline own anchor; unresolvable/no-blob-at-head path). Link paths per these rules and SHAs as `https://github.com/<REPO>/commit/<sha>`. A path that resolves to no repo blob (a glob, pattern, config key, or illustrative name) is NOT a violation — leave it backticked.

**Empty vs non-empty `reviewComment`** follows the canonical [Verdict Decision Rules](#verdict-decision-rules): use empty `""` for an approval with no findings (rule 3) — the `verdict` field drives the GitHub event, so no body text is needed; use a non-empty body for any review with findings or a `requestChanges` verdict; and when there is nothing new to report, emit no structured output at all (rule 0).

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

**Conditional fields:**

| Field           | When it applies                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startLine`     | Only for a multi-line range — `startLine` is the first line, `line` the last (see [Code suggestions](#code-suggestions))                                                         |
| `suggestion`    | Only when a concrete, mechanical fix exists as exact replacement text (see [Code suggestions](#code-suggestions))                                                                |
| `reviewComment` | Empty `""` only when approving with no findings ([Verdict Decision Rules](#verdict-decision-rules) rule 3); non-empty for any review with findings or a `requestChanges` verdict |

A non-empty body links its mentions per **File and doc links**: the summary sentence links its doc mention — "Points the retry policy in [docs/webhooks.md](<pr-blob-url>/docs/webhooks.md) at the new handler." — and mid-description prose links a no-line file mention — "the `retry*` helpers in [src/webhooks/config.ts](<pr-blob-url>/src/webhooks/config.ts) still assume single-attempt delivery" — while a glob like `*.steps.ts` stays a backticked code specimen.

**reviewComment body template (ONLY when there are findings):**

Every blocker, suggestion, and nitpick line ends with its rule code rendered per [§2.5](#25-rule-codes) (single, shared, and no-code forms as defined there).

```markdown
[1 factual sentence: what this PR changes — no quality judgment]

### 🚧 Blockers

1. **[Title]** - [src/path/to/file.ts:NN](<pr-blob-url>/src/path/to/file.ts#LNN) - [Problem in 1 line] [CHECK-BUG-XXX](<RULES_DOC_URL>#check-bug-xxx)

### 🙋‍♂️ Suggestions

- [src/path/to/file.ts:NN](<pr-blob-url>/src/path/to/file.ts#LNN) - [Recommendation in 1 line] [CHECK-AI-XXX](<RULES_DOC_URL>#check-ai-xxx)

### 💡 Nitpicks

- [src/path/to/file.ts:NN](<pr-blob-url>/src/path/to/file.ts#LNN) - [Optional fix in 1 line] [CHECK-CPLX-XXX](<RULES_DOC_URL>#check-cplx-xxx)

### ⛔ Request Changes / ### 👍 Approve

[1 sentence: what must change — ONLY for requestChanges. Omit for approve.]
```

### inlineComments Usage

Add inline comments for issues with specific code locations:

- **🚧 Blocker** - Always add inline comment at exact location if location is specific
- **🙋‍♂️ Suggestion** - Add if location is specific
- **💡 Nitpicks** - Optional, can be in summary only

Each inline comment: 1-2 sentences, start with severity emoji, end with the rule code rendered per [§2.5](#25-rule-codes).

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

- ALWAYS full paths for all file references, rendered per **File and doc links** (e.g. `[src/services/payment/processor.ts:66](<pr-blob-url>/src/services/payment/processor.ts#L66)`, NOT `processor.ts:66`)
- Direct, confident language
- Clear verdict (rationale only when requesting changes)
- Rule code rendered per [§2.5](#25-rule-codes) on every finding line (blocker, suggestion, nitpick) and every `inlineComments.body`
- File, section, doc, commit, and issue references follow the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (read it first) — build the links per **File and doc links** above. Exception: an inline comment is already anchored to its file and line by GitHub, so keep its location as a backticked full path (e.g. `src/services/payment/processor.ts:66`); apply the linking rules to the review-body prose and to any cross-file or out-of-diff reference inside inline bodies

### Exclude

The body is findings only: no praise, no meta-commentary, no statistics, no process narration — every sentence is either a finding or required by the template, and each finding states a fact and the change it calls for, not a hedged possibility. With no issues, approve silently.

Two format contracts downstream tooling keys on:

- No top-level (`##`) markdown headers — the body's only headers are the template's `###` sections
- A concrete, mechanical fix goes in the structured `suggestion` field (see [Code suggestions](#code-suggestions)), which renders as a one-click GitHub suggestion block — not as a code example in the comment prose
