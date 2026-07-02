# Code review action

[![GitHub Release](https://img.shields.io/badge/release-v1.5.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that runs AI code review on pull requests using [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Has two modes:

- **`review`** — runs the `/autopilot:pr-review` skill against the PR diff and submits a structured review (approve / request changes / comment) with optional inline findings, each carrying a one-click suggestion fix and a "Prompt for AI agents" block where applicable.
- **`react`** — runs the `/autopilot:pr-answer` skill against a triggering PR comment to draft a reply, resolve threads, and optionally update the existing review.

Auto-detection routes events from `pull_request`, `issue_comment`, and `pull_request_review_comment` triggers to the correct mode. Drafts, release branches, and dependabot PRs are skipped automatically.

## Usage

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

concurrency:
  # comment.id gives each comment its own group so bursty replies aren't cancelled;
  # it's empty for pull_request events, which stay grouped per-PR (event_name + number).
  group: code-review-${{ github.event_name }}-${{ github.event.pull_request.number || github.event.issue.number }}-${{ github.event.comment.id }}
  cancel-in-progress: true

jobs:
  ai-review:
    if: github.event_name != 'issue_comment' || github.event.issue.pull_request
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: awinogradov/code-assistants/.github/actions/code-review-action@v1
        with:
          reviewer: ${{ vars.BOT_USERNAME }}
          bot_token: ${{ secrets.BOT_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The `if` condition prevents runner provisioning for non-PR issue comments. All other filtering (bot mentions, author checks, event validation) is handled internally.

## Inputs

| Input                  | Required | Default                  | Description                                                                                                                                                                   |
| ---------------------- | -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reviewer`             | yes      | —                        | GitHub username added as reviewer and used for `@mention` triggering.                                                                                                         |
| `bot_token`            | yes      | —                        | GitHub token for bot operations (`contents: read`, `pull-requests: write`).                                                                                                   |
| `anthropic_api_key`    | no       | —                        | Anthropic API key. One of `anthropic_api_key`, `anthropic_auth_token`, or `claude_oauth_token` is required.                                                                   |
| `claude_oauth_token`   | no       | —                        | Claude Code OAuth token. Alternative to `anthropic_api_key`.                                                                                                                  |
| `anthropic_base_url`   | no       | —                        | Custom Anthropic API base URL for a gateway/proxy/compatible endpoint (full URL with scheme, e.g. `https://gateway.example.com`). Unset uses the default `api.anthropic.com`. |
| `anthropic_auth_token` | no       | —                        | Bearer token for a custom Anthropic host (sent as `Authorization: Bearer`). Alternative to `anthropic_api_key` — set one, not both.                                           |
| `mode`                 | no       | `review`                 | Action mode: `review` or `react`. Auto-detected when `react_to_comments` is `true`.                                                                                           |
| `react_to_comments`    | no       | `true`                   | Auto-detect comment events and route to `react` mode.                                                                                                                         |
| `bot_username`         | no       | falls back to `reviewer` | Username for skipping CI-author PRs labeled `ci-skip-review`.                                                                                                                 |
| `release_pr_authors`   | no       | —                        | Comma-separated trusted authors whose `release-*`/`delivery-*` PRs are auto-approved. Empty disables it. See [Release PR auto-approval](#release-pr-auto-approval).           |
| `model`                | no       | `claude-sonnet-5`        | Claude model to use.                                                                                                                                                          |
| `settings`             | no       | —                        | Claude Code settings JSON (e.g., env vars for MCP servers).                                                                                                                   |
| `mcp_config`           | no       | —                        | Additional MCP server configuration JSON, merged with repo `.mcp.json`.                                                                                                       |
| `preflight_checks`     | no       | `true`                   | Wait for PR checks to pass before running review (review mode only).                                                                                                          |
| `poll_interval`        | no       | `10`                     | Seconds between check status polls.                                                                                                                                           |
| `checks_timeout`       | no       | `600`                    | Maximum seconds to wait for checks.                                                                                                                                           |
| `rules_doc_url`        | no       | see `action.yml`         | Canonical blob URL of the `pr:review` SKILL.md (literal default in `action.yml`); skills build `CHECK-*` links from it. Override only for forks.                              |
| `review_prompt`        | no       | `/autopilot:pr-review`   | Slash command for `review` mode; override to run a different review skill. Appends runtime args (REPO, PR_NUMBER, REVIEWER, PR_AUTHOR, RULES_DOC_URL).                        |
| `react_prompt`         | no       | `/autopilot:pr-answer`   | Slash command for `react` mode; override to run a different reply skill. Appends runtime args (REPO, PR_NUMBER, REVIEWER, comment fields, NEEDS_REVERDICT, RULES_DOC_URL).    |
| `marketplaces`         | no       | —                        | Plugin marketplaces to register, one `name=source` per line. See [Installing plugins](#installing-plugins).                                                                   |
| `plugins`              | no       | —                        | Plugins to install, one `plugin@marketplace` per line. See [Installing plugins](#installing-plugins).                                                                         |
| `debug_logs`           | no       | `false`                  | Enable DEBUG-level Claude trace logging and always upload the execution artifact.                                                                                             |
| `pr_number`            | no       | event context            | Override auto-detected PR number.                                                                                                                                             |
| `pr_head_sha`          | no       | event context            | Override auto-detected PR head SHA.                                                                                                                                           |
| `comment_id`           | no       | event context            | Comment ID (react mode, explicit-input setups).                                                                                                                               |
| `comment_body`         | no       | event context            | Comment body (react mode, explicit-input setups).                                                                                                                             |
| `comment_path`         | no       | event context            | File path for review-thread comments.                                                                                                                                         |
| `comment_line`         | no       | event context            | Line number for review-thread comments.                                                                                                                                       |

## Custom Anthropic host

To route requests through a gateway, proxy, or compatible endpoint, set `anthropic_base_url` to a full URL including scheme. When unset, the default `api.anthropic.com` host is used. Gateways that authenticate with a bearer token instead of `x-api-key` can supply `anthropic_auth_token` in place of `anthropic_api_key` — set one, not both (the action fails fast if both are provided).

```yaml
with:
  anthropic_base_url: https://gateway.example.com
  anthropic_auth_token: ${{ secrets.ANTHROPIC_GATEWAY_TOKEN }}
```

## Skills consumed

The action invokes Claude Code with the local `claude-plugins/autopilot` plugin and runs:

- `/autopilot:pr-review` — review the PR diff across all dimensions in a single pass and emit a structured verdict
- `/autopilot:pr-answer` — reply to a PR comment thread and optionally resolve / update the existing review

The `pr:review` skill carries the full review rubric (all `CHECK-*` rules) inline and reviews every dimension itself in one model pass — no review sub-agents and no orchestrator fan-out.

To run a different repo's skills instead — e.g. a consumer's own `pr:review` — point `review_prompt` / `react_prompt` at them and install the plugin that provides them (see below).

## Installing plugins

`marketplaces` and `plugins` install Claude Code plugins before the run, so `review_prompt` / `react_prompt` can target a skill the bundled `autopilot` plugin doesn't provide. Each `marketplaces` line is `name=source` and each `plugins` line is `plugin@marketplace`; the action registers the marketplaces (`extraKnownMarketplaces`) and installs the plugins (`enabledPlugins`), then Claude Code's headless install resolves their slash commands.

```yaml
with:
  review_prompt: "/platform:pr-review"
  react_prompt: "/platform:pr-react"
  marketplaces: |
    platform-engineering=.
  plugins: |
    platform@platform-engineering
```

`source` follows `claude plugin marketplace add`: `.` is the checked-out repo (resolved to its absolute `$GITHUB_WORKSPACE`), `owner/repo[@ref]` is a GitHub repo, `https://…` a marketplace URL, `npm:<pkg>` an npm package, and a `./` / `/` path is a local directory (or a `.json` file). A consumer's own `extraKnownMarketplaces` / `enabledPlugins` in `.claude/settings.json` still win on key collisions.

## Review run-summary footer

Every review comment carries a collapsed **"Review run summary 🤖"** footer ("under the cut") with the run's latency, token usage, cache hits, cost, and tool round-trips. The metrics are computed in `runClaude.ts`, passed to `submitReview.ts` via the `run_summary` step output, and appended to the **main review comment only** (never inline, never on `react`-mode replies). The footer is wrapped in HTML-comment markers so it is stripped before duplicate-review detection, keeping run-varying numbers from defeating dedup.

See [Review run-summary footer](../../../docs/03-code-review-run-summary.md) for the full data flow and diagram.

## Inline suggestions & AI-agent prompts

Each inline finding can carry a one-click GitHub **`suggestion`** block (the author commits the fix in one click) and a collapsible **"Prompt for AI agents"** block (a ready-to-paste prompt with the finding and the surrounding diff hunk). The `pr:review` skill emits an optional `suggestion` (verbatim replacement) and `startLine` (multi-line range) per comment; `submitReview.ts` renders the suggestion fence and the deterministic agent prompt and posts them through the existing `createReview` call — adding `start_line`/`side` for multi-line ranges. The feature is always-on; no inputs configure it.

See [Inline suggestions and AI-agent prompts](../../../docs/04-code-review-suggestions.md) for the full data flow, a rendered example, and the source map.

## Skipping bot-authored PRs

PRs authored by the configured `bot_username` (or `reviewer` if `bot_username` is unset) skip AI review: the reviewer identity is the bot itself, and GitHub forbids a PR's author from being its own reviewer or approver, so there is no verdict the review could land.

## Release PR auto-approval

The action always **skips AI review** for `release-*` / `delivery-*` branch PRs. When `release_pr_authors` is set and the PR author is in that trusted list, it additionally posts an **auto-approval** so the PR is not blocked on the requested-reviewer slot — this is what unblocks [`release-automerge`](../release-automerge/README.md).

> [!IMPORTANT]
> **The author must differ from the reviewer.** The approval is posted with `bot_token` as the `reviewer` identity, and GitHub forbids approving your own PR. If the release PR is authored by that same identity, the `APPROVE` call fails with `422 Can not approve your own pull request`. Author release PRs with a separate identity (e.g. `release-create.yml` uses a `GH_TOKEN` distinct from the reviewer's `BOT_TOKEN`) and list that author in `release_pr_authors`. A failed approval is surfaced as a workflow `::error::`, never silently skipped.

The branch-name match alone is **not** a security boundary — anyone with push access could open a `release-pwn-1.0.0` branch — which is why auto-approval is gated on the explicit `release_pr_authors` trust list.

## Versioning

Reference the action by floating major tag:

```yaml
uses: awinogradov/code-assistants/.github/actions/code-review-action@v1
```
