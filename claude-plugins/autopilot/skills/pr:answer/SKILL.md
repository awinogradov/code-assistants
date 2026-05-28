---
name: pr:answer
description: Answer a user comment on a PR review and update review state if needed
argument-hint: "REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> COMMENT_BODY: <text> COMMENT_PATH: <path> COMMENT_LINE: <line>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(gh *)
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

- `REPO: <owner/repo> PR_NUMBER: <number> REVIEWER: <bot-login> COMMENT_BODY: <text> COMMENT_PATH: <path> COMMENT_LINE: <line>`

## Input resolution

- **`REPO`** — `$ARGUMENTS` → `gh repo view --json nameWithOwner --jq .nameWithOwner` as fallback when invoked interactively.
- **`PR_NUMBER`** — `$ARGUMENTS` → `gh pr view --json number --jq .number` for the current branch.
- **`REVIEWER`** — `$ARGUMENTS` → `gh api user --jq .login` (the authenticated user) as fallback.
- **`COMMENT_BODY` / `COMMENT_PATH` / `COMMENT_LINE`** — `$ARGUMENTS` only. If missing when invoked interactively, abort with a clear error (these must come from the CI context).

Do NOT prompt the user. Return an error JSON structure if required inputs cannot be resolved.

## Task

$ARGUMENTS

---

## Phase 1: Context Loading

### 1.1 PR Context and Diff

Fetch PR metadata and diff (needed locally for Phase 3 evaluation):

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

After all calls complete, store the `outputId` from the snapshot acquisition (attach or pack) response for use with `grep_repomix_output` and `read_repomix_output`. Use the review data from `fetch-pr-reviews` to understand the full review history, including REVIEWER-specific reviews and comments.

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

### Thread Resolution

Add to `resolveComments` when:

- The bot's finding was incorrect
- The user has addressed/will address the issue
- The user provided valid justification

Do NOT resolve when:

- The finding is still valid despite user's response
- The user only asked a question (not a correction)

### Verdict Update

Check ALL remaining unresolved bot threads (not just the one being discussed) to determine:

- If ALL 🚧 blockers are now resolved/retracted → `updatedVerdict: "approve"`
- If this creates a NEW blocker → `updatedVerdict: "requestChanges"`
- Otherwise → `updatedVerdict: null` (no change)

### Review Body Update

Only provide `updatedReviewComment` if `updatedVerdict` is non-null. Follow the same format as the original review body (see the pr:review skill for format rules).

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
