---
name: issue:create
description: Create a GitHub issue with a structured body (Context, What, Why, Scope, Solution) and curated labels via the gh CLI. Use when filing new issues, or when invoked from other skills.
argument-hint: "[title hint or short description]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Read
  - Grep
  - Glob
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
  - MCP(repomix:*)
  - AskUserQuestion
  - Skill(autopilot:ascii-schemas)
---

# Create Issue

Create a GitHub issue with a structured body and curated labels. The body uses a fixed five-section structure (Context, What, Why, Scope, Solution). Titles are plain business descriptions — no Conventional Commits or prefix conventions. Labels are pulled from the repository and only labels that exist may be selected.

## When to Use

- When filing a new GitHub issue for tracking work
- When invoked from other skills that need to open an issue

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `[title hint or short description]` — optional free-form hint that seeds the title and body generation (e.g., `"users cannot reset password via email"`).

## Input resolution

- **Title hint** — `$ARGUMENTS` → if empty, prompt once via AskUserQuestion: "What is this issue about?" with a free-form slot. Do not abort silently.
- **Repository** — `gh repo view --json nameWithOwner -q .nameWithOwner`. No prompt.

## Completion Requirement

This workflow is not complete until Phase 8 executes `gh issue create` and outputs the issue URL. Generating a title, generating a body, or running label selection does not constitute completion. Execute all eight phases in sequence.

## AskUserQuestion Contract (MANDATORY)

Every AskUserQuestion call that presents content for review (the issue preview in Phase 7) MUST follow these exact rules.

1. **`question` is FIXED TEXT** — use the EXACT string specified in each phase. NEVER add the issue title, body, metadata, or any other content to the question field.
2. **`header` is FIXED TEXT** — use the EXACT string specified.
3. **`preview` is MANDATORY** — every option MUST include a `preview` field. The issue content (title + body + labels, plus an optional duplicate-warning line at the top) goes ONLY in `preview`. NEVER put content in `question`, `label`, or `description`.
4. **`label` values are EXACT** — use the exact text specified (e.g., "Create issue", "Edit content", "Cancel"). No abbreviations.
5. **`description` values are EXACT** — use the exact text specified.
6. **ALL options are REQUIRED** — include every option listed. NEVER omit "Cancel".
7. **Same `preview` on all options** — the user chooses an action, not content. All options show identical preview text.
8. **NO shorthand in `preview`** — never pass `"..."`, `"<same content>"`, or any placeholder string. Copy the full preview string literally into every option.

## Phase 0: Resolve Repository and Hint

1. Parse `$ARGUMENTS` as an optional title hint. If empty, prompt the user via AskUserQuestion ("What is this issue about?") with a free-form slot.
2. Resolve the repository:
   ```bash
   gh repo view --json nameWithOwner -q .nameWithOwner
   ```
   Store as `<repo>` (format: `owner/name`).
3. **No preflight-check is invoked.** Issue creation does not depend on git branch state — the user may file an issue from any branch including `main`.

## Phase 1: Gather Context

Mirror the codebase-packing approach used by `/autopilot:plan` so the generated body reflects real code, not hallucinated structure.

1. Acquire the codebase snapshot once (prefer the committed pack to avoid re-packing):
   ```
   Check whether `.repomix/pack.xml` exists at the repository root.
   - If it exists:
     mcp__repomix__attach_packed_output
       path: <repository root>/.repomix/pack.xml
   - If it is absent (or the attach fails), fall back to:
     mcp__repomix__pack_codebase
       directory: <repository root>
       compress: true
   ```
   Store the returned `outputId`.
2. Use `mcp__repomix__grep_repomix_output` with that `outputId` to find files/symbols related to the hint (keywords from `$ARGUMENTS`).
3. Use `mcp__repomix__read_repomix_output` with `startLine`/`endLine` to read specific sections that grep matched. Do NOT read the full pack.
4. Also collect git context:
   ```bash
   git log -20 --oneline
   git status --short
   ```
   These inform the Context and Why sections.
