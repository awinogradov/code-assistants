# Perf report

Composite GitHub Action that builds a target, measures bundle sizes (raw / gzip / brotli) and Lighthouse headlines (Performance, Accessibility, LCP, TBT, CLS, TTI), compares them against a baseline from the default branch, and posts a single sticky PR comment with the deltas classified against per-metric noise bands.

Reporting-only by design: the job never fails on a regression. Regressions surface as commentary (and the `regression-count` output); a hard-fail gate is a deliberate follow-up.

## How it works

```text
build-command → bundle-file sizes ┐
lighthouse-command → report JSON  ├→ head snapshot ─┐
                                  ┘                 ├→ classified deltas → sticky comment
gh run download (≤ lookback main runs) → baseline ──┘                      + artifact upload
```

On every run the action builds the target and snapshots the head measurements. On same-repo `pull_request` runs it additionally walks back through up to `baseline-lookback` recent successful default-branch runs of the **calling workflow**, downloads the first `perf-snapshot-main` artifact that still exists, renders the comparison, and upserts the sticky comment (keyed by `comment-header`). On `push` to the default branch it only uploads the snapshot — that upload is what future PRs use as their baseline.

## Usage

```yaml
name: Perf

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

# PR runs are cancelled by newer pushes to the same branch. Main runs are
# never cancelled — every commit on main must produce its own baseline
# snapshot, otherwise downstream PRs lose comparison points.
concurrency:
  group: >-
    ${{
      github.event_name == 'pull_request'
        && format('perf-pr-{0}', github.event.pull_request.number)
        || format('perf-main-{0}', github.sha)
    }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read
  pull-requests: write
  actions: read

jobs:
  perf:
    name: Report
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4

      # Your toolchain + dependency install/caching stay here — the action
      # only runs the commands you pass it.
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - run: bun install --frozen-lockfile

      - uses: awinogradov/code-assistants/.github/actions/perf-report-action@v1
        with:
          build-command: bun run --filter @org/app build
          bundle-file: apps/app/dist/embed/index.html
          bundle-analyze-command: bun run --filter @org/app bundle-analyze
          bundle-stats-file: apps/app/bundle-stats/index.html
          lighthouse-command: bun run perf
```

## Inputs

| Input                    | Required | Default                               | Description                                                                   |
| ------------------------ | -------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `build-command`          | yes      | —                                     | Shell command that builds the measured artifact                               |
| `bundle-file`            | yes      | —                                     | Built file whose raw/gzip/brotli sizes are reported; labels the bundle table  |
| `bundle-analyze-command` | no       | `""`                                  | Optional stats/treemap generation, runs after the build                       |
| `bundle-stats-file`      | no       | `""`                                  | Stats HTML copied into the snapshot artifact as `bundle-stats.html`           |
| `lighthouse-command`     | no       | `""`                                  | Command producing the Lighthouse JSON report; empty skips Lighthouse entirely |
| `lighthouse-report`      | no       | `perf-reports/lighthouse-viewer.json` | Where the Lighthouse report lands                                             |
| `noise-bands`            | no       | `""`                                  | JSON override of per-metric noise bands (see Behavior)                        |
| `baseline-lookback`      | no       | `5`                                   | Recent successful default-branch runs probed for a baseline artifact          |
| `comment-header`         | no       | `Perf`                                | Sticky-comment header key — vary it to post multiple independent comments     |
| `github-token`           | no       | the workflow's `github.token`         | Token for baseline discovery and the sticky comment                           |

## Outputs

| Output             | Description                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regression-count` | Metrics that crossed their noise band in the unfavorable direction. `0` when there is no baseline or the report degraded. Hook for a future hard-fail gate. |

## Permissions

The calling job owns the permissions (a composite action cannot set them):

- `pull-requests: write` — sticky comment
- `actions: read` — `gh run list` / `gh run download` for baseline discovery
- `contents: read` — checkout

## Behavior

- **Noise bands.** A delta counts as a regression only when it clears the band's `absolute` AND (where defined) `relative` thresholds in the unfavorable direction; inside the band the Δ column renders `≈ 0` so reviewers don't chase sub-noise variance. Defaults: bundle ≥ 1 KiB and ≥ 5%, Lighthouse scores ≥ 3 points, timings ≥ 200 ms and ≥ 10%, CLS ≥ 0.01. Override per metric kind via `noise-bands`, e.g. `{"timing": {"absolute": 500, "relative": 0.2}}` — a malformed override degrades the comment to "Report generation failed" naming the mistake, never fails the job.
- **Verdict line.** ✅ `within budget` (everything inside bands or improved) · ⚠️ `warning — N metric(s) regressed` with a `**Regressions**` list · 🆕 `no baseline available` (first runs after adoption) · 💔 `Lighthouse measurement failed` (the bundle table still renders).
- **Baseline mechanics.** The baseline is the `perf-snapshot-main` artifact of a recent successful default-branch run of the calling workflow (matched by workflow file name, so renaming the workflow's display name is safe). Artifacts expire (30-day retention) — when all probed runs lack one, the comment renders head-only with a 🆕 verdict and this PR's merge establishes a fresh baseline. `gh run list --status success` filters on the whole run's conclusion: if your perf workflow has other jobs that fail on main, baselines starve — keep the perf job in its own workflow.
- **Fork PRs.** `pull-requests: write` is not granted to fork `pull_request` runs, so baseline discovery, comment generation, and the sticky comment are skipped on PRs from forks. The build and snapshot still run.
- **Event matrix.** Same-repo `pull_request`: full flow, artifact `perf-snapshot-pr-<n>`. Default-branch `push`: build + snapshot + artifact `perf-snapshot-main` (no comment). Other events: build + snapshot only, no upload.
- **Lighthouse degrade.** A failing `lighthouse-command` or unreadable/partial report degrades the Lighthouse section (the run stays green); an empty `lighthouse-command` omits the section entirely for bundle-only consumers.

## Versioning

Reference the action by a tag of this repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/perf-report-action@v1
```

Pin to a tag for explicit control, or use `@main` to always pick up the latest behavior.
