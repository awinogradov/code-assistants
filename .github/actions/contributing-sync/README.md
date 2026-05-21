# Contributing sync

Composite GitHub Action that syncs the canonical contributing artefacts from an upstream
repository into the current repository and opens a single pull request with the differences.
The synced set is:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `LICENSE.md`
- `.github/workflows/contributing.yml`
- `.github/actions/contributing-check/action.yml`

The first three are the contributor-facing documentation. The last two propagate the
[`contributing-check`](../contributing-check/README.md) enforcement action and the workflow
that runs it on every PR, so consumer repos get the full enforcement set without writing any
extra glue.

The action builds a fixed five-entry sync list and delegates the diff and PR mechanics to the
[`files-sync`](../files-sync/README.md) action. It does not require `actions/checkout` and
never touches the runner's working tree.

## Usage

```yaml
name: Sync contributing files

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
      - uses: awinogradov/code-assistants/.github/actions/contributing-sync@v1
        with:
          token: ${{ secrets.SYNC_PAT }}
```

## Inputs

| Input         | Required | Default                       | Description                                                                                                                                                                                      |
| ------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token`       | yes      | —                             | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on this repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `source-repo` | no       | `awinogradov/code-assistants` | Source repository in `owner/name` form that hosts the canonical `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `LICENSE.md`.                                                                       |
| `source-ref`  | no       | _(empty)_                     | Branch, tag, or SHA to read the source files from. Empty → source repository default branch.                                                                                                     |

PR-shaping inputs (branch, title, body, commit message) are fixed by design — see
[Behavior](#behavior).

## Outputs

| Output          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of destination paths that were updated.       |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes detected.   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes detected. |

## Permissions

The `token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever this repo or its org disables the **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** toggle.

Pass one of the following:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to this repository with `Contents: Read and write` and `Pull requests: Read and write`. For private source repositories, the same token also needs `Contents: Read` on the source repo.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token in a secret (e.g., `SYNC_PAT`) and pass it via `token: ${{ secrets.SYNC_PAT }}`.

See GitHub's docs for [creating a fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) and [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## Behavior

- Delegates to `files-sync` with five fixed entries — `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `LICENSE.md`, `.github/workflows/contributing.yml`, and
  `.github/actions/contributing-check/action.yml` — sourced from `source-repo` at `source-ref`.
- The PR is opened on the fixed branch `maintenance-sync-contributing` with the title
  `MAINTENANCE: Sync contributing files from upstream` and the commit message
  `chore: sync contributing files from upstream`. These values are not configurable so the
  action cannot collide with `files-sync`'s default branch and so every consumer gets the
  same one-line setup.
- The head branch is force-updated on every run (inherited from `files-sync`); local edits
  to any of the five synced files will be overwritten when the upstream files change.
- If all five destination files already match upstream, no PR is created.
- Missing source files fail the run with `Source not found at <repo>:<path>`.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/contributing-sync@v1
```
