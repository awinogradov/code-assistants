# Validate Actions

[![GitHub Release](https://img.shields.io/badge/release-v0.2.3-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that lints a pull request's **changed** GitHub Actions files:

- **Workflow files** (`.github/workflows/**`) with [`actionlint`](https://github.com/rhysd/actionlint), which also runs `shellcheck` over the bash embedded in workflow `run:` steps.
- **Composite action manifests** (`.github/actions/*/action.yml`) by extracting their inline `run:` blocks and running `shellcheck` over them — `actionlint` does not parse action manifests, so this is the only place that inline bash gets linted.

It is **fail-only**: it never edits or commits, it just fails the check when it finds a problem. Only the files changed in the pull request are linted, so pre-existing findings elsewhere never fail an unrelated PR.

## Requirements

- A Linux x64 runner (`ubuntu-latest`). `shellcheck` is preinstalled on GitHub-hosted Ubuntu runners; `actionlint` is downloaded (pinned and checksum-verified) at run time.
- A `pull_request` trigger, so the changed-file set can be diffed against the PR base.

## Usage

Add a thin workflow that delegates to this action via `@main`:

```yaml
name: Validate Actions

on:
  pull_request:
    branches: [main]
    paths:
      - ".github/workflows/**"
      - ".github/actions/**"

concurrency:
  group: validate-actions-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: awinogradov/code-assistants/.github/actions/validate-actions@main
```

## Inputs

| Input                | Required | Default  | Description                                                                                                        |
| -------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `actionlint-version` | No       | `1.7.11` | actionlint release to install (without the leading `v`). Verified against the release's published `checksums.txt`. |

## Outputs

None.

## Permissions

`contents: read` — the action only checks out the pull request and reads files; it never writes, so no `bot_token` is required.

## Behavior

1. **Checkout** the pull request with full history (needed to resolve the merge-base with the base branch).
2. **Install** the action's Bun dependencies and a pinned, checksum-verified `actionlint`.
3. **Detect changes** — diff the merge-base of the PR base and head, limited to `.github/workflows/**` and `.github/actions/**`.
4. **Lint** — run `actionlint` over changed workflow files (it shellchecks their embedded `run:` bash) and `shellcheck` over the inline `run:` blocks of changed `action.yml` files. `${{ }}` expressions are blanked before shellcheck, and the same shellcheck codes actionlint suppresses for `run:` scripts are excluded, so workflow and action bash are linted consistently.
5. **Report** — every finding is emitted as a GitHub annotation and **fails the check** (matching how `actionlint` already gates workflows). A malformed `action.yml` is reported as a YAML error.

## Limitations

- **Changed files only.** Pre-existing findings in untouched files are not reported until those files change; fixing the existing backlog is tracked separately.
- **`action.yml` is shell- and YAML-checked, not schema-validated.** Inline bash is shellchecked and the manifest must parse as YAML, but the action schema itself (`runs.using`, `inputs`/`outputs` correctness) is not validated.
- Linux x64 runners only.

## Versioning

Reference the action by tag, e.g. `…/validate-actions@v1`, for explicit control, or `@main` to always pick up the latest logic.

> [!NOTE]
> This action's workflow is distributed to downstream repositories via the [`contributing-sync`](../contributing-sync/README.md) action; the synced `validate-actions.yml` carries the standard "distributed downstream" source header and references this action via `@main`.
