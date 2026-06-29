# Linear tracker support

> Chapter 11 of the [repository docs](../README.md#repository-docs).

Autopilot is GitHub-first: by default every issue-aware skill reads and writes GitHub issues through the `gh` CLI. A project can opt into **Linear** — on its own or alongside GitHub — through the `package.json` `agents.trackers` array. GitHub stays the zero-config default — repositories that set nothing behave exactly as before.

This chapter covers configuring trackers, how a skill resolves the active provider, the two ways autopilot reaches Linear, the branch and pull-request conventions on the write path, creating and listing Linear issues, and keeping TODO links and ticket state in sync — the complete Linear tracker reference.

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

Several `linear` entries may be listed so multiple teams can share one repo. Each issue id routes to its team by key prefix:

```json
{
  "agents": {
    "trackers": [
      { "type": "linear", "team": "FRTNS", "keys": ["FRTNS"] },
      { "type": "linear", "team": "ENG", "keys": ["ENG"] },
      { "type": "github" }
    ]
  }
}
```

The array is validated when the [`agents-rules-sync`](../.github/actions/agents-rules-sync/README.md) action syncs a repository: a `linear` entry missing `team`, a key prefix that routes to more than one tracker, or a second `github` entry fails the sync with a docs-linked error. Absent or single-tracker configs are unaffected.

## How a skill resolves the provider

A skill reads `agents.trackers` from `package.json` (via the Read tool — no extra tooling) and routes each argument to the tracker whose shape it matches, so several trackers coexist.

The [`plan`](../claude-plugins/autopilot/skills/plan/SKILL.md) and `run` skills add two input-detection rows — a `linear.app` URL and the uppercase `^[A-Z]+-[0-9]+$` ID (e.g. `ENG-123`) — placed after the code-scanning-alert row and before the bare-number row. The Linear rows are active only when a `linear` tracker is configured (and, when that entry's `keys` are set, only for those prefixes); the GitHub rows are active when a `github` tracker is configured (the default). With both configured, `ENG-123` routes to Linear while `#42`, a bare `123`, or a `github.com` URL routes to GitHub — internal and external trackers side by side. A Linear-shaped argument with no matching `linear` tracker collides with no GitHub numeric row and falls through to a plain task description, so existing GitHub repos are unaffected.

When several `linear` trackers are configured, an incoming `KEY-N` id is matched against the **union of every** `linear` tracker's effective keys (an entry's `keys`, or `[team]` when `keys` is omitted), and the matched entry supplies the `team`. With `FRTNS` and `ENG` side by side, `FRTNS-12` routes to the FRTNS team and `ENG-3` to ENG, while a bare number or `github.com` URL still routes to GitHub:

```text
  FRTNS-12  ──▶ key FRTNS ──▶ linear FRTNS ─┐
  ENG-3     ──▶ key ENG   ──▶ linear ENG   ─┼──▶ resolve-issue-context
  #42 / 123 ──▶ number    ──▶ github       ─┘    → provider-agnostic JSON
  add-cache ──▶ no match  ──▶ plain description (planned directly)
```

**Flow Legend:**

- `FRTNS-12` — its `FRTNS` key matches the FRTNS tracker; resolved on team FRTNS.
- `ENG-3` — its `ENG` key matches the ENG tracker; resolved on team ENG.
- `#42` / a bare `123` / a `github.com` URL — numeric shape; resolved on GitHub.
- `add-cache` (or a `KEY` matching no configured tracker) — falls through to a plain task description and is planned directly, with no issue lookup.

The three tracker branches converge on the single [`resolve-issue-context`](#the-single-resolution-seam) seam, so everything downstream stays provider-agnostic regardless of which team an id belonged to.

### Choosing a team on the write path

Reading an issue never prompts — the id's key prefix already names the team. Creating or listing does, because the team is not given by an id: when two or more `linear` trackers are configured, [`linear:create`](../claude-plugins/autopilot/skills/linear:create/SKILL.md), [`issue:run`](../claude-plugins/autopilot/skills/issue:run/SKILL.md), and [`todo-cleanup`](../claude-plugins/autopilot/skills/todo-cleanup/SKILL.md) ask once via `AskUserQuestion` which team to file on or browse, then proceed against the chosen team. A single `linear` tracker auto-selects with no prompt, so existing one-team repos are unchanged.

## Access paths: MCP first, GraphQL fallback

Autopilot reaches Linear two ways:

- **Linear MCP server (interactive).** The plugin ships a `linear` server in [`.mcp.json`](../claude-plugins/autopilot/.mcp.json) (`https://mcp.linear.app/mcp`, OAuth). Interactive sessions call `mcp__plugin_autopilot_linear__*` tools — no secrets to manage.
- **GraphQL helper (headless/CI).** Where the OAuth flow cannot run, a bundled zero-dependency helper — [`fetch-issue.mjs`](../claude-plugins/autopilot/lib/linear/fetch-issue.mjs) (Node 18+, global `fetch`, no install step) — calls the Linear GraphQL API keyed by `LINEAR_API_KEY` and prints the same JSON contract as the MCP path.

## The single resolution seam

Every issue read flows through the [`resolve-issue-context`](../claude-plugins/autopilot/agents/resolve-issue-context.md) agent, which returns a **provider-agnostic** JSON object (`source`, `issueId`, `title`, `status`, `labels`, `assignee`, `description`, `comments`). For Linear it tries the MCP tools, falls back to the GraphQL helper, then degrades with a non-null `resolveError` that the caller surfaces before stopping. Because `plan`, `run`, and every other consumer read that JSON — never raw tracker output — GitHub and Linear share one downstream code path; only this agent and the input-detection rows are provider-aware. `issueId` is a number for GitHub and the string identifier (e.g. `"ENG-123"`) for Linear.

## Branches and pull requests

Once a Linear ticket is resolved, the write path mirrors the GitHub flow with Linear identifiers:

- **Branch** — [`branch:create`](../claude-plugins/autopilot/skills/branch:create/SKILL.md) builds `<team>-<n>-<slug>` (the ticket id lowercased, e.g. `ENG-123` → `eng-123-add-auth`) instead of GitHub's `issue-<n>-<slug>`. Passing `--start` also moves the ticket to "In Progress" (best-effort) via the Linear MCP `list_issue_statuses` + `save_issue` tools.
- **Pull request** — [`pr:create`](../claude-plugins/autopilot/skills/pr:create/SKILL.md) and [`pr:update`](../claude-plugins/autopilot/skills/pr:update/SKILL.md) detect the provider from the branch shape, prefix the title with the uppercase id (`ENG-123: <description>`) so the ticket shows in the PR list, and put `Closes ENG-123` (or `Part of` / `Related to`) in the `**Issues:**` section. GitHub branches keep their business-only title and `Closes #N`.
- **Done on merge** — a Linear ticket auto-closes on merge only when the [GitHub↔Linear integration](https://linear.app/docs/github) is configured for the repository; otherwise the magic word is a tracked reference.

The shared CI gates accept both conventions: the branch-name and semantic-PR-title checks in the [`contributing-check`](../.github/actions/contributing-check/action.yml) action — and the local [`pre-push`](../.husky/pre-push) hook — recognise the Linear `<team>-<n>-<slug>` branch and the `ENG-123:` title alongside the GitHub forms.

## Creating and listing issues

- **Create** — [`linear:create`](../claude-plugins/autopilot/skills/linear:create/SKILL.md) is the Linear counterpart to `issue:create`: it generates the same five-section body (Context/What/Why/Scope/Solution), then a short wizard picks the workflow status (`list_issue_statuses`), labels (`list_issue_labels`, pre-selecting the `agents.trackers` repo label), and an assignee, and creates the ticket with `save_issue`.
- **List and run** — [`issue:run`](../claude-plugins/autopilot/skills/issue:run/SKILL.md) lists the team's recent open tickets via `list_issues` (instead of `gh issue list`) and hands the chosen `TEAM-123` identifier to `autopilot:run`.
- **Assignees** — the [`resolve-assignees`](../claude-plugins/autopilot/agents/resolve-assignees.md) agent gathers candidates from CODEOWNERS and the Linear team's members; Linear member listing is best-effort and degrades to CODEOWNERS when the MCP user-list tool is unavailable.

## TODO links and issue state

- **TODO cleanup** — [`todo-cleanup`](../claude-plugins/autopilot/skills/todo-cleanup/SKILL.md) and the [`scan-and-analyze-todos`](../claude-plugins/autopilot/agents/scan-and-analyze-todos.md) agent recognise Linear ids (`TEAM-123`) and `@see https://linear.app/...` links: a ticket in `Done` or `Canceled` marks the TODO stale, and unlinked TODOs become Linear tickets (via `save_issue`) on a linear-tracked project.
- **Issue state** — `branch:create --start` moves a ticket to "In Progress" (see [Branches and pull requests](#branches-and-pull-requests)). The [`plan`](../claude-plugins/autopilot/skills/plan/SKILL.md) and [`run`](../claude-plugins/autopilot/skills/run/SKILL.md) skills pass `--start` automatically for a `linear-issue` input, so the ticket transitions to "In Progress" at branch creation the moment work starts — the analog of GitHub auto-assignment. A ticket returns to Done on merge only when the [GitHub↔Linear integration](https://linear.app/docs/github) is configured, since autopilot expresses the intent through the PR's `Closes TEAM-123` magic word rather than writing the state directly.
