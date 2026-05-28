# Repomix sync

Composite GitHub Action that syncs the repomix pack workflow and its config from an upstream
repository into the current repository and opens a single pull request with the difference.
The synced set is:

- `.github/workflows/repomix-pack.yml`
- `repomix.config.json`

The workflow propagates the CI that commits a packed codebase snapshot to `.repomix/pack.xml`
on every merge to the default branch; the config pins that pack's output for a deterministic,
reviewable diff. See the [Committed Repomix pack](../../../docs/repomix-pack.md) doc for how the
snapshot is produced and consumed. Each consumer repo packs its own codebase — there is no
shared artifact.

The action builds the sync list and delegates the diff and PR mechanics to the
[`files-sync`](../files-sync/README.md) action. It does not require `actions/checkout` and
never touches the runner's working tree.

## Usage

```yaml
name: Sync repomix pack

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
      - uses: awinogradov/code-assistants/.github/actions/repomix-sync@v1
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
```

## Inputs

| Input          | Required | Default                       | Description                                                                                                                                                                                      |
| -------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bot_token`    | yes      | —                             | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on this repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `bot_username` | no       | `github-actions[bot]`         | Git author/committer login for the sync commit. Pass `${{ vars.BOT_USERNAME }}`. The PR itself is opened by the `bot_token` owner.                                                               |
| `source-repo`  | no       | `awinogradov/code-assistants` | Source repository in `owner/name` form that hosts the canonical `.github/workflows/repomix-pack.yml` and `repomix.config.json`.                                                                  |
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

The `bot_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever this repo or its org disables the **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** toggle.

Pass one of the following:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to this repository with `Contents: Read and write` and `Pull requests: Read and write`. For private source repositories, the same token also needs `Contents: Read` on the source repo.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token in a secret (e.g., `BOT_TOKEN`) and pass it via `bot_token: ${{ secrets.BOT_TOKEN }}`. Optionally set a `BOT_USERNAME` repository variable to control the commit author identity.

See GitHub's docs for [creating a fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) and [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## Behavior

- Delegates to `files-sync` with a fixed sync list — `.github/workflows/repomix-pack.yml` and
  `repomix.config.json` — sourced from `source-repo` at `source-ref`.
- The PR is opened on the fixed branch `maintenance-sync-repomix` with the title
  `MAINTENANCE: Sync repomix pack from upstream` and the commit message
  `chore: sync repomix pack from upstream`. These values are not configurable so the action
  cannot collide with `files-sync`'s default branch and so every consumer gets the same
  one-line setup.
- The head branch is force-updated on every run (inherited from `files-sync`); local edits to
  the synced files will be overwritten when the upstream files change.
- If the destination files already match upstream, no PR is created.
- A missing source file fails the run with `Source not found at <repo>:<path>`.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/repomix-sync@v1
```
