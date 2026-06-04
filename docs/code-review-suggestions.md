# Inline suggestions and AI-agent prompts

`code-review-action` posts inline PR findings as plain `{path, line, body}` comments. That tells the author _what_ is wrong, but they still hand-apply every fix, and an external coding agent has no structured handle on the finding.

Two affordances make a review directly actionable — both modelled on the third-party cubic reviewer:

- A **GitHub `suggestion` block** the author applies with one click ("Commit suggestion"), for single-line and multi-line fixes.
- A collapsible **"Prompt for AI agents"** block: a ready-to-paste prompt carrying the instruction, `path:line`, a chrome-free copy of the finding, and a bounded window of the surrounding diff as `<file context>`.

The model decides the fix; the action renders and posts it. Both land through the same `octokit.rest.pulls.createReview` call the action already makes.

## Data flow

The `pr:review` skill emits two new optional per-comment fields — `suggestion` (verbatim replacement for the anchored line(s)) and `startLine` (first line of a multi-line range). `submitReview.ts` renders the body and shapes the Octokit payload; the AI-agent prompt is built action-side from the diff hunk the action already holds, so it costs no model tokens.

```
┌───────────────────────────┐
│ pr:review skill (model)    │
└─────────────┬─────────────┘
              │ ① inlineComments[] JSON:
              │   { path, line, body, startLine?, suggestion? }
              ▼
┌─────────────┬────────────────────────────┐
│ submitReview.ts → buildReviewComments()   │
└─────────────┬────────────────────────────┘
              │
              ├──② findHunkForLine(patch, line) ─▶ hunk text
              │
              ├──③ renderInlineCommentBody():
              │      body
              │      + GitHub suggestion block        (if suggestion set)
              │      + <details> Prompt for AI agents:
              │           <comment> cleaned finding </comment>
              │           <file context> bounded hunk </file context>
              │
              ├──  Octokit payload per comment:
              │      { path, line, body, side: RIGHT,
              │        start_line?, start_side?: RIGHT }   (multi-line)
              │
              │ ④ octokit.rest.pulls.createReview({ comments })
              ▼
┌─────────────┬──────────────────────────────────┐
│ GitHub PR review                                │
│   • one-click "Commit suggestion" button        │
│   • collapsible "Prompt for AI agents" block    │
└─────────────────────────────────────────────────┘
```

**Flow legend:**

- ① The skill emits each finding with optional `startLine` and `suggestion`; it crosses the action boundary as the `structured_output` JSON, validated by `inlineCommentSchema`.
- ② Per comment, the action looks up the file's patch and extracts the hunk covering the line — used for `<file context>` and (via `isValidComment`) to confirm the whole range is in-diff.
- ③ The action renders the final body: original finding, then the suggestion fence (when present), then the cubic-shaped "Prompt for AI agents" `<details>`. The embedded prompt copy is cleaned (leading severity emoji and trailing rule link removed) and its `<file context>` is bounded to a window around the finding line — only this copy is transformed; the original finding above stays verbatim.
- ④ Posted through the existing `createReview` call with `side`/`start_line`/`start_side` added for multi-line; GitHub renders the suggestion button and the collapsible prompt.

## Rendered comment

A finding with a two-line `suggestion` over `startLine: 7, line: 8`, inside a freshly added 20-line file, renders like this (the action wraps the model's raw replacement in the ` ```suggestion ` fence and appends the prompt):

````text
🚧 Off-by-one in the running sum — `items[n]` reads past the array [CHECK-BUG-003](…)

```suggestion
    for i in range(n):
        running += items[i]
```

<details>
<summary>Prompt for AI agents</summary>

```text
Check if this issue is valid — if so, understand the root cause and fix it. At src/totals.py, lines 7 to 8:

<comment>
Off-by-one in the running sum — `items[n]` reads past the array
</comment>

<file context>
@@ -0,0 +1,20 @@ def total(items, n):
+    """Sum the first n items."""
+    running = 0
+    if n < 0:
+        raise ValueError("bad n")
+    n = min(n, len(items))
+    for i in range(n + 1):
+        running += items[i]
+    return running
+
+def mean(items, n):
+    if n == 0:
+        return 0
+    return total(items, n) / n
</file context>
```

</details>
````

Two transforms keep the embedded prompt prompt-shaped rather than a verbose data dump (a new or large file previously dumped in full — the problem from PR #253):

- **Bounded context** — `<file context>` is trimmed to `agentPromptContextRadius` (6) new-file lines on each side of the finding line, a ~13-line window (fewer near a file edge). The full hunk here is the whole 20-line file; the window drops line 1 and lines 15–20. The `@@` header is kept verbatim, so its `+1,20` still describes the full hunk, not the window. A hunk already smaller than the window is left untouched.
- **Chrome stripped** — the embedded `<comment>` drops the leading severity emoji and the trailing `[CHECK-BUG-003](…)` rule link, leaving clean instruction text; inline-code backticks (`` `items[n]` ``) are preserved. Only this embedded copy is cleaned — the human-facing finding above the suggestion keeps its emoji and rule link verbatim.

The suggestion replaces the anchored line(s) verbatim, so the model must reproduce the original indentation — a stray space would silently reindent the file on apply. The `pr:review` skill enforces this; `inlineCommentBody.test.ts` asserts the rendered fence preserves it, the bounded window, and the chrome-free embedded finding.

## Multi-line suggestions

GitHub anchors a review comment to one line (`line`) or a range (`start_line`..`line`), and a `suggestion` replaces exactly those lines:

- **Single-line** — the model sets `line` only. The action posts `{ path, line, body, side: "RIGHT" }`.
- **Multi-line** — the model sets `startLine` (first line) and `line` (last line). The action adds `start_line` + `start_side: "RIGHT"`. `side`/`start_side` are always `RIGHT` because only added/context lines (the new side of the diff) are commentable.

`isValidComment` requires the **entire** `[startLine, line]` range to be in-diff. A contiguous in-diff range always sits within a single hunk, so a range that straddles a gap between hunks is rejected and the finding falls back to the review body — otherwise GitHub would reject the whole `createReview` call, not just that comment. Out-of-diff findings keep their prose and drop the suggestion (a suggestion is meaningless off the diff).

## Source map

| File                                                 | Responsibility                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/reviewOutput/reviewOutput.ts`                   | `inlineCommentSchema` (adds optional `startLine`/`suggestion`); `isValidComment` validates the multi-line range against the diff                    |
| `src/reviewOutput/inlineCommentBody.ts`              | `findHunkForLine`, `renderInlineCommentBody`, `buildReviewComments` — renders the suggestion fence + AI-agent prompt and shapes the Octokit payload |
| `src/submitReview.ts`                                | Calls `buildReviewComments(validComments, prFiles)` for the `createReview` `comments[]` array                                                       |
| `action.yml`                                         | `CLAUDE_JSON_SCHEMA` permits the optional `startLine`/`suggestion` model output                                                                     |
| `claude-plugins/autopilot/skills/pr:review/SKILL.md` | Tells the model when and how to emit `suggestion`/`startLine` (the "Code suggestions" section)                                                      |
