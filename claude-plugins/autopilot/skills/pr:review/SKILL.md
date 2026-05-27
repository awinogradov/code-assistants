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

Fetch PR metadata and diff (needed locally for Phase 2 review and Phase 4 submit):

```bash
gh pr view <PR_NUMBER> -R <REPO> --json title,body,files,commits,reviews,comments
gh pr diff <PR_NUMBER> -R <REPO>
```

### 1.2 Load Context via Sub-Agents

Extract the linked issue ID from PR metadata. Check in order, stop at first match:

1. **PR body `Issues:` section** — lines starting with `Closes` or `Related to` followed by a ticket ID
2. **Branch name** — leading `[a-z]+-[0-9]+` segment, convert to UPPERCASE

Launch context-loading calls **in parallel**. If a linked issue was found, launch 3 calls; otherwise launch 2:

```
Pack codebase (MCP direct call):
  Call `mcp__repomix__pack_codebase` with:
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

After all calls complete, store the `outputId` from the `pack_codebase` response for use with `grep_repomix_output` and `read_repomix_output`. Store issue context and review data from the agents.

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

Launch ALL 11 review agents **in parallel** (single message, multiple Agent tool calls). Each agent receives the stack and diff in its prompt. Some agents receive additional context.

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
```

After all 11 agents complete, proceed to Phase 2.5 with the list of structured review blocks.

### 2.4 Pre-Computed Fan-Out Results

Used only when `PRECOMPUTED_REVIEWS_PATH` is set to a non-empty path (see 2.2). The orchestrator has already run the 11 sub-agents in parallel as headless SDK queries and written their markdown to this file.

Read the file with the Read tool. It is a JSON array where each element matches:

```json
{
  "subagent_type": "autopilot:pr:review:<category>",
  "markdown": "...structured review block...",
  "duration_ms": 12345,
  "error": "<optional>"
}
```

**Extraction rules:**

1. Parse the file as JSON.
2. For each array entry:
   - If `error` is a non-empty string, **skip** that entry — same policy as a failed in-model sub-agent (do not block the review for orchestrator-side failures; that dimension just contributes no findings).
   - Otherwise, treat `markdown` as the output that the `subagent_type` sub-agent would have produced. It is already in the structured format Phase 2.5 expects.
3. After processing all entries, you have a list of structured review blocks. Proceed to Phase 2.5.

**Hard-failure policy (orchestrator contract violation):**

If any of the following is true, do NOT fall back silently — emit a `comment` verdict so the orchestrator bug is loudly visible in CI without blocking the PR author for a failure they cannot fix:

- The file at `$PRECOMPUTED_REVIEWS_PATH` does not exist or is not readable.
- The file content is not valid JSON, or the top-level value is not an array.
- Any array entry is missing the required `subagent_type` or `markdown` field (both must be strings).

In that case, skip Phase 2.5 and Phase 3's normal aggregation. Emit the following structured output directly and end the command:

```json
{
  "verdict": "comment",
  "reviewComment": "### 💬 Comment\n\nReview aborted: orchestrator-mode precomputed reviews could not be loaded.\n\n- `PRECOMPUTED_REVIEWS_PATH`: `<path>`\n- Reason: `<one-line diagnostic — missing file, parse error, or schema mismatch>`\n\nThis indicates a bug in the `code-review-action` orchestrator, not in the PR. Re-run the review after the orchestrator is fixed, or disable `parallel_fanout`.",
  "inlineComments": []
}
```

Replace `<path>` with the env var value and `<one-line diagnostic>` with the specific failure mode. Do not include file contents or stack traces in the review body.

### 2.5 Aggregate Findings

After all review results are available — whether produced in Phase 2.3 (in-model) or Phase 2.4 (pre-computed) — apply the same aggregation pipeline:

