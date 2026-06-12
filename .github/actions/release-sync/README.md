# Release workflows sync

Composite GitHub Action that syncs the release pipeline workflows from an upstream
repository into the current repository and opens a single pull request with the
difference. The synced set is:

- `.github/workflows/release-create.yml` — opens the release PR
- `.github/workflows/release-publish.yml` — publishes on merge of the release PR
- `.github/workflows/release-automerge.yml` — merges the approved, all-green release PR

Together these are the full release pipeline: `release-create.yml` creates the release
PR, `release-automerge.yml` merges it once it is approved and green, and
`release-publish.yml` runs on the merge. See the [Release auto-merge flow](../../../docs/07-release-automerge.md)
doc for how the merge gate works. The actions these workflows invoke
([`release-action`](../release-action/README.md),
[`release-automerge`](../release-automerge/README.md)) are **not** synced — downstream
repos reference them via `@main`, the same way `code-review.yml` references
`code-review-action`.

The action builds the sync list and delegates the diff and PR mechanics to the
[`files-sync`](../files-sync/README.md) action. It does not require
`actions/checkout` and never touches the runner's working tree.

## Usage

```yaml
name: Sync release workflows

on:
  schedule:
    - cron: "0 8 * * 1"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: awinogradov/code-assistants/.github/actions/release-sync@v1
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
```

## Inputs

| Input          | Required | Default                       | Description                                                                                                                                                                                      |
| -------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bot_token`    | yes      | —                             | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on this repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `bot_username` | no       | `github-actions[bot]`         | Git author/committer login for the sync commit. Pass `${{ vars.BOT_USERNAME }}`. The PR itself is opened by the `bot_token` owner.                                                               |
| `source-repo`  | no       | `awinogradov/code-assistants` | Source repository in `owner/name` form that hosts the canonical release workflows.                                                                                                               |
| `source-ref`   | no       | _(empty)_                     | Branch, tag, or SHA to read the source files from. Empty → source repository default branch.                                                                                                     |

PR-shaping inputs (branch, title, body, commit message) are fixed by design — see
[Behavior](#behavior).

## Outputs

| Output          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of destination paths that were updated.       |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes detected.   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes detected. |

## Permissions

The `bot_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not
supported, because creating pull requests with it can fail with an opaque 403
(`GitHub Actions is not permitted to create or approve pull requests`) whenever this
repo or its org disables the **Settings → Actions → General → Workflow permissions →
"Allow GitHub Actions to create and approve pull requests"** toggle.

Pass one of the following:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to this repository with
  `Contents: Read and write` and `Pull requests: Read and write`. For private source
  repositories, the same token also needs `Contents: Read` on the source repo.
- A **GitHub App installation token** with the same `contents: write` +
  `pull-requests: write` permissions.

Store the token in a secret (e.g., `BOT_TOKEN`) and pass it via
`bot_token: ${{ secrets.BOT_TOKEN }}`. Optionally set a `BOT_USERNAME` repository
variable to control the commit author identity.

## Behavior

- Delegates to `files-sync` with a fixed sync list — `.github/workflows/release-create.yml`,
  `.github/workflows/release-publish.yml`, and `.github/workflows/release-automerge.yml` —
  sourced from `source-repo` at `source-ref`.
- The PR is opened on the fixed branch `maintenance-sync-release` with the title
  `MAINTENANCE: Sync release workflows from upstream` and the commit message
  `chore: sync release workflows from upstream`. These values are not configurable so
  the action cannot collide with `files-sync`'s default branch and so every consumer
  gets the same one-line setup.
- The head branch is force-updated on every run (inherited from `files-sync`); local
  edits to the synced files will be overwritten when the upstream files change.
- If the destination files already match upstream, no PR is created.
- A missing source file fails the run with `Source not found at <repo>:<path>`.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/release-sync@v1
```
