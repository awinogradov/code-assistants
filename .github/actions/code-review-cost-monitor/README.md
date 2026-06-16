# Code review cost monitor

[![GitHub Release](https://img.shields.io/badge/release-v0.1.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that watches the per-run cost of [`code-review-action`](../code-review-action/README.md) and opens (or updates) a single deduplicated cost-report issue when it regresses. The data source is the "Review run summary" footer the review action appends to every review comment — a durable, per-run record of cost, tokens, and round-trips — so the monitor needs no extra instrumentation and no time-series store.

The monitor is deterministic by default: collection, threshold evaluation, and the report tables are plain TypeScript with no model call, so the scheduled run is ~free. An optional attribution step (off by default) runs one model pass on a breach to name the change that moved the cost — the analysis that made issue 287 actionable.

## How it decides

Per-PR review cost legitimately swings an order of magnitude with output size, so a naive "10% more than last run" rule fires on noise. The triggers are layered instead:

| Trigger                    | What it catches                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Rolling baseline (default) | Sustained increase: median cost of the recent `baseline_window` runs vs the window before it, breach at `increase_pct` |
| Normalized regression      | Process change independent of PR size: median **cost per output token**, recent window vs prior window                 |
| Single-run ceiling         | One catastrophic run (`single_run_ceiling_usd`), regardless of percentages                                             |
| Previous-run mode (opt-in) | The naive last-vs-previous comparison, for repos that want it — noisy by nature                                        |

Windowed triggers require both windows to hold at least `min_runs` review runs (a median over two stale runs is noise), and nothing fires until `min_runs` runs exist at all. Only `review`-mode footers feed the baselines — preflight skip-comment footers are near-zero-cost and would skew the medians.

Defaults (`$1.50` ceiling, 25% thresholds, 14-run windows) trace to the cost analysis in issue 287, where a process regression doubled output tokens while per-PR costs ranged $0.17–$1.54.

**Caveats.** A rolling baseline absorbs a sustained drift after one window — the ceiling and the normalized trigger are the anchors against that. If the scheduled run fails loudly, that is by design: an API error, or a scan where at least `min_runs` reviews carry a run-summary data comment yet none parse (genuine footer-format drift upstream), must not read as "no regression". A window with too few footers to judge degrades to "insufficient data" instead, so a newly-adopting or quiet repo never reddens its first scheduled run. GitHub also auto-disables cron workflows after 60 days of repository inactivity.

## Usage

The canonical workflow is [`code-review-cost-monitor.yml`](../../workflows/code-review-cost-monitor.yml), distributed to downstream repositories by [`code-review-sync`](../code-review-sync/README.md):

```yaml
name: Code review cost monitor

on:
  schedule:
    - cron: "17 7 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  monitor:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0 # attribution diffs need history
      - uses: awinogradov/code-assistants/.github/actions/code-review-cost-monitor@main
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_CODE_REVIEW }}
```

## Inputs

| Input                       | Required | Default             | Description                                                                                                                                                   |
| --------------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot_token`                 | yes      | —                   | PAT or App token with `contents: read` + `issues: write`. The report issue is attributed to this token's identity.                                            |
| `anthropic_api_key`         | no       | _(empty)_           | Anthropic API key for the attribution step. Unused unless `attribution` is `true` and a breach fired.                                                         |
| `anthropic_base_url`        | no       | _(empty)_           | Custom Anthropic API base URL for the attribution step (gateway/proxy/compatible endpoint, full URL with scheme). Unset uses the default `api.anthropic.com`. |
| `anthropic_auth_token`      | no       | _(empty)_           | Bearer token for a custom Anthropic host (`Authorization: Bearer`). Alternative to `anthropic_api_key` — set one, not both.                                   |
| `model`                     | no       | `claude-sonnet-4-6` | Claude model for the attribution narrative.                                                                                                                   |
| `comparison_mode`           | no       | `rolling-baseline`  | `rolling-baseline` or `previous-run` (see [How it decides](#how-it-decides)).                                                                                 |
| `baseline_window`           | no       | `14`                | Review runs per comparison window.                                                                                                                            |
| `increase_pct`              | no       | `25`                | Percent increase of the compared cost metric that fires.                                                                                                      |
| `single_run_ceiling_usd`    | no       | `1.50`              | Absolute per-run ceiling (USD).                                                                                                                               |
| `normalized_regression_pct` | no       | `25`                | Percent increase of median cost per output token that fires.                                                                                                  |
| `min_runs`                  | no       | `8`                 | Minimum review runs (overall and per window) before windowed thresholds are evaluated.                                                                        |
| `lookback_days`             | no       | `30`                | Days of PR reviews to scrape. Months are expressed as days (e.g. `90`).                                                                                       |
| `attribution`               | no       | `false`             | Run one model pass on a breach to attribute the regression. Requires `anthropic_api_key` or `anthropic_auth_token`.                                           |
| `issue_label`               | no       | `code-review-cost`  | Label identifying the cost-report issue for dedup.                                                                                                            |
| `cooldown_days`             | no       | `7`                 | Minimum days between posted reports — a sustained breach comments at most once per cooldown.                                                                  |

## Outputs

| Output      | Description                                                                                |
| ----------- | ------------------------------------------------------------------------------------------ |
| `breach`    | `true` when at least one threshold fired.                                                  |
| `issue_url` | URL of the created/updated cost-report issue. Empty when no breach or cooldown-suppressed. |

## Behavior

- **Collection** walks PRs by `updated` descending and stops paginating past the lookback window, then reads the machine-readable `<!-- run-summary-data: … -->` comment from each review body (independent of the visible table's format). One `pulls.get` per matched PR attaches the diff size. Transient API failures are retried (`@octokit/plugin-retry`); a persistent failure fails the run.
- **The report** mirrors the issue 287 analysis: coverage line, breached thresholds, daily trend table, top-5 notable runs with `$ / 1k output`, and the cost↔output-tokens correlation.
- **Issue dedup** keys on the `code-review-cost` label plus an HTML marker, searched across open and closed issues: a breach comments on the open report issue, opens a new one when none exists, and a recently closed issue still honors `cooldown_days` — closing the issue without fixing the cost does not respawn it daily.
- **Attribution** (gated on breach + `attribution: true` + a key) reuses the review action's `runClaude.ts` engine with a JSON schema, so cost comes from the SDK and no second Anthropic SDK or price map exists. The step is `continue-on-error`; when it fails, the report says "Attribution unavailable" instead of omitting the section.
- **Run-page link** — the report step emits a `::notice` annotation and a step-summary link to the created or updated report issue (a cooldown-suppressed run links the existing issue), so the run page leads straight to the report.

## Local dry run

The monitor entry never posts (issue writing is a separate step), so a local run is read-only:

```bash
GH_TOKEN=$(gh auth token) GITHUB_REPOSITORY=owner/repo \
  bun .github/actions/code-review-cost-monitor/src/costMonitor.ts
```
