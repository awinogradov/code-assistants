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
      - uses: awinogradov/autopilot/.github/actions/files-sync@v1
        with:
          files: |
            - repo: awinogradov/autopilot
              source: CONTRIBUTING.md
              dest: CONTRIBUTING.md
            - repo: awinogradov/autopilot
              source: rules/Bun.md
              dest: CLAUDE.md
```

## Inputs

| Input            | Required | Default                                           | Description                                                                               |
| ---------------- | -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `files`          | yes      | —                                                 | YAML list of entries. Each item: `repo` (`owner/name`), `source`, `dest`, optional `ref`. |
| `token`          | no       | `${{ github.token }}`                             | Token used for source reads and PR creation. Override for private cross-repo sources.     |
| `base`           | no       | `${{ github.event.repository.default_branch }}`   | Base branch the PR targets.                                                               |
| `branch`         | no       | `chore/sync-files`                                | Head branch the PR uses. Force-updated on subsequent runs.                                |
| `title`          | no       | `MAINTENANCE: Sync files from upstream`           | PR title. Uses the `MAINTENANCE:` prefix per CONTRIBUTING.md.                             |
| `body`           | no       | `Automated file sync from upstream repositories.` | PR body intro. The action auto-appends a `**Updated files:**` bullet list.                |
| `commit-message` | no       | `chore: sync files from upstream`                 | Conventional commit message for the sync commit.                                          |

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

The token (default `${{ github.token }}`) needs:

- `contents: write` — to create the branch, blobs, tree, and commit on the destination repo.
- `pull-requests: write` — to open or reuse the PR.

For private source repositories or cross-org reads, provide a token with `contents: read` scope on the source repos.

## Behavior

- A single PR with all changed files is created (or reused if `branch` already has an open PR).
- The head `branch` is force-updated on every run.
- If no files differ between source and destination, no PR is created and the action exits cleanly.
- A missing source path fails the run with `Source not found at <repo>:<path>`.
- The destination path may not exist yet — it will be created in the PR.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/autopilot/.github/actions/files-sync@v1
```
