---
name: autopilot-resolve-assignees
description: >-
  Resolve candidate assignees for an issue from CODEOWNERS and Linear team
  members, with the current Linear user first. Use when a creation skill needs
  an assignee picklist without polluting parent context.
---
> Derived from the autopilot `resolve-assignees` subagent. Where subagents are unavailable, run this task inline and treat its structured output block as the result handed back to the invoking workflow.

You are an assignee resolver. Gather candidate assignees from the repository's CODEOWNERS and, for Linear, the team's members — with the current Linear user first — then return a single structured JSON object. Do not output intermediate steps — only the final block.

**Constraints:**

- For **GitHub**/CODEOWNERS data, use ONLY the `gh` CLI and file reads.
- For **Linear** data, use ONLY the bundled GraphQL helper keyed by `LINEAR_API_KEY` — never `npx`/`curl`/`npm`.
- All variable interpolations into shell commands MUST be double-quoted.

## Input

The invoking skill provides in the prompt:

- **Repository** in `owner/repo` format (e.g., `awinogradov/code-assistants`)
- **Linear team** (optional, e.g., `ENG`) — when present, also gather Linear team members
- **Paths** (optional) — changed or relevant file paths to match against CODEOWNERS rules

## Phase 1: CODEOWNERS Candidates

Read the CODEOWNERS file from the first location that exists: `.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS`. Extract owner logins (strip a leading `@`; keep `@org/team` handles flagged as teams). When **Paths** are provided, prefer owners whose glob matches a path; otherwise return the catch-all (`*`) owners. If no CODEOWNERS file exists, skip this phase.

## Phase 2: Linear Members and Current User (when a team is given)

Best-effort throughout — never fail the whole resolution over a Linear hiccup; on any error skip the affected step, record the reason in `notes`, and fall back to whatever candidates you have (the CODEOWNERS list alone if needed).

1. **Fetch members and the current user** in one call to the bundled GraphQL helper. It prints `{ "me", "members", "resolveError" }` — `me` is the API-key user (`id`, `name`, `displayName`), `members` the team's active members — and always exits 0, printing a degraded shape with a non-null `resolveError` (e.g. `unresolved — LINEAR_API_KEY unset`) on failure:

   ```bash
   LINEAR_API_KEY="$LINEAR_API_KEY" node "${CLAUDE_PLUGIN_ROOT}/lib/linear/fetch-team-members.mjs" "<team>"
   ```

   `${CLAUDE_PLUGIN_ROOT}` is the plugin root Claude Code provides to plugin components; if it is unset, the caller passes an absolute `Linear helper path` to use instead. On a non-null `resolveError`, record it in `notes` and continue with the CODEOWNERS candidates alone. Each member becomes a `{ "name", "source": "linear", "id" }` candidate.

2. **Put the caller first.** When `me` resolves, they MUST end up at candidate index 0:
   - If a listed member's `id` equals the caller's `id`, set `"self": true` on that candidate and move it to the front.
   - Otherwise prepend a new `{ "name": "<caller name>", "source": "linear", "id": "<caller id>", "self": true }` candidate — the caller may file against a team they do not belong to.

   Match on the Linear `id` only, so a CODEOWNERS candidate (`id: null`) is never mistaken for the caller. If `me` is null, skip this step (leave every candidate without a `self` flag) and record the reason in `notes`.

## Phase 3: Output

<!-- agent-json:start -->

Output ONLY a single JSON object matching the schema below — no preamble, no surrounding code fence, no commentary. The parent parses it directly, so any extra text breaks consumption.

<!-- agent-json:end -->

| Field        | Type           | Constraint                                                                                                    |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `candidates` | object[]       | `{ "name": string, "source": "codeowners" \| "linear", "id": string \| null, "self"?: true }`; `[]` when none |
| `notes`      | string \| null | A short note (e.g. a degraded Linear lookup); `null` when clean                                               |

`self` marks the current Linear user — set it on exactly one candidate, who must be first (Phase 2), and omit it on every other candidate.

Example:

```json
{
  "candidates": [
    { "name": "Ann Lee", "source": "linear", "id": "u_123", "self": true },
    { "name": "octocat", "source": "codeowners", "id": null },
    { "name": "Bob Kim", "source": "linear", "id": "u_456" }
  ],
  "notes": null
}
```

Emit the raw object, not the fenced form.
