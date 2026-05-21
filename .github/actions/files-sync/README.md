# Files sync

Composite GitHub Action that syncs declared files from one or more source repositories into
the current repository and opens a single pull request with the differences.

The action works purely against the GitHub REST + Git Data APIs — it does not require
`actions/checkout` and never touches the local working tree of the runner.

## Usage

```yaml
name: Sync files

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
      - uses: awinogradov/code-assistants/.github/actions/files-sync@v1
        with:
          token: ${{ secrets.SYNC_PAT }}
          files: |
            - repo: awinogradov/code-assistants
              source: CONTRIBUTING.md
              dest: CONTRIBUTING.md
            - repo: awinogradov/code-assistants
              source: rules/Bun.md
              dest: CLAUDE.md
```

## Inputs

| Input            | Required | Default                                           | Description                                                                                                                                                                                                 |
| ---------------- | -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`          | yes      | —                                                 | YAML list of entries. Each item: `repo` (`owner/name`), `source`, `dest`, optional `ref`.                                                                                                                   |
| `token`          | yes      | —                                                 | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on the destination repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `base`           | no       | `${{ github.event.repository.default_branch }}`   | Base branch the PR targets.                                                                                                                                                                                 |
| `branch`         | no       | `maintenance-sync-files`                          | Head branch the PR uses. Force-updated on subsequent runs.                                                                                                                                                  |
| `title`          | no       | `MAINTENANCE: Sync files from upstream`           | PR title. Uses the `MAINTENANCE:` prefix per CONTRIBUTING.md.                                                                                                                                               |
| `body`           | no       | `Automated file sync from upstream repositories.` | PR body intro. The action auto-appends a `**Updated files:**` bullet list.                                                                                                                                  |
| `commit-message` | no       | `chore: sync files from upstream`                 | Conventional commit message for the sync commit.                                                                                                                                                            |

### Entry fields

- `repo` — source repository in `owner/name` form.
- `source` — path in the source repository (relative to the repo root).
- `dest` — destination path in the current repository.
- `ref` _(optional)_ — branch, tag, or SHA to read the source from. Defaults to the source repo's default branch.

## Outputs

| Output          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of destination paths that were updated.       |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes detected.   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes detected. |

## Permissions

The `token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever the destination repo or its org disables the **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** toggle.

Pass one of the following:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to the destination repository with `Contents: Read and write` and `Pull requests: Read and write`. For private source repositories, the same token also needs `Contents: Read` on each source repo.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token in a secret (e.g., `SYNC_PAT`) and pass it via `token: ${{ secrets.SYNC_PAT }}`.

See GitHub's docs for [creating a fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) and [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## Behavior

- A single PR with all changed files is created (or reused if `branch` already has an open PR).
- The head `branch` is force-updated on every run.
- If no files differ between source and destination, no PR is created and the action exits cleanly.
- A missing source path fails the run with `Source not found at <repo>:<path>`.
- The destination path may not exist yet — it will be created in the PR.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/files-sync@v1
```
