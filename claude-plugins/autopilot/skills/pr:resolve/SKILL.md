---
name: pr:resolve
description: Address PR review comments by analyzing feedback, making code fixes, and replying to reviewers. Use when resolving review feedback on a pull request.
argument-hint: "[PR-number]"
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash(git *)
  - Bash(gh *)
  - AskUserQuestion
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-update)
  - MCP(repomix:*)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
---

# PR Resolve Review

Address PR review comments: analyze feedback, make code fixes, reply to reviewers, commit, push, and update the PR.

## When to Use

- When a PR has review comments that need to be addressed
- When invoked from `pr:monitor` skill after detecting review feedback

## Input

Arguments: `$ARGUMENTS`

Expected form:

- (no arguments) — auto-detect the PR from the current branch
- `<PR-number>` — optional explicit PR number (e.g., `42`)

## Input resolution

Arguments are optional. Resolve each field:

- **PR number** — `$ARGUMENTS` → auto-detect from current branch via `gh pr view --json number,url,baseRefName,headRefName,author`. Abort with a clear message if no PR exists. Do NOT prompt.

## Phase 1: Detect PR and Load Context

### 1.1 Detect PR

Auto-detect the PR from the current branch:

```bash
gh pr view --json number,title,url,baseRefName,headRefName,author
```

If no PR found, abort: "No pull request found for the current branch. Create one first with `/autopilot:pr-create`."

Store the PR number, repo owner/name (extract from url), and author login.

### 1.2 Check Working Tree

```bash
git status --porcelain
```

If uncommitted changes exist, use AskUserQuestion:

Tool parameters:

- `question`: "You have uncommitted changes.\n\nReview fixes will create new commits. Stash or commit changes first?"
- `header`: "Uncommitted"
- `options`: [
  { label: "Continue anyway", description: "Proceed with uncommitted changes present" },
  { label: "Cancel", description: "Stop so I can handle changes first" }
  ]
- `multiSelect`: false

If "Cancel", stop.

### 1.3 Load PR Diff

```bash
gh pr diff <PR_NUMBER>
```

### 1.4 Load Codebase and Review Comments

Launch 2 calls **in parallel** to load codebase context and fetch review comments:

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
  - `prompt`: "Fetch reviews for PR #<PR_NUMBER>. Repo: <OWNER>/<REPO>. Author: <AUTHOR_LOGIN>."
  - `description`: "Fetch PR reviews"
```

After all calls complete:

- Store the `outputId` from the snapshot acquisition (attach or pack) response — use `grep_repomix_output` and `read_repomix_output` with this ID to search and read codebase content during Phase 4 (code fixes)
- Store the categorized review comments from `fetch-pr-reviews` — use in Phase 3

### 1.5 Project Rules

- **CLAUDE.md** - Apply project rules when making fixes
- **context7/Ref/Exa** - Look up docs for unfamiliar APIs referenced in review comments
- **Perplexity** - Web search for general info

---

## Phase 3: Present Findings to User

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in AskUserQuestion `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

Build a summary of all findings:

```
Review Comments for PR #<N>

Blockers (N):
  <file>:<line> - @<reviewer>: <comment summary>
  <file>:<line> - @<reviewer>: <comment summary>

Suggestions (N):
  <file>:<line> - @<reviewer>: <comment summary>

Nitpicks (N):
  <file>:<line> - @<reviewer>: <comment summary>

Questions to answer (N):
  <file>:<line> - @<reviewer>: <comment summary>
```

If no actionable comments found:

- Output: "No unresolved review comments found on PR #N."
- Stop

If all comments are resolved:

- Output: "All review comments on PR #N are already resolved."
- Stop

Present using AskUserQuestion:

Tool parameters:

- `question`: The summary text above (plain text, no markdown)
- `header`: "Review"
- `options`: [
  { label: "Address all", description: "Fix blockers, suggestions, and nitpicks; reply to questions" },
  { label: "Review individually", description: "Approve each comment action one by one" },
  { label: "Cancel", description: "Exit without changes" }
  ]
- `multiSelect`: false

If "Cancel", stop without changes.

---

## Phase 4: Address Comments (Code Fixes)

Process in priority order: Blockers → Suggestions → Nitpicks.

ALL categories (Blockers, Suggestions, Nitpicks) must be processed. For each comment: fix the code if the suggestion is reasonable, or draft a reply explaining why the current approach is correct. No category may be silently skipped regardless of PR approval status.

For each comment requiring a code change:

1. **Read the file** at the commented location and surrounding context (at least 20 lines before and after)
2. **Understand the reviewer's intent** — what specifically needs to change and why
3. **Look up documentation** if the fix involves unfamiliar APIs (using context7/Ref/Exa/Perplexity)
4. **Make the code change** using the Edit tool
5. **If "Review individually"** was selected, present each fix with AskUserQuestion before applying:

   Tool parameters:
   - `question`: "<file>:<line>\n\nReviewer: <comment text>\n\nProposed fix: <description of the change>"
   - `header`: "Fix"
   - `options`: [
     { label: "Apply fix", description: "Make this change" },
     { label: "Decline with reply", description: "Draft a reply explaining why this won't be addressed" }
     ]
   - `multiSelect`: false

