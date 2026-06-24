# Linear tracker support

> Chapter 11 of the [repository docs](../README.md#repository-docs).

Autopilot is GitHub-first: by default every issue-aware skill reads and writes GitHub issues through the `gh` CLI. A project can opt into **Linear** — on its own or alongside GitHub — through the `package.json` `agents.trackers` array. GitHub stays the zero-config default — repositories that set nothing behave exactly as before.

This chapter covers the **foundation** (read path): how a project enables Linear, how a skill resolves the active provider, and the two ways autopilot reaches Linear. Branch and pull-request conventions, issue creation and listing, and TODO links arrive in later phases (tracked under issue #339).

## Configuring trackers

Add a `trackers` array to the repo-root `package.json` `agents` object (the same object that already declares `rules` and `language` — see [the `agents` field](./02-agents-field.md)). Each entry is one tracker; list more than one to run several side by side. A common setup is Linear for internal issues and GitHub for external user feedback:

```json
{
  "agents": {
    "rules": "Bun",
    "language": "typescript",
    "trackers": [
      { "type": "linear", "team": "ENG", "keys": ["ENG"], "label": "autopilot" },
      { "type": "github" }
    ]
  }
}
```

When `trackers` is absent, autopilot behaves as if it were `[{ "type": "github" }]` — today's GitHub-only behavior. The shape mirrors `release-action`'s ticket-system config, which is also a list.

| Field   | Required          | Meaning                                                             |
| ------- | ----------------- | ------------------------------------------------------------------- |
| `type`  | yes               | `"linear"` or `"github"`                                            |
| `team`  | yes, for `linear` | Linear team key — the `ENG` in `ENG-123`                            |
| `keys`  | no                | ID prefixes that route to that Linear tracker; defaults to `[team]` |
| `label` | no                | Label applied to issues autopilot creates on that Linear tracker    |

## How a skill resolves the provider

A skill reads `agents.trackers` from `package.json` (via the Read tool — no extra tooling) and routes each argument to the tracker whose shape it matches, so several trackers coexist.

The [`plan`](../claude-plugins/autopilot/skills/plan/SKILL.md) and `run` skills add two input-detection rows — a `linear.app` URL and the uppercase `^[A-Z]+-[0-9]+$` ID (e.g. `ENG-123`) — placed after the code-scanning-alert row and before the bare-number row. The Linear rows are active only when a `linear` tracker is configured (and, when that entry's `keys` are set, only for those prefixes); the GitHub rows are active when a `github` tracker is configured (the default). With both configured, `ENG-123` routes to Linear while `#42`, a bare `123`, or a `github.com` URL routes to GitHub — internal and external trackers side by side. A Linear-shaped argument with no matching `linear` tracker collides with no GitHub numeric row and falls through to a plain task description, so existing GitHub repos are unaffected.

## Access paths: MCP first, GraphQL fallback

Autopilot reaches Linear two ways:

- **Linear MCP server (interactive).** The plugin ships a `linear` server in [`.mcp.json`](../claude-plugins/autopilot/.mcp.json) (`https://mcp.linear.app/mcp`, OAuth). Interactive sessions call `mcp__plugin_autopilot_linear__*` tools — no secrets to manage.
- **GraphQL helper (headless/CI).** Where the OAuth flow cannot run, a bundled zero-dependency helper — [`fetch-issue.mjs`](../claude-plugins/autopilot/lib/linear/fetch-issue.mjs) (Node 18+, global `fetch`, no install step) — calls the Linear GraphQL API keyed by `LINEAR_API_KEY` and prints the same JSON contract as the MCP path.

## The single resolution seam

Every issue read flows through the [`resolve-issue-context`](../claude-plugins/autopilot/agents/resolve-issue-context.md) agent, which returns a **provider-agnostic** JSON object (`source`, `issueId`, `title`, `status`, `labels`, `assignee`, `description`, `comments`). For Linear it tries the MCP tools, falls back to the GraphQL helper, then degrades with a non-null `resolveError` that the caller surfaces before stopping. Because `plan`, `run`, and every other consumer read that JSON — never raw tracker output — GitHub and Linear share one downstream code path; only this agent and the input-detection rows are provider-aware. `issueId` is a number for GitHub and the string identifier (e.g. `"ENG-123"`) for Linear.
