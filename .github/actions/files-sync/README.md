# Files sync

[![GitHub Release](https://img.shields.io/badge/release-v2.0.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

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
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
          files: |
            - repo: awinogradov/code-assistants
              source: CONTRIBUTING.md
              dest: CONTRIBUTING.md
            - repo: awinogradov/code-assistants
              source: rules/Bun.md
              dest: CLAUDE.md
```

Symlink entries write a Git symlink at `dest` instead of copying a file:

```yaml
files: |
  - symlink: CLAUDE.md
    dest: AGENTS.md
```

## Inputs

| Input            | Required | Default                                           | Description                                                                                                                                                                                                 |
| ---------------- | -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`          | yes      | —                                                 | YAML list of entries — either a [content entry](#content-entry) or a [symlink entry](#symlink-entry). At least one required.                                                                                |
| `bot_token`      | yes      | —                                                 | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on the destination repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `bot_username`   | no       | `github-actions[bot]`                             | Git author/committer login for the sync commit. Pass `${{ vars.BOT_USERNAME }}`. The PR itself is opened by the `bot_token` owner.                                                                          |
| `base`           | no       | `${{ github.event.repository.default_branch }}`   | Base branch the PR targets.                                                                                                                                                                                 |
| `branch`         | no       | `maintenance-sync-files`                          | Head branch the PR uses. Force-updated on subsequent runs.                                                                                                                                                  |
| `title`          | no       | `MAINTENANCE: Sync files from upstream`           | PR title. Uses the `MAINTENANCE:` prefix per CONTRIBUTING.md.                                                                                                                                               |
| `body`           | no       | `Automated file sync from upstream repositories.` | PR body intro. The action auto-appends a `**Updated files:**` bullet list.                                                                                                                                  |
| `commit-message` | no       | `chore: sync files from upstream`                 | Conventional commit message for the sync commit.                                                                                                                                                            |

### Entry fields

Each entry is one of two variants — content or symlink. Fields are strict and mutually exclusive.

#### Content entry

- `repo` — source repository in `owner/name` form.
- `source` — path in the source repository (relative to the repo root).
- `dest` — destination path in the current repository.
- `ref` _(optional)_ — branch, tag, or SHA to read the source from. Defaults to the source repo's default branch.

#### Symlink entry

- `symlink` — target path the symlink will point at, relative to `dest`.
- `dest` — destination path in the current repository.

A symlink entry writes a Git mode `120000` blob whose body is the literal `symlink` target string — not a content copy. The action does not require the target to exist; dangling symlinks are valid in Git.

## Outputs

| Output          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of destination paths that were updated.       |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes detected.   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes detected. |

## Permissions

The `bot_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever the destination repo or its org disables the **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** toggle.

Pass one of the following:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to the destination repository with `Contents: Read and write` and `Pull requests: Read and write`. For private source repositories, the same token also needs `Contents: Read` on each source repo.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token in a secret (e.g., `BOT_TOKEN`) and pass it via `bot_token: ${{ secrets.BOT_TOKEN }}`. Optionally set a `BOT_USERNAME` repository variable to control the commit author identity.

See GitHub's docs for [creating a fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) and [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## Behavior

- A single PR with all changed files is created (or reused if `branch` already has an open PR).
- The head `branch` is force-updated on every run.
- If no files differ between source and destination, no PR is created and the action exits cleanly.
- A missing source path fails the run with `Source not found at <repo>:<path>`.
- The destination path may not exist yet — it will be created in the PR.
- Symlink entries are detected against the destination via the Git Trees and Blobs APIs (not the Contents API, which would follow symlinks server-side and mask the link metadata). An existing matching symlink at `dest` is a no-op; a missing or differently-shaped `dest` is rewritten as a symlink in the PR.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/files-sync@v1
```
