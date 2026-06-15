# Upstream sync

Composite GitHub Action that aggregates the five upstream maintenance syncs behind a single
action. Every consumer runs one job instead of one job per kind. Each kind is opt-out: it runs
by default and is disabled by setting its input to `false`. The kinds are:

- `agents-rules` → [`agents-rules-sync`](../agents-rules-sync/README.md) — sync the stack-appropriate `rules/<stack>.md` into `CLAUDE.md`.
- `code-review` → [`code-review-sync`](../code-review-sync/README.md) — sync the AI code-review workflow.
- `repomix` → [`repomix-sync`](../repomix-sync/README.md) — sync the `repomix-pack` workflow and `repomix.config.json`.
- `release` → [`release-sync`](../release-sync/README.md) — sync the release pipeline workflows (create, publish, auto-merge).
- `contributing` → [`contributing-sync`](../contributing-sync/README.md) — sync `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE.md`, `SECURITY.md`, and the contributing + auto-label workflows.

Each kind is a gated step that delegates to its child `*-sync` action, which in turn delegates the
diff and PR mechanics to [`files-sync`](../files-sync/README.md). New sync kinds added upstream
propagate to every consumer automatically through this action's input defaults — no consumer
workflow edit is required. The action does not require `actions/checkout` and never touches the
runner's working tree.

## Usage

```yaml
name: Upstream

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:

concurrency:
  group: upstream-${{ github.workflow }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: awinogradov/code-assistants/.github/actions/upstream-sync@main
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
          # Every kind runs by default. Opt out by setting a kind to false, e.g.:
          # release: false
```

## Inputs

| Input          | Required | Default               | Description                                                                                                                                                                                      |
| -------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bot_token`    | yes      | —                     | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on this repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `bot_username` | no       | `github-actions[bot]` | Git author/committer login for the sync commits. Pass `${{ vars.BOT_USERNAME }}`. The PRs are opened by the `bot_token` owner.                                                                   |
| `agents-rules` | no       | `true`                | When `true`, sync the stack-appropriate rules file into `CLAUDE.md`. Set to `false` to opt out.                                                                                                  |
| `code-review`  | no       | `true`                | When `true`, sync the AI code-review workflow. Set to `false` to opt out.                                                                                                                        |
| `repomix`      | no       | `true`                | When `true`, sync the repomix-pack workflow and `repomix.config.json`. Set to `false` to opt out.                                                                                                |
| `release`      | no       | `true`                | When `true`, sync the release pipeline workflows. Set to `false` to opt out.                                                                                                                     |
| `contributing` | no       | `true`                | When `true`, sync the contributing artefacts and workflows. Set to `false` to opt out.                                                                                                           |

The kind inputs are booleans expressed as strings — use `true` / `false`, not YAML's `yes` / `on`
(which serialize to `"yes"` / `"on"` and would silently disable the kind, since the gate is
`== 'true'`).

## Outputs

This action exposes no outputs. Each child `*-sync` action still surfaces its own
`changed-files` / `pr-number` / `pr-url` when invoked directly.

## Permissions

The `bot_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever this repo or its org disables the **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** toggle.

Pass one of the following:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to this repository with `Contents: Read and write` and `Pull requests: Read and write`. For private source repositories, the same token also needs `Contents: Read` on the source repo.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token in a secret (e.g., `BOT_TOKEN`) and pass it via `bot_token: ${{ secrets.BOT_TOKEN }}`. Optionally set a `BOT_USERNAME` repository variable to control the commit author identity.

The `repomix` kind additionally requires the `bot_token` identity to be a **bypass actor** on the default-branch ruleset — the synced `repomix-pack.yml` pushes the regenerated pack directly to the default branch. See [`repomix-sync`](../repomix-sync/README.md) for details.

## Behavior

- Runs the five child syncs as steps in a single job, each gated by its `<kind>` input (`if: inputs['<kind>'] == 'true'`). A disabled kind is skipped.
- Each enabled kind delegates to its `*-sync` action, which opens or force-updates exactly one PR on its fixed `maintenance-sync-<kind>` branch. Branch names, titles, and commit messages are owned by the child actions and are not configurable here.
- Steps run serially (one job, one runner). Each child is API-only, so the run completes well within the workflow's timeout.
- Failure isolation: every kind runs with `continue-on-error: true`, and a final aggregation step fails the job if any **enabled** kind failed. A skipped (disabled) kind never fails the job. The `::error::sync failed for: <kinds>` annotation names every kind that failed.
- The child actions reference upstream actions via `@main`; those action directories are not vendored into consumers.

## Versioning

Reference the action by tag of the autopilot repo once a release is cut, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/upstream-sync@v1
```

The canonical `upstream.yml` template references it via `@main` so consumers always run the latest aggregator.
