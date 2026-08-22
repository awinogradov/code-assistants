---
name: pr-answer
description: Answer a user comment on a PR review and update review state if needed
argument-hint: "REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> PR_AUTHOR: <author-login> COMMENT_BODY: <text> COMMENT_PATH: <path> COMMENT_LINE: <line> NEEDS_REVERDICT: <true|false> RULES_DOC_URL: <url>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(gh *)
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

Read [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md) for the ordered context-acquisition chain; this skill passes the review-scoped `includePatterns` (repomix tier only) shown below. Read [`github-review-fetch.md`](../shared-rules/references/github-review-fetch.md) for the review-thread helper invocation and its output contract.

```
Acquire codebase context: follow the shared repomix-snapshot chain,
  passing `includePatterns`: ".claude/**, **.md, **.yml, .github/**"

Fetch review threads: run the shared github-review-fetch helper via Bash
  with <REPO>, <PR_NUMBER>, and <PR_AUTHOR>
```

After both complete, store the selected context source (and its `outputId` when the repomix tier was selected). Use the helper's JSON to understand the full review history, including REVIEWER-specific reviews and comments; surface a non-null `fetchError` per the shared block instead of treating the fetch as empty.

**Read the pack, don't dump it.** Pull only targeted context via the selected source's read contract (`graphify` queries, or `grep_repomix_output` / sliced `read_repomix_output`); never read the whole pack. Most comment replies need no codebase lookup at all — skip the context reads entirely unless the comment points you at specific other code to verify.

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

- If wrong (fix already committed): "You're right, [reason]. Fixed in [<sha>](<repo-commit-url>/<sha>)."
- If wrong (no commit yet): "You're right, [reason]. Resolving this."
- If right: "[Explanation of why this is still an issue]."
- If needs discussion: "[Acknowledge point], however [concern]."
- If question: "[Direct answer]."

Format the reply per [RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md) — the **Reference formatting & readability** rules inlined at the end of this skill; they apply to the text inside the `reply` string value, not the JSON envelope. The reference kind that recurs here is the commit SHA: when the reply cites the commit that fixes the thread, render the SHA as a markdown link `[<sha>](<repo-commit-url>/<sha>)` built from `REPO` — never a bare or backticked SHA. Because replies post as GitHub comments, every other reference resolves only as an absolute link built from `REPO`: render any `CHECK-` rule code as a `RULES_DOC_URL` link exactly as the [`pr-review` skill's §2.5](../pr-review/SKILL.md#25-rule-codes) does, and link any file, doc, skill, agent, or section you cite as a `<repo-blob-url>/path#anchor` URL — never a bare name or a repo-relative path (relative paths do not resolve in a comment). Before returning the reply, self-check it: a bare 7–40-char hex token or a bare tracker id (`[A-Z][A-Z0-9]*-[0-9]+`) is a violation — link it per the rules above.

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

Only provide `updatedReviewComment` if `updatedVerdict` is non-null. Follow the same format as the original review body (see the pr-review skill for format rules) — including `CHECK-` rule codes rendered exactly per the [`pr-review` skill's §2.5](../pr-review/SKILL.md#25-rule-codes). Do not read agent files.

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

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
