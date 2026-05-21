# Agents rules sync

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

| Input         | Required | Default                       | Description                                                                                       |
| ------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `token`       | no       | `${{ github.token }}`         | Token used to read `package.json`, fetch the source rules file, and create the PR.                |
| `source-repo` | no       | `awinogradov/code-assistants` | Source repository in `owner/name` form that hosts the `rules/<stack>.md` files.                   |
| `source-ref`  | no       | _(empty)_                     | Branch, tag, or SHA to read the source rules file from. Empty → source repository default branch. |

PR-shaping inputs (branch, title, body, commit message) are fixed by design — see
[Behavior](#behavior).

## Outputs

| Output          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of destination paths that were updated.       |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes detected.   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes detected. |

## Permissions

The token (default `${{ github.token }}`) needs:

- `contents: write` — to create the branch, blobs, tree, and commit on the consumer repo.
- `pull-requests: write` — to open or reuse the PR.

For private source repositories or cross-org reads, provide a token with `contents: read`
scope on the source repository.

## Behavior

- Resolves the consumer's `agents.rules` value from its root `package.json` on the default
  branch.
- Delegates to `files-sync` with a single entry: `repo: <source-repo>`,
  `source: rules/<value>.md`, `dest: CLAUDE.md`.
- The PR is opened on the fixed branch `chore/sync-agents-rules` with the title
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

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v1
```
