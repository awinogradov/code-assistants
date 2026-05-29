---
name: pr:review
description: Review a pull request and provide constructive feedback with structured verdict. Used by awinogradov/code-review-action@v3
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

---

## Phase 1: Context Loading

### 1.1 PR Context

Fetch PR metadata (always) and the diff (only when you will review it in-model):

```bash
gh pr view <PR_NUMBER> -R <REPO> --json title,body,files,commits,reviews,comments
gh pr diff <PR_NUMBER> -R <REPO>
```

**Single-source the diff.** If `PRECOMPUTED_REVIEWS_PATH` is set (orchestrator fan-out, Phase 2.4), the sub-agents already received the diff and the root model only formats the pre-merged findings — **skip `gh pr diff` entirely** in that case. Fetch it only for in-model fan-out (Phase 2.3). Never embed the diff more than once.

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

**Read the pack, don't dump it.** The snapshot exists so you can pull _targeted_ context on demand — use `grep_repomix_output` (regex + `contextLines`) and `read_repomix_output` with a specific `startLine`/`endLine` slice. NEVER `read_repomix_output` over the whole range (that loads the entire codebase into context). When the diff is self-contained and needs no cross-file lookup (the common case), don't read the pack at all — the `outputId` stays available for sub-agents (e.g. architecture) that actually need to confirm a pattern elsewhere.

### 1.4 Review Round Handling

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

### 1.5 Extended Context

- **CLAUDE.md** - Apply project rules to each change
- **context7/Ref/Exa** - Look up docs for unfamiliar APIs
- **Perplexity** - Web search for general info

---

## Phase 2: Review via Sub-Agents

### 2.1 Detect Stack

Read `package.json` in the repository root (use Read tool or `grep_repomix_output`). Extract the `agents.rules` field value as the stack identifier.

- If the file exists: store the `rules` value (e.g., `Bun`, `NodeJS+React`, `Bun+React+Tailwind`, `NodeJS+React+Tailwind`)
- If the file does not exist or `rules` is missing: set stack to `unknown`

### 2.2 Select Review Source

The action orchestrator (`awinogradov/code-review-action`) may have pre-computed the 12 sub-agent reviews in parallel and written the results to a JSON file. The path is exposed via the `PRECOMPUTED_REVIEWS_PATH` env var. Pick the review source:

```bash
echo "${PRECOMPUTED_REVIEWS_PATH:-}"
```

Store the echoed value as `<path>` — it is the concrete reference Phase 2.4 uses for reading the file and for the hard-failure diagnostic.

- **Empty or unset** → the root command runs the fan-out itself. Go to Phase 2.3 (in-model fan-out).
- **Non-empty path** → read pre-computed results. Go to Phase 2.4 (pre-computed fan-out results).

### 2.3 In-Model Fan-Out

Used only when `PRECOMPUTED_REVIEWS_PATH` is empty or unset (see 2.2).

Launch ALL 12 review agents **in parallel** (single message, multiple Agent tool calls). Each agent receives the stack and diff in its prompt. Some agents receive additional context.

**Prompt template for most agents:**

```
Review for [category].

Stack: <STACK>

Diff:
<DIFF>
```

**pr:review:pr-hygiene also receives PR metadata and issue context:**

```
Review for PR hygiene.

Stack: <STACK>

PR metadata:
Title: <PR_TITLE>
Body: <PR_BODY>
Commits: <COMMIT_LIST>

Issue context:
<ISSUE_CONTEXT or "No linked issue">

Diff:
<DIFF>
```