For comments that do not require code changes (questions, misunderstandings):

1. **Evaluate the comment** against the actual codebase — read the code, check if the reviewer's concern is valid
2. **Draft a reply** — concise, direct, 1-5 sentences:
   - If reviewer is wrong: "You're right that [X looks concerning], but [reason it's correct]. [Evidence from code]."
   - If needs discussion: "[Acknowledge point], however [concern or alternative]."
   - If question: "[Direct answer with reference to code]."
3. Store the reply for Phase 6

---

## Phase 5: Commit and Push

### 5.1 Check for Changes

```bash
git status --porcelain
```

If no changes (only replies needed, no code fixes), skip to Phase 6.

### 5.2 Commit

Before invoking commits:create, compile a modification list from the changes made in Phase 4. For each code change, write one bullet naming the concrete modification (file, function, value, or behavior that changed).

Example modification list:

```
- Replace 30s timeout with 60s in releaseClient.ts
- Remove try-catch wrapper from fetchRelease()
- Change notes parameter type from string to string[]
- Remove redundant null guard in parseVersion()
```

**FORBIDDEN in context passed to commits:create:** The words "review", "reviewer", "feedback", "comment", "suggestion", "nitpick", or any reference to the review-resolution origin of changes. The context must not contain any of these words.

Invoke `Skill(autopilot:commits-create)`. Pass the modification list as the commit context in conversation text. Do NOT include any other context about why changes were made.

### 5.3 Push

```bash
git push
```

---

## Phase 6: Reply to Review Threads

Compose replies for all processed comments. **Always mention the reviewer** with `@<username>` at the start of each reply.

- **Fixed comments**: "@\<reviewer\> Fixed — [brief description of what changed]."
- **Not applicable / misunderstood**: "@\<reviewer\> [Explanation of why the current code is correct or why the change isn't needed]."
- **Partially addressed**: "@\<reviewer\> [What was changed and why, plus what was intentionally kept]."
- **Declined by user**: "@\<reviewer\> Considered — [explanation of why this suggestion was not applied]."

Build a summary of all drafted replies:

```
Drafted replies for PR #<N>

Fixed (N):
  <file>:<line> - "Fixed - [description]"

Explained (N):
  <file>:<line> - "[reply text]"
```

Present using AskUserQuestion:

Tool parameters:

- `question`: The summary text above (plain text, no markdown)
- `header`: "Replies"
- `options`: [
  { label: "Post all replies", description: "Reply to all comment threads" },
  { label: "Review individually", description: "Approve each reply one by one" }
  ]
- `multiSelect`: false

Post replies using the GitHub API:

For inline review comment threads:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies -f body="<reply>"
```

For top-level review comments:

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments -f body="<reply>"
```

If "Review individually", present each reply with AskUserQuestion before posting:

Tool parameters:

- `question`: "<file>:<line>\n\nReviewer said: <comment text>\n\nDrafted reply: <reply text>"
- `header`: "Reply"
- `options`: [
  { label: "Post reply", description: "Send this reply" },
  { label: "Edit", description: "Let me rephrase this" }
  ]
- `multiSelect`: false

If "Edit" selected, ask for the user's preferred reply text and use that instead.

---

## Phase 7: Update PR and Summary

### 7.1 Update PR

Invoke `Skill(autopilot:pr-update)` — refreshes the PR description reflecting the new state.

### 7.2 Summary

Output results:

```
Resolve Review Complete

Fixed (N comments):
  <file>:<line> - <description of fix>

Replied (N comments):
  <file>:<line> - <reply summary>

Declined (N comments):
  <file>:<line> - <reply summary>

Commit: <commit message>
Pushed to origin/<branch>
PR #<N> updated: <url>
```

If no code changes were made (only replies):

```
Resolve Review Complete

Replied (N comments):
  <file>:<line> - <reply summary>

No code changes needed.
PR #<N>: <url>
```

---

## Edge Cases

- **No PR found** → abort with suggestion to create one
- **No review comments** → "No unresolved review comments found on PR #N"
- **All comments resolved** → "All review comments on PR #N are already resolved"
- **No code changes needed** → skip commit/push, only post replies
- **Uncommitted changes** → warn user before starting
- **Push fails** → report error, suggest `git pull --rebase` or manual resolution
- **Multiple reviewers** → group comments by reviewer within each severity category

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Prefer stable references that never rot; render the same kind of reference the same way everywhere:

- Code identifiers and file names — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked specimen names the thing without a link that breaks when a file moves or a doc is restructured.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Other docs and sections — do NOT link a doc name or a section anchor; those rot the moment the doc is restructured. Inline a short gist of the point you need instead.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
