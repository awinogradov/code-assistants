---
name: pr:answer
description: Answer a user comment on a PR review and update review state if needed
argument-hint: "REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> COMMENT_BODY: <text> COMMENT_PATH: <path> COMMENT_LINE: <line> RULES_DOC_URL: <url>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(gh *)
  - MCP(repomix:*)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
---

## Input

Arguments: `$ARGUMENTS`

Expected form (typically supplied by `awinogradov/code-review-action`):

- `REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> COMMENT_BODY: <text> COMMENT_PATH: <path> COMMENT_LINE: <line> RULES_DOC_URL: <url>`

## Input resolution

- **`REPO`** — `$ARGUMENTS` → `gh repo view --json nameWithOwner --jq .nameWithOwner` as fallback when invoked interactively.
- **`PR_NUMBER`** — `$ARGUMENTS` → `gh pr view --json number --jq .number` for the current branch.
- **`REVIEWER`** — `$ARGUMENTS` → `gh api user --jq .login` (the authenticated user) as fallback.
- **`COMMENT_BODY` / `COMMENT_PATH` / `COMMENT_LINE`** — `$ARGUMENTS` only. If missing when invoked interactively, abort with a clear error (these must come from the CI context).
- **`NEEDS_REVERDICT`** — `$ARGUMENTS` only (`true`/`false`); the orchestrator pre-computes this from the comment text. Defaults to `false` when absent. Gates [Phase 4](#phase-4-decide-actions)'s Verdict Update (see below).
- **`RULES_DOC_URL`** — `$ARGUMENTS` only. The action always supplies it (its `rules_doc_url` input default is the one canonical copy). When absent (e.g. a manual local run), do NOT fabricate a URL — render any `CHECK-` rule code in `updatedReviewComment` as plain text (the bare code, no link).

Do NOT prompt the user. Return an error JSON structure if required inputs cannot be resolved.

## Task

$ARGUMENTS

---

## Phase 1: Context Loading

### 1.1 PR Context and Diff

Fetch PR metadata and diff (needed locally for [Phase 3](#phase-3-evaluate) evaluation):

```bash
gh pr view <PR_NUMBER> -R <REPO> --json title,body,files,commits,reviews,comments
gh pr diff <PR_NUMBER> -R <REPO>
```

### 1.2 Load Context

Launch 2 calls **in parallel** to load codebase context and review history:

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
```

After all calls complete, store the `outputId` from the snapshot acquisition (attach or pack) response. Use the review data from `fetch-pr-reviews` to understand the full review history, including REVIEWER-specific reviews and comments.

**Read the pack, don't dump it.** Pull only targeted context via `grep_repomix_output` / sliced `read_repomix_output`; never read the whole pack. Most comment replies need no codebase lookup at all — skip the snapshot reads entirely unless the comment points you at specific other code to verify.

### 1.3 Extended Context

- **CLAUDE.md** - Project rules for evaluating correctness
- **context7/Ref/Exa** - Look up docs for unfamiliar APIs
- **Perplexity** - Web search for general info

---

## Phase 2: Analyze the Comment

Read the COMMENT_BODY carefully. If COMMENT_PATH and COMMENT_LINE are provided, the comment is a reply to an inline review thread at that location.

### Comment Classification

1. **Correction** - User says a review finding was wrong ("this is handled by...", "that's intentional because...")
2. **Question** - User asks for clarification about a finding
3. **Agreement** - User acknowledges the issue, may ask how to fix
4. **Additional context** - User provides information that changes the assessment
5. **Disagreement** - User disagrees but finding may still be valid

---

## Phase 3: Evaluate

1. If COMMENT_PATH is provided, read the code at that location
2. Check if the user's point is valid against the actual codebase
3. Look at surrounding code, imports, and related files for full context
4. If the user references other code (e.g., "see middleware.ts"), verify it

### Evaluation Rules

- **Be honest** - If the bot was wrong, acknowledge it clearly
- **Be respectful** - If the bot was right, explain why without being defensive
- **Be thorough** - Check the actual code, don't rely on memory
- **Prioritize correctness** over consistency with previous review

---

## Phase 4: Decide Actions

### Reply

Always provide a reply. Keep it concise (1-5 sentences). Be direct.

- If wrong: "You're right, [reason]. Resolving this."
- If right: "[Explanation of why this is still an issue]."
- If needs discussion: "[Acknowledge point], however [concern]."
- If question: "[Direct answer]."

Format the reply per [RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md) — the **Reference formatting & readability** rules inlined at the end of this skill; they apply to the text inside the `reply` string value, not the JSON envelope. The reference kind that recurs here is the commit SHA: when the reply cites the commit that fixes the thread, render the SHA as a markdown link `[<sha>](<repo-commit-url>/<sha>)` built from `REPO` — never a bare or backticked SHA. Because replies post as GitHub comments, every other reference resolves only as an absolute link built from `REPO`: render any `CHECK-` rule code as a `RULES_DOC_URL` link exactly as the [`pr:review` skill's §2.5](../pr:review/SKILL.md#25-rule-codes) does, and link any file, doc, skill, agent, or section you cite as a `<repo-blob-url>/path#anchor` URL — never a bare name or a repo-relative path (relative paths do not resolve in a comment).

### Thread Resolution

Add to `resolveComments` when:

- The bot's finding was incorrect
- The user has addressed/will address the issue
- The user provided valid justification

Do NOT resolve when:

- The finding is still valid despite user's response
- The user only asked a question (not a correction)

### Verdict Update

**PR-level resolution language** is prose asserting the PR's blocking verdict is lifted or the PR is now approvable — e.g. "resolved", "this is addressed", "looks resolved", "good to go", "approved". It is distinct from thread-level resolution (`resolveComments`), which only marks one specific finding handled. PR-level resolution language is allowed ONLY when this pass emits `updatedVerdict: "approve"`.

**Invariant:** the reply and the verdict must never diverge — the bot must not use PR-level resolution language while leaving a blocking verdict in place (issue #275).

**Gate:** Only perform the verdict pass when `NEEDS_REVERDICT` is `true`. When it is `false`, set `updatedVerdict: null` and `updatedReviewComment: null` and do NOT scan threads or re-review. The reply may still acknowledge the specific fix, and you may add the discussed finding to `resolveComments`, but it MUST NOT use PR-level resolution language — phrase it as state, not a promise: "Noted — the blocking verdict stands until a re-review confirms the fix." A genuine verdict change still lands on the next review run (a push) or when the author explicitly asks for a re-review.

When `NEEDS_REVERDICT` is `true`, decide from the LIVE unresolved bot-thread state — not the author's claim — by checking ALL remaining unresolved bot threads (not just the one being discussed):

- If ALL 🚧 blockers are now resolved/retracted → `updatedVerdict: "approve"` (PR-level resolution language is now permitted in the reply)
- If this creates a NEW blocker → `updatedVerdict: "requestChanges"`
- Otherwise → `updatedVerdict: null` (no change); the reply MUST NOT claim PR-level resolution

### Review Body Update

Only provide `updatedReviewComment` if `updatedVerdict` is non-null. Follow the same format as the original review body (see the pr:review skill for format rules) — including `CHECK-` rule codes rendered exactly as in the [`pr:review` skill's §2.5](../pr:review/SKILL.md#25-rule-codes): when `RULES_DOC_URL` is set, as markdown links (single: `[CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002)`; shared: `[[CHECK-BUG-002](<RULES_DOC_URL>#CHECK-BUG-002), [CHECK-AI-002](<RULES_DOC_URL>#CHECK-AI-002)]`); when it is absent, as the bare code in plain text (single: `CHECK-BUG-002`; shared: `CHECK-BUG-002, CHECK-AI-002`). Do not read agent files.

---

## Output Format

```json
{
  "reply": "Concise response to the user's comment",
  "resolveComments": [
    {"path": "src/file.ts", "line": 42}
  ],
  "updatedVerdict": "approve" | "requestChanges" | "comment" | null,
  "updatedReviewComment": "Updated review body or null"
}
```

### Rules

- `reply` is REQUIRED and must be non-empty
- `resolveComments` defaults to empty array
- `updatedVerdict` defaults to null (no change)
- `updatedReviewComment` must be provided when `updatedVerdict` is non-null
- `updatedReviewComment` must be null when `updatedVerdict` is null

### Include

- Direct, confident language
- References to specific code when relevant
- Acknowledgment when the bot was wrong

### Exclude

- Defensive language or excuses
- Lengthy explanations when a short one suffices
- Repeating the user's comment back to them
- Code examples or implementation suggestions

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
