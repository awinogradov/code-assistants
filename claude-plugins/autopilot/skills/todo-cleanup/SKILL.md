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
  - AskUserQuestion
---

Scan codebase for TODO and FIXME comments. Check if referenced issues are still open, remove stale comments, create GitHub issues for untracked TODOs, and link them with `@see` tags.

## Input

Arguments: `$ARGUMENTS`

No arguments are expected. Any supplied arguments are ignored.

## Input resolution

- **Language / rules** — read `package.json` `agents.*` directly. No user prompt.

## Phase 1: Read Repository Context

1. Read `package.json` from the repository root
2. Extract `agents.language` field — determines file globs and comment syntax
3. Extract `agents.rules` field — determines verification commands
4. Determine the repository in `owner/repo` form from `gh repo view --json nameWithOwner --jq .nameWithOwner` (or `git remote get-url origin`)

**Language-to-pattern mapping:**

| Language     | File Glob              | Comment Prefix | Link Format     |
| ------------ | ---------------------- | -------------- | --------------- |
| `typescript` | `**/*.{ts,tsx,js,jsx}` | `//`           | `// @see <url>` |
| `go`         | `**/*.go`              | `//`           | `// @see <url>` |

**Verification command mapping:**

| Rules          | Command                             |
| -------------- | ----------------------------------- |
| `Bun`          | `bun run typecheck && bun run lint` |
| `NodeJS+React` | `npm run typecheck && npm run lint` |
| Go (fallback)  | `go build ./... && go vet ./...`    |

## Phase 2: Scan and Analyze TODOs

Invoke the `scan-and-analyze-todos` sub-agent to scan the codebase for TODO/FIXME comments and check their GitHub issue statuses:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:scan-and-analyze-todos"
- `prompt`: "Scan for TODOs. Language: [language from Phase 1]. Repository: [owner/repo from Phase 1]."
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

### 5a. Remove stale TODOs

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

### 5b. Create GitHub issues for unlinked TODOs

1. **Group related TODOs** when possible:
   - TODOs in the same file within 10 lines of each other
   - Present grouping to user for confirmation if "Review individually" was selected

2. **For each TODO or group of TODOs:**

   a. Generate an issue title from the TODO description:
   - Single TODO: use the description directly, cleaned up and capitalized
   - Grouped TODOs: synthesize a title covering the group

   b. Generate an issue body in markdown with:
   - The TODO text(s)
   - File path(s) and line number(s)
   - Surrounding code context

   c. Create the issue:

   ```bash
   gh issue create --title "<title>" --body "<body>"
   ```

   d. Capture the issue URL from the `gh issue create` output (it prints the URL on the last line).

   e. Use Edit tool to add `@see` link on the line after the TODO comment:
   - TypeScript/Go: `// @see <issue-url>`

### 5c. Add links for "referenced but not linked" TODOs

1. Build the issue URL: `https://github.com/<owner>/<repo>/issues/<N>`
2. Use Edit tool to add `@see` link on the line after the TODO:
   - TypeScript/Go: `// @see <issue-url>`

## Phase 5: Verify

1. Run verification command determined in Phase 1 based on `agents.rules` field
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
