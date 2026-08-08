# agents-skills-sync

Composite GitHub Action that syncs the portable [autopilot Agent Skills layout](../../../agent-skills/README.md) from an upstream repository into the current repository's `.agents/skills/` directory — the vendor-neutral location Codex, Kimi, and other SKILL.md-compatible CLIs read.

It composes with [files-sync](../files-sync/README.md) exactly as [agents-rules-sync](../agents-rules-sync/README.md) does: a resolve step enumerates the source repository's `agent-skills/` tree via the Git Trees API and emits one content entry per file; files-sync detects changes and opens a single idempotent PR. When nothing changed, no PR is created and the existing sync branch is left untouched.

## Usage

```yaml
name: Sync agent skills
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: awinogradov/code-assistants/.github/actions/agents-skills-sync@main
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
```

## Inputs

| Input          | Required | Default                       | Description                                                            |
| -------------- | -------- | ----------------------------- | ---------------------------------------------------------------------- |
| `bot_token`    | yes      | —                             | PAT or GitHub App installation token; see [Permissions](#permissions). |
| `bot_username` | no       | `github-actions[bot]`         | Git author/committer login for the sync commit.                        |
| `source-repo`  | no       | `awinogradov/code-assistants` | Source repository hosting the `agent-skills/` layout.                  |
| `source-ref`   | no       | source repo's default branch  | Branch, tag, or SHA to read the layout from.                           |

## Outputs

| Output          | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of updated destination paths. Empty when no changes. |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes.                   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes.                 |

## Permissions

The workflow's default `GITHUB_TOKEN` is not supported: it cannot create pull requests when the repository or organization disables "Allow GitHub Actions to create and approve pull requests", and the resulting 403 is opaque. Pass a PAT (classic with `repo`, or fine-grained with `contents: write` + `pull-requests: write` on the consuming repository) or a GitHub App installation token as `bot_token`.

## Limitations

- The sync writes and updates files; it does not delete a destination file whose source was removed upstream. Remove stale `.agents/skills/` entries manually (or wait for the next layout rename to overwrite them).
- The layout currently spans ~130 files, so a first sync opens a correspondingly large PR; subsequent runs only touch changed files.
