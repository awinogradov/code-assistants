---
name: todo-cleanup
description: Scan codebase for TODO/FIXME comments, verify actuality, create GitHub issues, and update links
allowed-tools:
  - Read
  - Edit
  - Grep
  - Glob
  - Agent
  - Bash(bun run *)
  - Bash(npm run *)
  - Bash(go *)
  - Bash(ruff *)
  - Bash(mypy *)
  - Bash(gh *)
  - MCP(linear:*)
  - ToolSearch
  - AskUserQuestion
---

Scan codebase for TODO and FIXME comments. Check if referenced issues are still open, remove stale comments, create issues for untracked TODOs (GitHub, or Linear on a linear-tracked project), and link them with `@see` tags.

## Input

Arguments: `$ARGUMENTS`

No arguments are expected. Any supplied arguments are ignored.

## Input resolution

- **Language / rules** — read `package.json` `agents.*` directly. No user prompt.

## Phase 1: Read Repository Context

1. Read `package.json` from the repository root
2. Extract `agents.language` field — determines file globs and comment syntax
3. Extract `agents.rules` field — determines verification commands
4. Extract `agents.trackers` — when at least one `linear` tracker is configured the provider is **Linear** (note **every** configured `team` and its `keys`); otherwise **GitHub**. Existing `TEAM-123` TODO ids resolve to their team automatically by key prefix, so checking their state needs no team prompt
5. Determine the repository in `owner/repo` form from `gh repo view --json nameWithOwner --jq .nameWithOwner` (or `git remote get-url origin`)

**Language-to-pattern mapping:**

| Language     | File Glob              | Comment Prefix | Link Format     |
| ------------ | ---------------------- | -------------- | --------------- |
| `typescript` | `**/*.{ts,tsx,js,jsx}` | `//`           | `// @see <url>` |
| `go`         | `**/*.go`              | `//`           | `// @see <url>` |
| `python`     | `**/*.py`              | `#`            | `# @see <url>`  |

**Verification command mapping:**

| Rules             | Command                             |
| ----------------- | ----------------------------------- |
| `Bun`             | `bun run typecheck && bun run lint` |
| `NodeJS+React`    | `npm run typecheck && npm run lint` |
| Go (fallback)     | `go build ./... && go vet ./...`    |
| Python (fallback) | `ruff check . && mypy .`            |

## Phase 2: Scan and Analyze TODOs

Invoke the `scan-and-analyze-todos` sub-agent to scan the codebase for TODO/FIXME comments and check their GitHub issue statuses:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:scan-and-analyze-todos"
- `prompt`: "Scan for TODOs. Language: [language from Phase 1]. Repository: [owner/repo from Phase 1]. Provider: [github or linear]."
- `description`: "Scan and analyze TODOs"
```

The agent returns categorized results: stale (closed issues), already linked (open issues), needs link (has issue number but no @see), and unlinked (no issue reference).

If the agent returns "No TODO or FIXME comments found in the codebase." — stop.

## Phase 3: Present Findings

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in AskUserQuestion `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

1. **Build a summary** of all findings:

   ```
   TODO/FIXME Analysis Results

   Stale (issue closed) - N items:
     src/auth/jwt.ts:42 - TODO: Implement refresh token (#15 - closed)
     src/utils/cache.ts:18 - FIXME: Race condition (#22 - closed)

   Already linked (no action needed) - N items:
     src/api/routes.ts:95 - TODO: Add rate limiting (@see #30 - open)

   Unlinked (need GitHub issues) - N items:
     src/config/env.ts:12 - TODO: Add validation for new env vars
     src/config/env.ts:15 - TODO: Support .env.local override
     src/services/tts.ts:88 - FIXME: Handle timeout gracefully
   ```

2. **If only linked TODOs exist** (nothing to process):
   - Output: `All TODOs are properly linked to open GitHub issues. No cleanup needed.`
   - Stop

3. **If there are stale or unlinked TODOs**, present using AskUserQuestion:

   Tool parameters:
   - `question`: The summary text above (plain text, no markdown)
   - `header`: "TODO Cleanup"
   - `options`: [
     { label: "Process all", description: "Remove stale TODOs, create issues for unlinked" },
     { label: "Review individually", description: "Approve each TODO action one by one" },
     { label: "Cancel", description: "Exit without changes" }
     ]
   - `multiSelect`: false

If user selects "Cancel", stop without changes.

## Phase 4: Execute

