# Linear tracker support

> Chapter 11 of the [repository docs](../README.md#repository-docs).

Autopilot is GitHub-first: by default every issue-aware skill reads and writes GitHub issues through the `gh` CLI. A project can opt into **Linear** instead with a single `package.json` switch. GitHub stays the zero-config default — repositories that set nothing behave exactly as before.

This chapter covers the **foundation** (read path): how a project enables Linear, how a skill resolves the active provider, and the two ways autopilot reaches Linear. Branch and pull-request conventions, issue creation and listing, and TODO links arrive in later phases (tracked under issue #339).

## Enabling Linear

Add `tracker` and a `linear` block to the repo-root `package.json` `agents` object (the same object that already declares `rules` and `language` — see [the `agents` field](./02-agents-field.md)):

```json
{
  "agents": {
    "rules": "Bun",
    "language": "typescript",
    "tracker": "linear",
    "linear": { "team": "ENG", "keys": ["ENG"], "label": "autopilot" }
  }
}
```

| Key            | Required         | Meaning                                                          |
| -------------- | ---------------- | ---------------------------------------------------------------- |
| `tracker`      | no (default)     | `"linear"` or `"github"`; absent ⇒ `"github"` (today's behavior) |
| `linear.team`  | yes, when Linear | Team key — the `ENG` in `ENG-123`                                |
| `linear.keys`  | no               | ID prefixes that route to Linear; defaults to `[team]`           |
| `linear.label` | no               | Label applied to issues autopilot creates on Linear              |

## How a skill resolves the provider

A skill reads `agents.tracker` from `package.json` (via the Read tool — no extra tooling). `"linear"` selects Linear; anything else, a missing `tracker`, or no `agents` block selects GitHub.

The [`plan`](../claude-plugins/autopilot/skills/plan/SKILL.md) and `run` skills add two input-detection rows — a `linear.app` URL and the uppercase `^[A-Z]+-[0-9]+$` ID (e.g. `ENG-123`) — placed after the code-scanning-alert row and before the bare-number row. They fire only when `tracker == "linear"` (and, when `linear.keys` is set, only for those prefixes), and the `KEY-N` shape never collides with a bare GitHub issue number, so a Linear-shaped argument in a GitHub project simply falls through to a plain task description.

## Access paths: MCP first, GraphQL fallback

The user chose dual access, so autopilot reaches Linear two ways:

- **Linear MCP server (interactive).** The plugin ships a `linear` server in [`.mcp.json`](../claude-plugins/autopilot/.mcp.json) (`https://mcp.linear.app/mcp`, OAuth). Interactive sessions call `mcp__plugin_autopilot_linear__*` tools — no secrets to manage.
- **GraphQL helper (headless/CI).** Where the OAuth flow cannot run, a bundled zero-dependency helper — [`fetch-issue.mjs`](../claude-plugins/autopilot/lib/linear/fetch-issue.mjs) (Node 18+, global `fetch`, no install step) — calls the Linear GraphQL API keyed by `LINEAR_API_KEY` and prints the same JSON contract as the MCP path.

## The single resolution seam

Every issue read flows through the [`resolve-issue-context`](../claude-plugins/autopilot/agents/resolve-issue-context.md) agent, which returns a **provider-agnostic** JSON object (`source`, `issueId`, `title`, `status`, `labels`, `assignee`, `description`, `comments`). For Linear it tries the MCP tools, falls back to the GraphQL helper, then degrades with a non-null `resolveError` that the caller surfaces before stopping. Because `plan`, `run`, and every other consumer read that JSON — never raw tracker output — GitHub and Linear share one downstream code path; only this agent and the input-detection rows are provider-aware. `issueId` is a number for GitHub and the string identifier (e.g. `"ENG-123"`) for Linear.