```
Agent 1 — Correctness & Bugs (sonnet):
  subagent_type: "autopilot:pr:review:correctness"
  description: "Review: correctness"

Agent 2 — Testing (sonnet):
  subagent_type: "autopilot:pr:review:testing"
  description: "Review: testing"

Agent 3 — Complexity & Readability (haiku):
  subagent_type: "autopilot:pr:review:complexity"
  description: "Review: complexity"

Agent 4 — Platform Standards (haiku):
  subagent_type: "autopilot:pr:review:standards"
  description: "Review: standards"

Agent 5 — Architecture & Patterns (sonnet):
  subagent_type: "autopilot:pr:review:architecture"
  description: "Review: architecture"

Agent 6 — AI Code Smells (sonnet):
  subagent_type: "autopilot:pr:review:ai-smells"
  description: "Review: ai-smells"

Agent 7 — Common Sense (sonnet):
  subagent_type: "autopilot:pr:review:common-sense"
  description: "Review: common-sense"

Agent 8 — PR Hygiene (sonnet):
  subagent_type: "autopilot:pr:review:pr-hygiene"
  description: "Review: pr-hygiene"

Agent 9 — Surface Correctness (haiku):
  subagent_type: "autopilot:pr:review:surface-correctness"
  description: "Review: surface-correctness"

Agent 10 — Surface Testing & Quality (haiku):
  subagent_type: "autopilot:pr:review:surface-testing"
  description: "Review: surface-testing"

Agent 11 — Surface Naming & Structure (haiku):
  subagent_type: "autopilot:pr:review:surface-naming"
  description: "Review: surface-naming"

Agent 12 — Security (sonnet):
  subagent_type: "autopilot:pr:review:security"
  description: "Review: security"
```

Each agent returns a structured JSON object of the form `{ "findings": [ { "severity", "file", "line", "rule", "title", "detail" }, ... ] }` (see Phase 2.4 for the field contract). After all 12 agents complete, proceed to Phase 2.5 with the list of per-agent findings to merge in-model.

### 2.4 Pre-Computed Fan-Out Results

Used only when `PRECOMPUTED_REVIEWS_PATH` is set to a non-empty path (see 2.2). The orchestrator has already run the 12 sub-agents in parallel as headless SDK queries, **merged their structured findings deterministically in code** (`aggregateReviews.ts`), and written the result to this file.

Read the file with the Read tool. It is a JSON object holding the already-merged, severity-ordered findings:

```json
{
  "findings": [
    {
      "severity": "blocker" | "suggestion" | "nitpick",
      "file": "src/file.ts",
      "line": 42,
      "rule": "CHECK-BUG-002" | "CHECK-BUG-002, CHECK-AI-002" | null,
      "title": "Short title",
      "detail": "1-2 sentence description"
    }
  ]
}
```

**Extraction rules:**

1. Parse the file as JSON.
2. The `findings` array is **already deduplicated by `(file, line)`, has rule codes merged, and is ordered blockers → suggestions → nitpicks**. Do NOT re-merge or re-order — the orchestrator did that. Per-agent failures were already dropped (their dimension contributes no findings) and counted in the run summary.
3. Skip Phase 2.5 entirely (it applies only to the in-model path) and go straight to Phase 3 with this finding list.

**Hard-failure policy (orchestrator contract violation):**

If any of the following is true, do NOT fall back silently — emit a `comment` verdict so the orchestrator bug is loudly visible in CI without blocking the PR author for a failure they cannot fix:

- The file at `$PRECOMPUTED_REVIEWS_PATH` does not exist or is not readable.
- The file content is not valid JSON, or the top-level value is not an object with a `findings` array.
- Any finding is missing a required field (`severity`, `file`, `title`, `detail` must be present; `line` and `rule` may be `null`).

In that case, skip Phase 2.5 and Phase 3's normal aggregation. Emit the following structured output directly and end the command:

```json
{
  "verdict": "comment",
  "reviewComment": "### 💬 Comment\n\nReview aborted: orchestrator-mode precomputed reviews could not be loaded.\n\n- `PRECOMPUTED_REVIEWS_PATH`: `<path>`\n- Reason: `<one-line diagnostic — missing file, parse error, or schema mismatch>`\n\nThis indicates a bug in the `code-review-action` orchestrator, not in the PR. Re-run the review after the orchestrator is fixed, or disable `parallel_fanout`.",
  "inlineComments": []
}
```

Replace `<path>` with the env var value and `<one-line diagnostic>` with the specific failure mode. Do not include file contents or stack traces in the review body.

