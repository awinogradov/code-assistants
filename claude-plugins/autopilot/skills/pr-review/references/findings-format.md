# Findings format

Read only when a review has findings. For a first review, start with one short sentence mentioning PR_AUTHOR; no praise or round label. Follow-up reviews omit the greeting.

Section names are fixed because downstream tooling keys on them — use exactly the four defined in the body template below (🚧 Blockers, 🙋‍♂️ Suggestions, 💡 Nitpicks, and the closing verdict header).

**SKIP empty sections entirely. Do NOT write "None" or "N/A" - just omit the section.**

**Ticket references:** when the body cites the linked ticket, cite it as a markdown link built from the [§1.3](../SKILL.md#13-load-supporting-context) issue helper’s `url` (e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)`) — a bare tracker id GitHub does not auto-link is dead text; fall back to the bare id only when no URL is resolvable. GitHub issue numbers stay bare (`#42` auto-links).

**File and doc links:** define `<pr-blob-url>` = `https://github.com/<REPO>/blob/<headRefOid>` (`headRefOid` from [§1.1](../SKILL.md#11-pr-context); valid for fork PRs too — PR head commits stay reachable in the base repo via `refs/pull/N/head`). Percent-encode path characters that break markdown links (spaces → `%20`, parentheses → `%28`/`%29`, `:` → `%3A`). Then:

- **Locations and mentions** — every finding location AND every file/doc/RFC mention in prose renders as a link, wherever it appears: the leading finding location, the summary sentence, mid-description text, and inside `inlineComments` bodies. With a known line: `[<path>:<NN>](<pr-blob-url>/<path>#L<NN>)` (ranges `#L<start>-L<end>`). With no line — a plain prose mention of a repo file/doc — drop the fragment and still link the path: `[<path>](<pr-blob-url>/<path>)`. A bare `RFC-NNNN` links to its doc via the [§1.4](../SKILL.md#14-project-context-read-before-reviewing) standards inventory even when a trailing `§X` section anchor is unresolvable (link the document; omit the anchor).
- **Only resolvable targets** — link a path from the [§1.1](../SKILL.md#11-pr-context) `files` list or one the [§1.3](../SKILL.md#13-load-supporting-context) snapshot / `Glob` / `gh` lookup confirmed; a standard's id resolves to its path via the [§1.4](../SKILL.md#14-project-context-read-before-reviewing) standards inventory. An id with no resolved path, or a path with no blob at head (deleted, or a renamed-from old path), is NEVER linked by guess — keep it backticked/bare; a fabricated 404 is worse than no link. A token that is not a real target — a glob or pattern (`*.steps.ts`), a bare directory, a config key (`agents.trackers`), or an illustrative name that resolves to no repo blob — is a code specimen, not a reference: keep it backticked and never link it.
- **Anchors** — a line cite into a `.md` target inserts `?plain=1` before `#L` so the anchor lands (e.g. `[docs/setup.md:96](<pr-blob-url>/docs/setup.md?plain=1#L96)`); a section cite uses the rendered heading-anchor form `<pr-blob-url>/<path>#<heading-anchor>`, no `?plain=1`; never combine the two.
- **Inline-comment exception** — an inline comment's own anchored location stays a backticked full path (GitHub anchors it).
- **Self-check** — before emitting the structured output, scan the entire `reviewComment` (including the summary sentence, not just finding lines) and every `inlineComments` body: outside code spans/fences, any resolvable repo-relative file or doc path — with OR without a line number — a bare `RFC-NNNN` id, or a bare 7–40-char hex token is a violation unless it is one of the two allowed forms above (inline own anchor; unresolvable/no-blob-at-head path). Link paths per these rules and SHAs as `https://github.com/<REPO>/commit/<sha>`. A path that resolves to no repo blob (a glob, pattern, config key, or illustrative name) is NOT a violation — leave it backticked.

**If reviewComment is non-empty, use these verdict headers at the END:**

- `verdict: "requestChanges"` → `### ⛔ Request Changes`
- `verdict: "approve"` (with suggestions/nitpicks) → `### 👍 Approve`
- `verdict: "comment"` → `### 💬 Comment`

A non-empty body links its mentions per **File and doc links**: the summary sentence links its doc mention — "Points the retry policy in [docs/webhooks.md](<pr-blob-url>/docs/webhooks.md) at the new handler." — and mid-description prose links a no-line file mention — "the `retry*` helpers in [src/webhooks/config.ts](<pr-blob-url>/src/webhooks/config.ts) still assume single-attempt delivery" — while a glob like `*.steps.ts` stays a backticked code specimen.

**reviewComment body template (ONLY when there are findings):**

Every blocker, suggestion, and nitpick line ends with its rule code rendered per [§2.5](../SKILL.md#25-rule-codes) (single, shared, and no-code forms as defined there).

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

Each inline comment: 1-2 sentences, start with severity emoji, end with the rule code rendered per [§2.5](../SKILL.md#25-rule-codes).

### Code suggestions

Add an optional `suggestion` to an inline comment when the fix is concrete and mechanical — a rename, a guard clause, a corrected operator — and you can write it as exact replacement text. The action renders it as a one-click GitHub suggestion block ("Commit suggestion").

- `suggestion` REPLACES the anchored line(s). Reproduce the original line(s) verbatim except for your change, **including leading indentation** — GitHub applies the text as-is, so a stray space silently reindents the file.
- Provide raw replacement code only: no ` ```suggestion ` fence, no `+`/`-` diff markers, no prose (the action wraps it).
- Single-line fix: set `line` only. Multi-line fix: set `startLine` (first line) and `line` (last line) over a **contiguous range fully inside the diff**. If the fix touches lines outside the diff, describe it in prose and omit `suggestion`.
- Emit `suggestion` only when confident it applies cleanly; otherwise keep the prose finding alone.

### Deduplication Rules

Give each finding one detailed explanation. For an inline finding, put the explanation in `inlineComments` and a short title, linked location, and rule code in `reviewComment`; do not repeat the detail. For an out-of-diff finding, put the detail in `reviewComment` only. The summary remains a self-contained inventory for later review rounds.

### Include

- ALWAYS full paths for all file references, rendered per **File and doc links** (e.g. `[src/services/payment/processor.ts:66](<pr-blob-url>/src/services/payment/processor.ts#L66)`, NOT `processor.ts:66`)
- Direct, confident language
- Clear verdict (rationale only when requesting changes)
- Rule code rendered per [§2.5](../SKILL.md#25-rule-codes) on every finding line (blocker, suggestion, nitpick) and every `inlineComments.body`
- File, section, doc, commit, and issue references follow the reference-formatting rules in [`reference-formatting.md`](../../shared-rules/references/reference-formatting.md) (read it first) — build the links per **File and doc links** above. Exception: an inline comment is already anchored to its file and line by GitHub, so keep its location as a backticked full path (e.g. `src/services/payment/processor.ts:66`); apply the linking rules to the review-body prose and to any cross-file or out-of-diff reference inside inline bodies

### Exclude

The body is findings only: no praise, no meta-commentary, no statistics, no process narration — every sentence is either a finding or required by the template, and each finding states a fact and the change it calls for, not a hedged possibility. With no issues, approve silently.

Two format contracts downstream tooling keys on:

- No top-level (`##`) markdown headers — the body's only headers are the template's `###` sections
- A concrete, mechanical fix goes in the structured `suggestion` field (see [Code suggestions](#code-suggestions)), which renders as a one-click GitHub suggestion block — not as a code example in the comment prose
