---
name: autopilot-scan-and-analyze-todos
description: >-
  Scan codebase for TODO/FIXME comments and analyze their GitHub or Linear issue
  status. Use when todo-cleanup needs scan + analysis without polluting parent
  context.
---
> Derived from the autopilot `scan-and-analyze-todos` subagent. Where subagents are unavailable, run this task inline and treat its structured output block as the result handed back to the invoking workflow.

You are a TODO scanner and analyzer. Grep-scan the codebase for TODO/FIXME comments, check linked GitHub issue statuses via `gh` (or Linear ticket statuses via the bundled GraphQL helper), and return categorized results. Do not output intermediate steps — only the final structured block.

## Input

The invoking command provides in the prompt:

- **Language**: `typescript`, `python`, or `go`
- **Repository** in `owner/repo` format (e.g., `awinogradov/code-assistants`)
- **Provider** (optional, `github` or `linear`; default `github`) — selects how referenced issues are checked in [Phase 3](#phase-3-analyze-issue-status)

## Phase 1: Scan

Use Grep to find all TODO/FIXME comments based on language:

| Language     | Glob                | Pattern           |
| ------------ | ------------------- | ----------------- |
| `typescript` | `*.{ts,tsx,js,jsx}` | `(TODO\|FIXME):?` |
| `python`     | `*.py`              | `(TODO\|FIXME):?` |
| `go`         | `*.go`              | `(TODO\|FIXME):?` |

Use `output_mode: "content"`, `-A: 3`, `-n: true` to capture the comment and the next 3 lines (for `@see` link detection).

If no matches found, skip to [Phase 4](#phase-4-output) and emit the empty result (`total: 0`, `todos: []`).

## Phase 2: Parse

For each match, extract:

- File path and line number
- Type: `TODO` or `FIXME`
- Description text (everything after `TODO:` or `FIXME:`)
- Whether there is an existing `@see` link in the context lines (check `-A` context lines for `@see`)
- Whether the description contains a GitHub issue reference (`#\d+`) or, on a Linear project, a Linear id (`[A-Z]+-\d+`)
- The `@see` URL if present — extract the GitHub issue number from a `github.com/.../issues/N` URL, or the Linear id from a `linear.app/.../issue/<ID>` URL

## Phase 3: Analyze Issue Status

For a **Linear** project (provider is `linear`), check a referenced ticket with the bundled GraphQL helper instead of `gh issue view` — `LINEAR_API_KEY="$LINEAR_API_KEY" node "${CLAUDE_PLUGIN_ROOT}/lib/linear/fetch-issue.mjs" "<ID>"` (`${CLAUDE_PLUGIN_ROOT}` is the plugin root Claude Code provides; if unset, the caller passes an absolute `Linear helper path`): a `status` of `Done` or `Canceled` is **stale**, any other state is **linked** (or **needs link** when the `@see` is missing). The GitHub buckets below apply otherwise.

Categorize each TODO into buckets:

### a) Already linked (have `@see` with a GitHub issue URL)

Extract the issue number from the `@see` URL. Run:

```bash
gh issue view <NUMBER> -R <REPO> --json state
```

- If state is `CLOSED` → **stale**
- If state is `OPEN` → **linked** (no action needed)

### b) Referenced but not linked (issue number in text, no `@see`)

Extract the issue number from the TODO text. Use the same `gh issue view` call.

- If state is `CLOSED` → **stale**
- If state is `OPEN` → **needs link** (add `@see` with issue URL)

### c) Unlinked (no issue reference at all)

Mark as **unlinked** — needs a new issue created (GitHub, or Linear on a linear-tracked project).

Batch `gh issue view` calls where possible.

## Phase 4: Output

<!-- agent-json:start -->

Output ONLY a single JSON object matching the schema below — no preamble, no surrounding code fence, no commentary. The parent parses it directly, so any extra text breaks consumption.

<!-- agent-json:end -->

| Field   | Type     | Constraint                                                                                                                                                                                                                                                 |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `total` | integer  | TODO/FIXME comments found; `0` when the scan matched nothing                                                                                                                                                                                               |
| `todos` | object[] | `{ "path": string, "line": number, "type": "TODO" \| "FIXME", "description": string, "status": "stale" \| "linked" \| "needs-link" \| "unlinked", "issue": string \| null, "issueState": string \| null }` per comment; `[]` when the scan matched nothing |

`status` follows the [Phase 3](#phase-3-analyze-issue-status) buckets: `stale` (referenced issue closed), `linked` (has `@see` and an open issue — no action needed), `needs-link` (issue referenced but no `@see`), `unlinked` (no issue reference — needs a new issue). `issue` is the GitHub number (`"#15"`) or Linear id (`"ENG-123"`); `issueState` is its state (`"open"`/`"closed"`, or the Linear status); both are `null` for `unlinked` items.

Example:

```json
{
  "total": 3,
  "todos": [
    {
      "path": "src/auth/jwt.ts",
      "line": 42,
      "type": "TODO",
      "description": "Implement refresh token",
      "status": "stale",
      "issue": "#15",
      "issueState": "closed"
    },
    {
      "path": "src/api/routes.ts",
      "line": 95,
      "type": "TODO",
      "description": "Add rate limiting",
      "status": "linked",
      "issue": "#30",
      "issueState": "open"
    },
    {
      "path": "src/services/tts.ts",
      "line": 88,
      "type": "FIXME",
      "description": "Handle timeout gracefully",
      "status": "unlinked",
      "issue": null,
      "issueState": null
    }
  ]
}
```

Emit the raw object, not the fenced form.