### 2.5 Aggregate Findings (in-model path only)

**Skip this phase on the pre-computed path (Phase 2.4) — the orchestrator already merged the findings.** Apply it only to the in-model fan-out (Phase 2.3), where you hold 12 separate `{ "findings": [...] }` objects:

1. Each finding is a JSON object: `{ severity, file, line, rule, title, detail }`. `severity` is one of `blocker | suggestion | nitpick`; `line` is `null` for out-of-diff findings; `rule` is `null` when the finding maps to no `CHECK-` code (do NOT substitute `UNSPECIFIED`).
2. If an agent failed or timed out, skip that dimension — do not block the review.
3. Deduplicate findings by `(file, line)` — if two agents flag the same location, keep the higher severity (`blocker` > `suggestion` > `nitpick`) and merge their `rule` codes into one bare comma-separated list (e.g. `CHECK-BUG-002, CHECK-AI-002`). Findings with a `null` line are never merged.
4. Merge all findings into a single list ordered by severity: blockers first, then suggestions, then nitpicks.
5. Proceed to Phase 3 with this finding list.

**Both paths**, when rendering findings into `reviewComment` and `inlineComments` in Phase 3: map `severity` to its emoji (`blocker` → 🚧, `suggestion` → 🙋‍♂️, `nitpick` → 💡) and append the **bare** ` [<RULE>]` (or ` [<CODE1>, <CODE2>]`) from the finding's `rule` field. Do NOT build markdown links and do NOT read agent files to construct URLs — `code-review-action` resolves every code to its canonical GitHub link deterministically after the model finishes (see §2.6). When `rule` is `null`, append nothing. The emoji stays first so downstream severity filters keep working.

### 2.6 Rule-to-URL Mapping (done by the action, not the model)

Rule codes are emitted **bare** (`[CHECK-BUG-002]`, or `[CHECK-BUG-002, CHECK-AI-002]` for a shared location). `code-review-action` resolves each code to its canonical GitHub link **deterministically in code** (`src/ruleUrls.ts`) after the model returns its structured output — it scans the `pr:review:*.md` agent files once in Node and rewrites bare codes into markdown links. This replaced the former model-side resolution, which read all agent files and slugified headings every review (~11 tool round-trips per run).

The model MUST therefore:

- Emit bare codes only — never construct `https://github.com/...` links and never read agent files to build them.
- Append nothing when a finding has no rule code (do not emit `[UNSPECIFIED]`).

Codes that don't resolve (rename, typo, drift) or an unreadable plugin directory degrade gracefully to the bare `[<CODE>]` text — the action never blocks the review over link resolution.

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

Every blocker, suggestion, and nitpick line ends with the **bare** rule code (e.g. `[CHECK-BUG-002]`). If two agents flagged the same `(path, line)`, list all codes comma-separated inside a single bracket pair (e.g. `[CHECK-BUG-002, CHECK-AI-002]`). Do NOT build markdown links — `code-review-action` resolves codes to links after submission (§2.6). When the sub-agent emitted no `Rule:` field, omit the bracket suffix entirely.

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

Each inline comment: 1-2 sentences, start with severity emoji, end with the **bare** rule code (e.g. `🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002]`). `code-review-action` resolves it to a link after submission (§2.6).

### Deduplication Rules

- NEVER mention the same issue in BOTH reviewComment AND inlineComments
- If adding inline comment → mention location in reviewComment but don't repeat full description
- If issue location is out-of-diff → put in reviewComment only, skip inlineComments

### Include

- ALWAYS full paths for all file references (e.g., `src/history/kafka/consumer.py:66`, NOT `consumer.py:66`)
- Direct, confident language
- Clear verdict (rationale only when requesting changes)
- Bare rule code `[<CODE>]` (or `[<CODE1>, <CODE2>]`) suffix on every finding line (blocker, suggestion, nitpick) and every `inlineComments.body` — `code-review-action` resolves codes to links (§2.6); omit the suffix entirely when no rule code is available

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