5. **External documentation lookup (best-effort).** Classify keywords from `$ARGUMENTS` plus the file/symbol names that grep matched in step 2, then call the matching MCP(s) below. Each call is best-effort: on error, timeout, or empty result, log a warning and continue with whatever was collected. Do NOT block issue creation on MCP availability.
   - **Library / framework / SDK / CLI named in the hint** (e.g., React, Bun, Zod, `gh` CLI, Prisma) → call `mcp__context7__resolve-library-id` then `mcp__context7__query-docs` with a task-relevant topic. Run multiple library lookups in parallel.
   - **Official documentation URL or technology name** → `mcp__Ref__ref_search_documentation`, then `mcp__Ref__ref_read_url` for specific pages from the results.
   - **Code-pattern / "how do projects do X" / migration examples** → `mcp__exa__web_search_exa` for API patterns, changelogs, migration guides, and real-world usage.
   - **Recency / news / "is X deprecated" / general web Q&A** → `mcp__perplexity__perplexity_search` for factual lookups; `mcp__perplexity__perplexity_reason` for trade-off / architectural reasoning.

   Each MCP provides different information; use as many as the hint warrants. Feed the collected snippets into the body generated by Phase 5 (Context and Solution sections in particular).

**Fallback:** if any MCP server (repomix, context7, Ref, exa, perplexity) is unavailable or returns no results, continue with whatever the remaining sources produced. Use `Grep` and `Read` directly on the repository when repomix is down. Do not block the skill on MCP availability — the generated body should still ship, just with less external context.

## Phase 2: Fetch Available Labels

```bash
gh label list -R <repo> --limit 100 --json name,description,color
```

- On success with non-empty output: store the label list for Phase 6 (suggestion matching).
- On success with empty output (`[]`): continue with no label suggestions. Phase 7 preview will show `Labels: (none)`.
- On error (non-zero exit, network failure): log a warning and continue with no labels. Do not block the skill.

## Phase 3: Find Related Issues and PRs

Search the repository for related work in both directions (open + closed) so the new issue can reference duplicates, prior art, and in-flight work.

1. Extract 3-5 keyword phrases from `$ARGUMENTS` + Phase 1 context. Example: for `"users cannot reset password via email"` → `password reset`, `email reset`, `reset password`.
2. For each keyword phrase, run both:
   ```bash
   gh issue list -R <repo> --search "<phrase>" --state all --limit 10 --json number,title,state,url,labels,updatedAt
   gh pr   list -R <repo> --search "<phrase>" --state all --limit 10 --json number,title,state,url,updatedAt
   ```