1. Parse each review block's structured output (findings with severity emoji, file, line, **rule** code, detail). The rule code is the value of the `- **Rule:**` field (regex anchor: `^- \*\*Rule:\*\* ([A-Z0-9-]+)$`). If an agent omits the field, the finding has no rule code — do NOT substitute `UNSPECIFIED`; the suffix is simply omitted in step 5.
2. If a review block indicates the agent failed or timed out (in-model) or had `error` set (pre-computed), skip that dimension — do not block the review.
3. Deduplicate findings by `(path, line)` — if two agents flag the same location, keep the higher severity (🚧 > 🙋‍♂️ > 💡) and merge descriptions if complementary. Merge rule codes into the linked form inside one bracket pair, comma-separated, where each code keeps its own URL: `[[CHECK-BUG-002](url-a), [CHECK-AI-002](url-b)]`. URLs are resolved via §2.6 Rule-to-URL Mapping.
4. Merge all findings into a single list ordered by severity: blockers first, then suggestions, then nitpicks.
5. Propagate the rule code to the final review: append ` [<RULE>](<rule-url>)` to the end of each finding line in `reviewComment` and to the end of each `inlineComments.body`, with `<rule-url>` resolved per §2.6 Rule-to-URL Mapping. When the sub-agent emitted no rule code, append nothing (do not emit `[UNSPECIFIED]`). The emoji stays first so downstream severity filters keep working.
6. Proceed to Phase 3.

### 2.6 Rule-to-URL Mapping

Used in §2.5 steps 3 and 5 to turn a bare rule code into a markdown link to the rule's category in the producing sub-agent file on GitHub.

**Sub-agent → file lookup.** Every review block carries a `subagent_type` with the `autopilot:` prefix — in-model fan-out gets it from the Agent tool's `subagent_type` field; pre-computed fan-out gets it from `code-review-action`'s `reviewFanout.ts`. Strip the `autopilot:` prefix and append `.md` to get the bare agent filename:

| `subagent_type`                           | Agent filename                     |
| ----------------------------------------- | ---------------------------------- |
| `autopilot:pr:review:correctness`         | `pr:review:correctness.md`         |
| `autopilot:pr:review:testing`             | `pr:review:testing.md`             |
| `autopilot:pr:review:complexity`          | `pr:review:complexity.md`          |
| `autopilot:pr:review:standards`           | `pr:review:standards.md`           |
| `autopilot:pr:review:architecture`        | `pr:review:architecture.md`        |
| `autopilot:pr:review:ai-smells`           | `pr:review:ai-smells.md`           |
| `autopilot:pr:review:common-sense`        | `pr:review:common-sense.md`        |
| `autopilot:pr:review:pr-hygiene`          | `pr:review:pr-hygiene.md`          |
| `autopilot:pr:review:surface-correctness` | `pr:review:surface-correctness.md` |
| `autopilot:pr:review:surface-testing`     | `pr:review:surface-testing.md`     |
| `autopilot:pr:review:surface-naming`      | `pr:review:surface-naming.md`      |

**Local file path (for reading).** The skill must read the agent file from the installed plugin directory, not the caller's checkout — when `code-review-action` runs in a downstream repo, `claude-plugins/autopilot/agents/` does not exist in the workspace. Resolve the read path in this order:

1. If the `CLAUDE_PLUGIN_DIR` env var is set (exposed by `code-review-action`), read from `${CLAUDE_PLUGIN_DIR}/agents/<filename>`.
2. Otherwise (running inside the autopilot source repo), read from `claude-plugins/autopilot/agents/<filename>` relative to the repository root.

If neither path is readable, fall back per the Edge cases below — never block the review.

**Anchor derivation.** Read the producing agent file once via the `Read` tool (using the local path resolved above), find the line containing the rule code (matched as `**<CODE>:`), then walk upward to the nearest `### ` heading. Slugify that heading: lowercase, strip characters other than `[a-z0-9 -]`, replace spaces with `-`, collapse repeats. Example: `### B. Concurrency and Async Issues` → `b-concurrency-and-async-issues`. Cache the heading map per agent file for the run.

**URL template.** Always emit links to the canonical GitHub source — the local read path is only used for anchor lookup, never as the link target. URL: `https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/<file-encoded>#<anchor>` — percent-encode `:` as `%3A` in the file segment so markdown parsers do not misinterpret it. Example: `pr:review:correctness.md` → `pr%3Areview%3Acorrectness.md`.

**Edge cases.**

