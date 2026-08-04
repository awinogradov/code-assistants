# Licenses sync

Composite GitHub Action that syncs the canonical `.github/workflows/licenses.yml` from an
upstream repository into the current repository and opens a pull request with the difference.
Keeping licenses as a standalone sync kind lets consumers opt out without disabling the other
contributing files and workflows.

The action delegates the diff and PR mechanics to
[`files-sync`](../files-sync/README.md). It does not require `actions/checkout` and never touches
the runner's working tree.

## Usage

```yaml
name: Sync licenses workflow

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
      - uses: awinogradov/code-assistants/.github/actions/licenses-sync@v1
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
```

## Inputs

| Input          | Required | Default                       | Description                                                                                                                                                    |
| -------------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot_token`    | yes      | —                             | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on this repo. The workflow's default `GITHUB_TOKEN` is **not** supported. |
| `bot_username` | no       | `github-actions[bot]`         | Git author/committer login for the sync commit. Pass `${{ vars.BOT_USERNAME }}`. The PR itself is opened by the `bot_token` owner.                             |
| `source-repo`  | no       | `awinogradov/code-assistants` | Source repository in `owner/name` form that hosts the canonical `.github/workflows/licenses.yml`.                                                              |
| `source-ref`   | no       | _(empty)_                     | Branch, tag, or SHA to read the source file from. Empty means the source repository's default branch.                                                          |

## Outputs

| Output          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of destination paths that were updated.       |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes detected.   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes detected. |

## Behavior

- Syncs only `.github/workflows/licenses.yml` from `source-repo` at `source-ref`.
- Opens or force-updates `maintenance-sync-licenses` with the title
  `MAINTENANCE: Sync licenses workflow from upstream`.
- If the destination already matches upstream, no PR is created.
- Missing source files fail the run with `Source not found at <repo>:<path>`.

## Versioning

Reference the action by tag of the autopilot repo, for example:

```yaml
uses: awinogradov/code-assistants/.github/actions/licenses-sync@v1
```
