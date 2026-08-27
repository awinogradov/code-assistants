---
name: pr-resolve
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
  - Bash(command -v graphify)
  - Bash(graphify query *)
  - Bash(graphify path *)
  - Bash(graphify explain *)
  - Bash(graphify affected *)
  - Bash(graphify --help)
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
- When invoked from `pr-monitor` skill after detecting review feedback

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

Read [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md) for the ordered context-acquisition chain; this skill passes the review-scoped `includePatterns` (repomix tier only) shown below. Read [`github-review-fetch.md`](../shared-rules/references/github-review-fetch.md) for the review-thread helper invocation and its output contract.

```
Acquire codebase context: follow the shared repomix-snapshot chain,
  passing `includePatterns`: ".claude/**, **.md, **.yml, .github/**"

Fetch review threads: run the shared github-review-fetch helper via Bash
  with <OWNER>/<REPO>, <PR_NUMBER>, and <AUTHOR_LOGIN>
```

After both complete:

- Store the selected context source (and its `outputId` when the repomix tier was selected) — search and read codebase content via that source's read contract during [Phase 3](#phase-3-address-comments-code-fixes) (code fixes)
- Store the helper's JSON — `reviewState`, the severity-tagged `comments` (each carrying the `commentId` used for replies in [Phase 5](#phase-5-reply-to-review-threads) and the `authorReplied`/`lastAuthorReply` fields for judging in-model whether a comment is already addressed), and `note` — use in [Phase 2](#phase-2-present-findings-to-user); surface a non-null `fetchError` per the shared block instead of treating the fetch as empty

### 1.5 Project Rules

- **CLAUDE.md** - Apply project rules when making fixes
- **context7/Ref/Exa** - Look up docs for unfamiliar APIs referenced in review comments
- **Perplexity** - Web search for general info

---

## Phase 2: Present Findings to User

**Formatting Note:** Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

Build a summary of all findings, grouping the agent's `comments` by `severity`:

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

If the agent returned `comments: []` with `note: "no-comments"`:

- Output: "No unresolved review comments found on PR #N."
- Stop

If it returned `comments: []` with `note: "all-resolved"`:

- Output: "All review comments on PR #N are already resolved."
- Stop

Present using AskUserQuestion:

Tool parameters:

- `question`: The summary text above (plain text, no markdown)
- `header`: "Review"
- `options`: [
  { label: "Address all", description: "Fix blockers, suggestions, and nitpicks; reply to questions" },
  { label: "Review individually", description: "Approve each fix one by one (replies always post)" },
  { label: "Cancel", description: "Exit without changes" }
  ]
- `multiSelect`: false

If "Cancel", stop without changes.

---