- The sub-agent emitted no rule code: omit the bracket suffix entirely (see §2.5 step 1 and step 5). Do not emit `[UNSPECIFIED]`.
- Rule code present but not found in the agent file (rename, typo, drift): fall back to bare `[<CODE>]` with no URL. Never block the review.
- Local agent file not readable (neither `$CLAUDE_PLUGIN_DIR/agents/<filename>` nor `claude-plugins/autopilot/agents/<filename>` exists): fall back to bare `[<CODE>]` for every code from that sub-agent. Never block the review.

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
  "reviewComment": "Adds retry logic to the payment webhook handler.\n\n### 🚧 Blockers\n\n1. **Missing idempotency check** - `src/webhooks/payment.ts:45` - Retries can cause duplicate charges [CHECK-BUG-002](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Acorrectness.md#b-concurrency-and-async-issues)\n\n### ⛔ Request Changes\n\nAdd idempotency key validation before processing payment.",
  "inlineComments": [
    {
      "path": "src/webhooks/payment.ts",
      "line": 45,
      "body": "🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Acorrectness.md#b-concurrency-and-async-issues)"
    }
  ]
}
```

**Example: approve with suggestions (non-blocking)**

```json
{
  "verdict": "approve",
  "reviewComment": "Adds retry logic to the payment webhook handler.\n\n### 🙋‍♂️ Suggestions\n\n- `src/webhooks/payment.ts:62` - Consider exponential backoff for retries [CHECK-ARCH-002](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Aarchitecture.md#a-code-reuse-and-duplication)\n\n### 👍 Approve",
  "inlineComments": [
    {
      "path": "src/webhooks/payment.ts",
      "line": 62,
      "body": "🙋‍♂️ Consider exponential backoff for retries [CHECK-ARCH-002](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Aarchitecture.md#a-code-reuse-and-duplication)"
    }
  ]
}
```

**reviewComment body template (ONLY when there are findings):**

Every blocker, suggestion, and nitpick line ends with the rule code as a markdown link (e.g. `[CHECK-BUG-002](<rule-url>)`). `<rule-url>` is computed via §2.6 Rule-to-URL Mapping. If two agents flagged the same `(path, line)`, list all rule codes comma-separated inside a single bracket pair, each with its own URL (e.g. `[[CHECK-BUG-002](url-a), [CHECK-AI-002](url-b)]`). When the sub-agent emitted no `Rule:` field, omit the bracket suffix entirely.

```markdown
[1 factual sentence: what this PR changes — no quality judgment]

### 🚧 Blockers

1. **[Title]** - `src/path/to/file.py:NN` - [Problem in 1 line] [CHECK-BUG-XXX](rule-url)

### 🙋‍♂️ Suggestions

- `src/path/to/file.py:NN` - [Recommendation in 1 line] [CHECK-AI-XXX](rule-url)

### 💡 Nitpicks

- `src/path/to/file.py:NN` - [Optional fix in 1 line] [CHECK-CPLX-XXX](rule-url)

### ⛔ Request Changes / ### 👍 Approve

[1 sentence: what must change — ONLY for requestChanges. Omit for approve.]
```

### inlineComments Usage

Add inline comments for issues with specific code locations:

- **🚧 Blocker** - Always add inline comment at exact location if location is specific
- **🙋‍♂️ Suggestion** - Add if location is specific
- **💡 Nitpicks** - Optional, can be in summary only

Each inline comment: 1-2 sentences, start with severity emoji, end with the rule code as a markdown link resolved per §2.6 Rule-to-URL Mapping (e.g. `🚧 No idempotency check — retries will duplicate charges [CHECK-BUG-002](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Acorrectness.md#b-concurrency-and-async-issues)`).

### Deduplication Rules

- NEVER mention the same issue in BOTH reviewComment AND inlineComments
- If adding inline comment → mention location in reviewComment but don't repeat full description
- If issue location is out-of-diff → put in reviewComment only, skip inlineComments

### Include

- ALWAYS full paths for all file references (e.g., `src/history/kafka/consumer.py:66`, NOT `consumer.py:66`)
- Direct, confident language
- Clear verdict (rationale only when requesting changes)
- Rule code as `[<CODE>](<rule-url>)` markdown-link suffix on every finding line (blocker, suggestion, nitpick) and every `inlineComments.body` — URL resolved per §2.6 Rule-to-URL Mapping; omit the suffix entirely when no rule code is available

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
