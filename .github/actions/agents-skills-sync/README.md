# agents-skills-sync

[![GitHub Release](https://img.shields.io/badge/release-v1.0.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that syncs the autopilot skills — the portable single-source layout under [claude-plugins/autopilot/skills/](../../../claude-plugins/autopilot/README.md) ([RFC-0002](../../../rfc/0002-portable-skills-layout.md)) — from an upstream repository into the current repository's `.agents/skills/` directory, the vendor-neutral location Codex, Kimi, and other SKILL.md-compatible CLIs read.

It composes with [files-sync](../files-sync/README.md) exactly as [agents-rules-sync](../agents-rules-sync/README.md) does: a resolve step enumerates the source skills tree via the Git Trees API and emits one content entry per file — **verbatim, no content transform** — and files-sync detects changes and opens a single idempotent PR. When nothing changed, no PR is created and the existing sync branch is left untouched.

**Upgrading?** See [MIGRATING.md](./MIGRATING.md).

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

| Input          | Required | Default                       | Description                                                              |
| -------------- | -------- | ----------------------------- | ------------------------------------------------------------------------ |
| `bot_token`    | yes      | —                             | PAT or GitHub App installation token; see [Permissions](#permissions).   |
| `bot_username` | no       | `github-actions[bot]`         | Git author/committer login for the sync commit.                          |
| `source-repo`  | no       | `awinogradov/code-assistants` | Source repository hosting the `claude-plugins/autopilot/skills/` layout. |
| `source-ref`   | no       | source repo's default branch  | Branch, tag, or SHA to read the layout from.                             |

## Outputs

| Output          | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `changed-files` | Newline-separated list of updated destination paths. Empty when no changes. |
| `pr-number`     | Number of the opened or reused PR. Empty when no changes.                   |
| `pr-url`        | HTML URL of the opened or reused PR. Empty when no changes.                 |

## Permissions

The workflow's default `GITHUB_TOKEN` is not supported: it cannot create pull requests when the repository or organization disables "Allow GitHub Actions to create and approve pull requests", and the resulting 403 is opaque. Pass a PAT (classic with `repo`, or fine-grained with `contents: write` + `pull-requests: write` on the consuming repository) or a GitHub App installation token as `bot_token`.

## Limitations

- The sync writes and updates files; it does not delete a destination file whose source was removed upstream. Remove stale `.agents/skills/` entries manually.
- Skills land under their plain names (`.agents/skills/pr-review/`, `.agents/skills/run/`, …) so relative cross-skill links keep resolving; if another skill set in the consumer repo uses the same names, resolve the collision manually.
- The `plan` and `run-primed` skills rely on Claude Code plan mode and session artifacts; other CLIs can read them but not reproduce those mechanics.