### 4a. Remove stale TODOs

For each stale TODO:

1. Read the file containing the TODO
2. Use Edit tool to remove the TODO comment line
3. If the next line is a `@see` link line, remove that line too
4. If "Review individually" was selected, use AskUserQuestion before each removal:

   Tool parameters:
   - `question`: "Remove stale TODO?\n\nFile: src/auth/jwt.ts:42\nTODO: Implement refresh token\nIssue: #15 (closed)"
   - `header`: "Remove"
   - `options`: [
     { label: "Remove", description: "Delete this TODO comment" },
     { label: "Keep", description: "Leave this TODO in place" }
     ]
   - `multiSelect`: false

### 4b. Create GitHub issues for unlinked TODOs

1. **Resolve the destination team for new Linear tickets** (Linear provider only): with exactly one `linear` tracker, use its `team` (no prompt); with two or more, ask once via AskUserQuestion (single-select) which team new tickets go on — one option per team, `{ label: "<team>", description: "<comma-joined keys>" }` — and reuse the chosen `team` for every unlinked TODO below.

2. **Group related TODOs** when possible:
   - TODOs in the same file within 10 lines of each other
   - Present grouping to user for confirmation if "Review individually" was selected

3. **For each TODO or group of TODOs:**

   a. Generate an issue title from the TODO description:
   - Single TODO: use the description directly, cleaned up and capitalized
   - Grouped TODOs: synthesize a title covering the group

   b. Generate an issue body in markdown with:
   - The TODO text(s)
   - File path(s) and line number(s)
   - Surrounding code context

   c. Create the issue:
   - **GitHub:** `gh issue create --title "<title>" --body "<body>"`
   - **Linear:** the Linear MCP `save_issue` tool with `{ "title": "<title>", "team": "<team>", "description": "<body>" }` (the `team` resolved in step 1 above)

     <!-- Canonical: [linear:create SKILL.md](../linear:create/SKILL.md#completion-requirement) Linear MCP access note — keep this paragraph in sync with it (only the tool list varies). -->

     **Linear MCP access:** Linear operations here use the session's connected Linear MCP server, matching tools by name — the suffix after the final `__` (`save_issue`) — under whatever server prefix the session exposes: the bundled `mcp__plugin_autopilot_linear__*` or a user-configured Linear server such as `mcp__linear-server__*` (Claude Code connects one server per endpoint; a user-scope server shadows the bundled one). The prefix must identify a Linear server (a `linear` server name or the `mcp.linear.app` endpoint) — never bind a generic tool name like `get_issue` to a non-Linear MCP. If a tool is not visible, search for it with ToolSearch by bare tool name before concluding it is absent. Only when no Linear MCP tool resolves under any prefix, stop and tell the user — never silently skip ticket creation: `No Linear MCP available — check /mcp for a disconnected or unauthenticated Linear server, or connect one: claude mcp add --transport http linear https://mcp.linear.app/mcp`.

   d. Capture the created issue's URL (GitHub prints it on the last line; for Linear use the returned ticket URL).

   e. Use Edit tool to add `@see` link on the line after the TODO comment:
   - TypeScript/Go: `// @see <issue-url>`

### 4c. Add links for "referenced but not linked" TODOs

1. Build the issue URL — GitHub: `https://github.com/<owner>/<repo>/issues/<N>`; Linear: the ticket URL (e.g. `https://linear.app/<org>/issue/<ID>`)
2. Use Edit tool to add `@see` link on the line after the TODO:
   - TypeScript/Go: `// @see <issue-url>`

## Phase 5: Verify

1. Run verification command determined in [Phase 1](#phase-1-read-repository-context) based on `agents.rules` field
2. If verification fails:
   - Report the errors
   - Attempt to fix (e.g., indentation issues from comment removal)
   - Re-run verification

## Phase 6: Summary

Output cleanup results:

```
TODO Cleanup Complete

Removed (stale) - N items:
  src/auth/jwt.ts:42 - #15 (closed)
  src/utils/cache.ts:18 - #22 (closed)

Created GitHub issues - N items:
  src/config/env.ts:12 - #48: Add validation for new env vars
  src/services/tts.ts:88 - #49: Handle TTS timeout gracefully

Linked (added @see) - N items:
  src/api/handler.ts:30 - #33

Already linked (skipped) - N items:
  src/api/routes.ts:95 - #30 (open)

Verification: Passed
```

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as `[title](url)` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
