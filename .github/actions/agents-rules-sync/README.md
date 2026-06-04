# Agents rules sync

[![GitHub Release](https://img.shields.io/badge/release-v2.0.1-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that syncs the stack-appropriate agent rules file from an upstream
repository into the current repository's `CLAUDE.md` and opens a single pull request with
the difference.

The action reads the consumer's `agents.rules` field (see
[docs/agents-field.md](../../../docs/agents-field.md)), builds the corresponding source path
(`rules/<value>.md`), and delegates the diff and PR mechanics to the
[`files-sync`](../files-sync/README.md) action. It does not require `actions/checkout` and
never touches the runner's working tree.

## Usage

```yaml
name: Sync agent rules

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
      - uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v1
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
          # agents-md: true  # also publish AGENTS.md → CLAUDE.md symlink
```

The consumer repository must declare an `agents.rules` field in its root `package.json`:

```json
{
  "name": "my-app",
  "agents": {
    "rules": "Bun"
  }
}
```

Accepted values: `Bun`, `Bun+React+Tailwind`, `NodeJS+React`, `NodeJS+React+Tailwind`.

## Inputs

| Input          | Required | Default                       | Description                                                                                                                                                                                      |
| -------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bot_token`    | yes      | —                             | PAT or GitHub App installation token with `contents: write` + `pull-requests: write` on this repo. The workflow's default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |
| `bot_username` | no       | `github-actions[bot]`         | Git author/committer login for the sync commit. Pass `${{ vars.BOT_USERNAME }}`. The PR itself is opened by the `bot_token` owner.                                                               |
| `source-repo`  | no       | `awinogradov/code-assistants` | Source repository in `owner/name` form that hosts the `rules/<stack>.md` files.                                                                                                                  |
| `source-ref`   | no       | _(empty)_                     | Branch, tag, or SHA to read the source rules file from. Empty → source repository default branch.                                                                                                |
| `agents-md`    | no       | `false`                       | When `true`, also publish `AGENTS.md` as a Git symlink to `CLAUDE.md`. See [Behavior](#behavior).                                                                                                |

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

- Resolves the consumer's `agents.rules` value from its root `package.json` on the default
  branch.
- Delegates to `files-sync` with a single entry: `repo: <source-repo>`,
  `source: rules/<value>.md`, `dest: CLAUDE.md`.
- When `agents-md: true`, also delegates a second [symlink entry](../files-sync/README.md#symlink-entry)
  to `files-sync`, publishing `AGENTS.md` in the consumer repo as a Git symlink (mode `120000`)
  pointing at `CLAUDE.md`. Both entries land in the same PR; default behavior is unchanged so
  existing v1 consumers need no action.
- The PR is opened on the fixed branch `maintenance-sync-agents-rules` with the title
  `MAINTENANCE: Sync agent rules from upstream` and the commit message
  `chore: sync agent rules from upstream`. These values are not configurable so the action
  cannot collide with `files-sync`'s default branch and so every consumer gets the same
  one-line setup.
- The head branch is force-updated on every run (inherited from `files-sync`); local edits
  to `CLAUDE.md` will be overwritten when the upstream rules file changes.
- If `CLAUDE.md` already matches `rules/<value>.md`, no PR is created.
- If `package.json` is missing, malformed, or lacks `agents.rules` (or its value is
  unrecognized), the action fails with a link to `docs/agents-field.md` and the list of
  accepted values.

## Flow

See [docs/sync-flow.md](./docs/sync-flow.md) for the end-to-end data flow diagram and a walkthrough of the symlink detection path.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v1
```