3. Merge and deduplicate by `number`. Rank by relevance (keyword match count + recency from `updatedAt`).
4. Keep the top 5 results across issues+PRs combined. Categorise each as `[open]`, `[closed]`, or `[merged]` (PRs).
5. On error (non-zero exit, network failure): log a warning and continue with no related items. Do not block the skill.
6. Pass the related items into Phase 5 (used in the body's Context section as a `Related: #N, #M` line — magic-word free so it does NOT auto-close anything). The duplicate-detection check against the planned title runs in Phase 4 (after the title exists).

## Phase 4: Generate Title

**Rules:**

- Capitalized first letter
- ≤ 80 characters total
- No trailing period
- Business-focused, understandable by someone on their first day
- **NOT** Conventional Commits format (no `feat:`, `fix:`, `chore:`)
- **NO** prefix (no `[BUG]`, `HOTFIX:`, `[FEATURE]`)
- Describes what needs to happen or the problem being solved

**Examples:**

| Hint                                                | Generated Title                                      |
| --------------------------------------------------- | ---------------------------------------------------- |
| `"users cannot reset password via email"`           | `Users cannot reset password via email`              |
| `"refactor token streaming pipeline"`               | `Refactor token streaming pipeline for backpressure` |
| `"add release notes section to PR template"`        | `Add release notes section to pull request template` |
| `"audio drops every time multiple clients connect"` | `Audio playback drops when multiple clients connect` |

**Duplicate-detection check (after the title is generated):**

For each open item returned by Phase 3, compute the keyword-overlap ratio against the generated title:

- Tokenize both strings into lowercase keywords, drop English stop words (`a`, `the`, `for`, `to`, `of`, `in`, `on`, etc.).
- Empty-set guard (apply BEFORE the division):
  - If `titleKeywords` is empty AND `candidateKeywords` is empty → `overlap = 1.0` (both strings are stop-word-only; treat as identical).
  - If exactly one of the two sets is empty → `overlap = 0` (no meaningful overlap; one side has nothing to match against).
- Otherwise: `overlap = |titleKeywords ∩ candidateKeywords| / min(|titleKeywords|, |candidateKeywords|)`.
- If `overlap > 0.8` for any open item, set `possibleDuplicate` to that item (the highest-scoring one wins on ties). Phase 7 will surface a warning line so the user can cancel and comment on the existing issue instead.
- Closed and merged items are not duplicate candidates (they only feed the `Related:` line); only open items can trigger the warning.

## Phase 5: Generate Body

**CRITICAL — Section ordering is MANDATORY and MUST NOT be rearranged:**

1. `## Context` (FIRST)
2. `## What`
3. `## Why`
4. `## Scope`
5. `## Solution` (LAST)

Heading format MUST be exact: `## Context` (single space, no trailing colon, no bold `**Heading:**`). Reordering sections is a format violation.

**Section 1: Context**

- 1-2 paragraphs describing the situation, what work area this touches, why we're noticing it now
- Single continuous line per paragraph (no hard-wrapping — GitHub renders single newlines as visible line breaks)
- If Phase 3 returned related items, end the section with a single `Related:` line:
  ```
  Related: #123 (open), #456 (closed), #789 (merged)
  ```
  Use the plain `#N (state)` format — NEVER use magic words like `Closes #N` here (those would close issues on merge, which is wrong for a context reference).

**Section 2: What**

- 1 paragraph or short bullet list
- The deliverable in plain terms — what changes when this is done
- Single continuous line per item

**Section 3: Why**

- 1 paragraph
- User impact / business motivation / what problem this solves
- A reader on day one should understand

**Section 4: Scope**

- Bullet list with two sub-headings: `**In scope:**` and `**Out of scope:**`
- If there are no out-of-scope items, write `_None — this is the entire change._` under "Out of scope"
- Never invent out-of-scope items just to fill the section

**Section 5: Solution**

- Paragraph(s) describing the high-level approach
- **Diagram trigger rule:** invoke `Skill(autopilot:ascii-schemas)` when the Solution describes a flow between ≥ 2 components, an architectural relationship, a sequence, or a UI layout
- Embed the schema output verbatim in a fenced ` ```text ` block
- Skip the diagram for pure logic/refactor issues

**Example body skeleton:**

```
## Context

<situation paragraph>

Related: #123 (closed)

## What

<deliverable>

## Why

<motivation>

## Scope

- **In scope:**
  - <item>
  - <item>
- **Out of scope:**
  - <item>

## Solution

<approach paragraph>

\`\`\`text
<optional ASCII diagram>
\`\`\`
```

## Phase 6: Suggest Labels

Match Phase 2's label list against Phase 4 title + Phase 5 body keywords.

1. Score each fetched label by: (a) presence of label name/description keywords in title (weight 2), (b) presence in body (weight 1).
2. Select the top 0-3 matches.
3. **Validation:** only labels present in the Phase 2 fetched set may be selected. NEVER invent a label name — `gh issue create --label nonexistent` will fail.
4. If no label scores > 0, select none and proceed with `Labels: (none)`.

## Phase 7: Verify with User

Present the full issue using AskUserQuestion with preview. See the AskUserQuestion Contract above — all rules are mandatory.

1. Compose the full preview string:
   - If Phase 3 flagged a `possibleDuplicate`, the FIRST line is:
     ```
     Possible duplicates: #123 (<title of duplicate>), #456 (<title>)
     ```
     followed by a blank line.
   - Then the title line.
   - Blank line.
   - The five-section body (literal newlines, no escaping).
   - Blank line.
   - `Labels: label1, label2` (or `Labels: (none)`).

2. AskUserQuestion parameters:
   - `question`: "Review the issue details and choose an action."
   - `header`: "Create issue"
   - `options`:
     ```
     [
       { label: "Create issue", description: "Create this GitHub issue", preview: "<full preview>" },
       { label: "Edit content", description: "Modify title, body, or labels", preview: "<full preview>" },
       { label: "Cancel", description: "Abort issue creation", preview: "<full preview>" }
     ]
     ```
   - `multiSelect`: false

   All three options use the same `preview` content since the user is choosing an action, not content.

3. If user selects "Edit content": ask what to change (title / body section / labels), regenerate that part, re-present via AskUserQuestion.

4. If user selects "Cancel":
   - If a `possibleDuplicate` was surfaced, output: `Issue creation cancelled. Consider commenting on #<duplicate-number> instead.`
   - Otherwise: `Issue creation cancelled.`
   - Abort.

5. Only proceed to Phase 8 after the user selects "Create issue".

## Phase 8: Create Issue

This phase is mandatory. The skill is complete only after the issue URL is printed.

Execute via stdin so body content (which may contain backticks, `$()`, ASCII diagrams, quotes) is preserved exactly:

```bash
printf '%s' "<body>" | gh issue create \
  --repo <owner/repo> \
  --title "<title>" \
  --body-file - \
  --label "<label1>" --label "<label2>"
```

**Rules:**

- Pass `--repo <owner/repo>` explicitly (resolved in Phase 0). Do not rely on cwd — this matters in worktrees.
- Use `--body-file -` to read the body from stdin via `printf '%s'`. Avoids shell expansion of backticks and `$(...)` in the body.
- Repeat `--label` once per label. Do NOT comma-join — label names may contain commas.
- If no labels were selected, omit the `--label` flags entirely.
- The URL is the last line of `gh issue create` stdout. Capture it.

Output the result:

```
✓ Created issue: <url>
```

## Examples

### Example 1: No arguments — prompts for hint

```
/autopilot:issue-create
```

Skill prompts via AskUserQuestion: "What is this issue about?" — user types `Audio drops when many clients connect`.

After Phases 1-6, AskUserQuestion with:

- `question`: "Review the issue details and choose an action."
- `header`: "Create issue"
- `options`: [
  { label: "Create issue", description: "Create this GitHub issue", preview: "Audio playback drops when multiple clients connect\n\n## Context\n\nThe playback layer was last audited two quarters ago; recent client-load tests show audible dropouts at 8+ concurrent sessions.\n\n## What\n\nIdentify and fix the source of audio dropouts in multi-client playback. Add a regression test covering ≥ 8 concurrent clients.\n\n## Why\n\nReviewers depend on clean audio for plan readbacks. Dropouts force a rerun, doubling review time per plan.\n\n## Scope\n\n- **In scope:**\n - Root-cause investigation of dropouts at high concurrency\n - Fix and regression test\n- **Out of scope:**\n - _None — this is the entire change._\n\n## Solution\n\nProfile the playback path under load to identify the bottleneck, then apply the smallest fix that holds 8+ concurrent sessions without dropouts.\n\nLabels: bug, audio" },
  { label: "Edit content", description: "Modify title, body, or labels", preview: "Audio playback drops when multiple clients connect\n\n## Context\n\nThe playback layer was last audited two quarters ago; recent client-load tests show audible dropouts at 8+ concurrent sessions.\n\n## What\n\nIdentify and fix the source of audio dropouts in multi-client playback. Add a regression test covering ≥ 8 concurrent clients.\n\n## Why\n\nReviewers depend on clean audio for plan readbacks. Dropouts force a rerun, doubling review time per plan.\n\n## Scope\n\n- **In scope:**\n - Root-cause investigation of dropouts at high concurrency\n - Fix and regression test\n- **Out of scope:**\n - _None — this is the entire change._\n\n## Solution\n\nProfile the playback path under load to identify the bottleneck, then apply the smallest fix that holds 8+ concurrent sessions without dropouts.\n\nLabels: bug, audio" },
  { label: "Cancel", description: "Abort issue creation", preview: "Audio playback drops when multiple clients connect\n\n## Context\n\nThe playback layer was last audited two quarters ago; recent client-load tests show audible dropouts at 8+ concurrent sessions.\n\n## What\n\nIdentify and fix the source of audio dropouts in multi-client playback. Add a regression test covering ≥ 8 concurrent clients.\n\n## Why\n\nReviewers depend on clean audio for plan readbacks. Dropouts force a rerun, doubling review time per plan.\n\n## Scope\n\n- **In scope:**\n - Root-cause investigation of dropouts at high concurrency\n - Fix and regression test\n- **Out of scope:**\n - _None — this is the entire change._\n\n## Solution\n\nProfile the playback path under load to identify the bottleneck, then apply the smallest fix that holds 8+ concurrent sessions without dropouts.\n\nLabels: bug, audio" }
  ]

User selects "Create issue".

```
✓ Created issue: https://github.com/org/repo/issues/142
```

### Example 2: Title hint with related prior work

```
/autopilot:issue-create "users cannot reset password via email"
```

Phase 3 finds one closed issue #87 ("Password reset endpoint returns 500"). Included as `Related: #87 (closed)` in Context.

AskUserQuestion with:

- `question`: "Review the issue details and choose an action."
- `header`: "Create issue"
- `options`: [
  { label: "Create issue", description: "Create this GitHub issue", preview: "Users cannot reset password via email\n\n## Context\n\nUsers report that the email-based password reset flow no longer sends the reset link. We saw a similar regression last quarter (#87) but the root cause then was server-side; this looks like the email service hook.\n\nRelated: #87 (closed)\n\n## What\n\nRestore the email-based password reset flow. The reset link email must be sent within 30 seconds of the user submitting the reset form.\n\n## Why\n\nLocked-out users have no self-service recovery path right now — every reset goes through support. Support load is up 3× this week.\n\n## Scope\n\n- **In scope:**\n - Diagnose why the reset email is not sent\n - Restore delivery within the 30-second SLA\n - Add a smoke test that exercises the full reset flow\n- **Out of scope:**\n - Rewriting the email template\n - SMS-based reset (separate issue)\n\n## Solution\n\nTrace the reset request from the form submission through the auth service to the email queue. Most likely culprit is the new mail-queue routing key introduced last week. Roll back the routing change if confirmed, otherwise patch the queue binding.\n\nLabels: bug, auth" },
  { label: "Edit content", description: "Modify title, body, or labels", preview: "Users cannot reset password via email\n\n## Context\n\nUsers report that the email-based password reset flow no longer sends the reset link. We saw a similar regression last quarter (#87) but the root cause then was server-side; this looks like the email service hook.\n\nRelated: #87 (closed)\n\n## What\n\nRestore the email-based password reset flow. The reset link email must be sent within 30 seconds of the user submitting the reset form.\n\n## Why\n\nLocked-out users have no self-service recovery path right now — every reset goes through support. Support load is up 3× this week.\n\n## Scope\n\n- **In scope:**\n - Diagnose why the reset email is not sent\n - Restore delivery within the 30-second SLA\n - Add a smoke test that exercises the full reset flow\n- **Out of scope:**\n - Rewriting the email template\n - SMS-based reset (separate issue)\n\n## Solution\n\nTrace the reset request from the form submission through the auth service to the email queue. Most likely culprit is the new mail-queue routing key introduced last week. Roll back the routing change if confirmed, otherwise patch the queue binding.\n\nLabels: bug, auth" },
  { label: "Cancel", description: "Abort issue creation", preview: "Users cannot reset password via email\n\n## Context\n\nUsers report that the email-based password reset flow no longer sends the reset link. We saw a similar regression last quarter (#87) but the root cause then was server-side; this looks like the email service hook.\n\nRelated: #87 (closed)\n\n## What\n\nRestore the email-based password reset flow. The reset link email must be sent within 30 seconds of the user submitting the reset form.\n\n## Why\n\nLocked-out users have no self-service recovery path right now — every reset goes through support. Support load is up 3× this week.\n\n## Scope\n\n- **In scope:**\n - Diagnose why the reset email is not sent\n - Restore delivery within the 30-second SLA\n - Add a smoke test that exercises the full reset flow\n- **Out of scope:**\n - Rewriting the email template\n - SMS-based reset (separate issue)\n\n## Solution\n\nTrace the reset request from the form submission through the auth service to the email queue. Most likely culprit is the new mail-queue routing key introduced last week. Roll back the routing change if confirmed, otherwise patch the queue binding.\n\nLabels: bug, auth" }
  ]

User selects "Create issue".

```
✓ Created issue: https://github.com/org/repo/issues/143
```

### Example 3: Solution with ASCII diagram via ascii-schemas

```
/autopilot:issue-create "refactor token streaming pipeline"
```

Phase 5 detects that the Solution describes a flow between ≥ 2 components and invokes `Skill(autopilot:ascii-schemas)` to draw the new pipeline.

AskUserQuestion preview (abbreviated for readability — every option carries the FULL string):

```
Refactor token streaming pipeline for backpressure

## Context

The current token streaming pipeline buffers an entire response before flushing to the client. Long completions exhaust the server-side buffer and back up upstream LLM calls.

## What

Convert the pipeline to a streaming model with explicit backpressure between the model adapter, the codec, and the SSE writer.

## Why

Long-form completions today block other in-flight requests, raising p99 latency for unrelated calls. Backpressure unblocks parallelism without raising memory.

## Scope

- **In scope:**
  - Streaming model adapter → codec interface
  - Codec → SSE writer with credit-based backpressure
  - Integration test covering > 100k token responses
- **Out of scope:**
  - Replacing SSE with WebSocket (separate proposal)

## Solution

Introduce a typed `TokenStream` reader/writer pair between each pipeline stage. Each stage applies credit-based backpressure: a downstream consumer signals `n` credits, the upstream producer sends at most `n` tokens before waiting.

\`\`\`text
┌─────────────┐   tokens    ┌──────────┐   credits   ┌─────────────┐
│ ModelAdapter│ ──────────▶ │  Codec   │ ──────────▶ │ SseWriter   │
│             │ ◀────────── │          │ ◀────────── │             │
└─────────────┘   credits   └──────────┘   credits   └─────────────┘
\`\`\`

Labels: refactor, performance
```

User selects "Create issue".

```
✓ Created issue: https://github.com/org/repo/issues/144
```

### Example 4: Repo with zero labels

```
/autopilot:issue-create "tidy up README badges"
```

`gh label list` returns `[]`. Phase 6 selects no labels. Phase 7 preview shows `Labels: (none)`. Phase 8 omits the `--label` flags entirely:

```bash
printf '%s' "$body" | gh issue create --repo org/repo --title "Tidy up README badges" --body-file -
```

```
✓ Created issue: https://github.com/org/repo/issues/145
```

### Example 5: Duplicate detected — user cancels

```
/autopilot:issue-create "add password reset"
```

Phase 3 finds open issue #200 ("Add password reset flow") with > 80% title overlap. Phase 7 prepends a warning line to every preview:

```
Possible duplicates: #200 (Add password reset flow)

Add password reset flow for email-based auth

## Context

<...>
```

User selects "Cancel".

```
Issue creation cancelled. Consider commenting on #200 instead.
```