## Phase 3: Address Comments (Code Fixes)

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
2. **Draft a reply** — concise, direct, 1-5 sentences; format references per [RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md) (the **Reference formatting & readability** rules inlined at the end of this skill; see [Phase 5](#phase-5-reply-to-review-threads)). A `CHECK-` rule code you cite — e.g. when you echo the finding you are answering — is a reference, not a code specimen: render it as a link to the rule's anchor exactly as [Phase 5](#phase-5-reply-to-review-threads) prescribes, never bare text. Reply shapes:
   - If reviewer is wrong: "You're right that [X looks concerning], but [reason it's correct]. [Evidence from code]."
   - If needs discussion: "[Acknowledge point], however [concern or alternative]."
   - If question: "[Direct answer with reference to code]."
3. Store the reply for [Phase 5](#phase-5-reply-to-review-threads)

---

## Phase 4: Commit and Push

### 4.1 Check for Changes

```bash
git status --porcelain
```

If no changes (only replies needed, no code fixes), skip to [Phase 5](#phase-5-reply-to-review-threads).

### 4.2 Commit

Before invoking commits-create, compile a modification list from the changes made in [Phase 3](#phase-3-address-comments-code-fixes). For each code change, write one bullet naming the concrete modification (file, function, value, or behavior that changed).

Example modification list:

```
- Replace 30s timeout with 60s in releaseClient.ts
- Remove try-catch wrapper from fetchRelease()
- Change notes parameter type from string to string[]
- Remove redundant null guard in parseVersion()
```

**FORBIDDEN in context passed to commits-create:** The words "review", "reviewer", "feedback", "comment", "suggestion", "nitpick", or any reference to the review-resolution origin of changes. The context must not contain any of these words.

Invoke `Skill(autopilot:commits-create)`. Pass the modification list as the commit context in conversation text. Do NOT include any other context about why changes were made.

### 4.3 Push

```bash
git push
```

Read [`git-history-policy.md`](../shared-rules/references/git-history-policy.md) before running anything else here. The push above is a plain fast-forward and needs nothing more; a rejection is the case that matters. If it is rejected as non-fast-forward, report that and stop — never reconcile by merging the base branch, and never retry with a force push.

---

## Phase 5: Reply to Review Threads

Compose replies for all processed comments. **Always mention the reviewer** with `@<username>` at the start of each reply.

- **Fixed comments (commit pushed)**: "@\<reviewer\> Fixed in [<sha>](<repo-commit-url>/<sha>) — [brief description of what changed]."
- **Fixed comments (no commit to cite)**: "@\<reviewer\> Fixed — [brief description of what changed]."
- **Not applicable / misunderstood**: "@\<reviewer\> [Explanation of why the current code is correct or why the change isn't needed]."
- **Partially addressed**: "@\<reviewer\> [What was changed and why, plus what was intentionally kept]."
- **Declined by user**: "@\<reviewer\> Considered — [explanation of why this suggestion was not applied]."

Format every reply per [RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md) — the **Reference formatting & readability** rules inlined at the end of this skill. The reference kind that recurs here is the commit SHA: when a reply cites the commit that resolved a thread (the HEAD commit after [Phase 4](#phase-4-commit-and-push)'s push, post-rebase/squash), render the SHA as a markdown link `[<sha>](<repo-commit-url>/<sha>)` built from the repo owner/name resolved in [Phase 1](#phase-1-detect-pr-and-load-context) — never a bare or backticked SHA. Because replies post as GitHub comments, link any file, doc, skill, agent, or section you cite as an absolute `<repo-blob-url>/path#anchor` URL built from the same repo owner/name — never a bare name or a repo-relative path (relative paths do not resolve in a comment). A `CHECK-` rule code (e.g. `CHECK-PR-009`) is a reference, not a code specimen: render it as a link exactly as the [`pr-review` skill's §2.5](../pr-review/SKILL.md#25-rule-codes) prescribes — `[CHECK-PR-009](<rules-doc-url>#check-pr-009)`, the fragment being the rule code lowercased — never the bare code. Build `<rules-doc-url>` as the absolute blob URL to the `pr-review` SKILL.md from the repo owner/name resolved in [Phase 1](#phase-1-detect-pr-and-load-context) — `<repo-blob-url>/claude-plugins/autopilot/skills/pr-review/SKILL.md`, whose lowercase `#check-...` fragment lands on the `<a id="...">` anchor above each rule (GitHub renders those ids lowercased, and fragment lookup is case-sensitive) — falling back to the bare code in plain text only when no such URL is resolvable. Replies that cite no commit (e.g. questions, declines) skip the SHA rule; all other reference kinds still follow the inlined rules. Before posting, self-check every drafted reply: a bare 7–40-char hex token or a bare tracker id (`[A-Z][A-Z0-9]*-[0-9]+`) is a violation — link it per the rules above.

Build a summary of all drafted replies:

```
Drafted replies for PR #<N>

Fixed (N):
  <file>:<line> - "Fixed - [description]"

Explained (N):
  <file>:<line> - "[reply text]"
```

Output the summary above as plain text, then post every drafted reply immediately — do not ask for approval. Before posting, resolve your login with `gh api user --jq .login` and fetch the existing comments — inline threads via `gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments`, top-level via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`; skip an inline thread whose latest comment (matching by `in_reply_to_id`) is already yours, and skip a top-level reply whose body you already posted — this keeps re-runs idempotent. If a post fails, continue with the remaining replies and list the failures under `Failed` in the [Phase 6](#phase-6-update-pr-and-summary) summary.

Post replies using the GitHub API:

For inline review comment threads:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies -f body="<reply>"
```

For top-level review comments:

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments -f body="<reply>"
```

---

## Phase 6: Update PR and Summary

### 6.1 Update PR

Invoke `Skill(autopilot:pr-update)` — refreshes the PR description reflecting the new state.

### 6.2 Summary

Output results:

```
Resolve Review Complete

Fixed (N comments):
  <file>:<line> - <description of fix>

Replied (N comments):
  <file>:<line> - <reply summary>

Declined (N comments):
  <file>:<line> - <reply summary>

Failed (N replies):
  <file>:<line> - <post error>

Commit: <commit message>
Pushed to origin/<branch>
PR #<N> updated: <url>
```

If no code changes were made (only replies):

```
Resolve Review Complete

Replied (N comments):
  <file>:<line> - <reply summary>

Failed (N replies):
  <file>:<line> - <post error>

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

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
