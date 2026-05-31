# Auto label

Composite GitHub Action that keeps `<scope>/<workspace-member>` labels in sync with the workspace
members a pull request touches, and prunes orphan labels on the default branch. It is a TypeScript
(Bun) action that reads everything through the GitHub Contents API — no `actions/checkout` is
required.

The label prefix is **derived** from the root `package.json` `name`'s npm scope, so the action is
drop-in for any Bun/npm workspace (`@code-assistants` → `code-assistants/`, `@symbiot/…` →
`symbiot/`). Pass `label-prefix` to override. Member directories are read from the `workspaces`
field, handling **both** literal paths (`.github/actions/files-sync`) and `<parent>/*` globs
(`packages/*`).

## How it works

The action auto-detects its mode from `github.event_name`:

```
                        ┌────────────────────────────┐
                        │  Consumer workflow           │
                        │  auto-label.yml              │
                        └──────────────┬───────────────┘
                                       │
                    ┌───────── ① ──────┴────── ② ───────┐
                    ▼                                    ▼
    ┌────────────────────────────┐    ┌────────────────────────────┐
    │        label-PR mode         │    │      prune-labels mode       │
    ├────────────────────────────┤    ├────────────────────────────┤
    │ • enumerate workspace        │    │ • enumerate workspace        │
    │   members (literal + glob)   │    │   members                    │
    │ • compute labels touched     │    │ • delete orphan <prefix>/*   │
    │   by the PR's changed files  │    │   labels (member removed)    │
    │ • reconcile PR <prefix>/*    │    │                              │
    │   labels: add new/remove old │    │                              │
    └────────────────────────────┘    └────────────────────────────┘
```

**Flow Legend:**

- ① `pull_request` to the default branch → label-PR mode
- ② `push` to the default branch → prune-labels mode
- Both modes derive `<prefix>` from the root `package.json` name's scope and read members via the
  GitHub Contents API at the relevant ref.

The action lives in `awinogradov/code-assistants`; its workflow is distributed to consumer repos by
[`contributing-sync`](../contributing-sync/README.md), so every consumer runs the same logic from a
single source:

```
┌────────────────────────────────────────────────────────────┐
│  awinogradov/code-assistants  (source of truth)              │
│   .github/actions/auto-label/       the composite action     │
│   .github/workflows/auto-label.yml  canonical workflow       │
└───────────────────────────────┬──────────────────────────────┘
                                 │ ①
                                 ▼
                     ┌──────────────────────────────┐
                     │  contributing-sync             │
                     │  (files list + auto-label.yml) │
                     └───────────────┬────────────────┘
                                     │ ②
                                     ▼
                     ┌──────────────────────────────┐
                     │  upstream.yml                  │
                     │  (sync-contributing job)       │
                     └───────────────┬────────────────┘
                                     │ ③
                                     ▼
┌────────────────────────────────────────────────────────────┐
│  Downstream repo (e.g. awinogradov/symbiot)                  │
│   receives auto-label.yml via maintenance PR                 │
│   uses …/auto-label@main → derives  symbiot/   ④             │
└────────────────────────────────────────────────────────────┘
```

**Flow Legend:**

- ① `auto-label.yml` is added to `contributing-sync`'s synced files list
- ② `upstream.yml`'s `sync-contributing` job runs `contributing-sync@main` on schedule
- ③ the downstream repo receives `auto-label.yml` as a maintenance PR
- ④ the synced workflow consumes the upstream action and derives its prefix from the downstream
  repo's own root scope

## Usage

```yaml
name: Auto label

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

concurrency:
  group: auto-label-${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  auto-label:
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.fork == false
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: awinogradov/code-assistants/.github/actions/auto-label@v1
        with:
          token: ${{ github.token }}
```

## Inputs

| Input                        | Required | Default                            | Description                                                                                                                           |
| ---------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `token`                      | yes      | —                                  | Token with `pull-requests: write` + `issues: write`. The default `GITHUB_TOKEN` is sufficient (read-only on fork PRs — see Behavior). |
| `label-prefix`               | no       | _(derived)_                        | Override the auto-derived prefix. Empty → derived from the root `package.json` `name` scope. A trailing `/` is added when missing.    |
| `label-color`                | no       | `5319e7`                           | Hex color (no leading `#`) for labels the action creates.                                                                             |
| `label-description-template` | no       | `Auto-applied: PR touches {label}` | Template for created label descriptions. `{label}` is replaced with the label name.                                                   |

## Permissions

- `issues: write` — repository label CRUD (`createLabel`/`deleteLabel`); this is the load-bearing
  scope, since PR labels are managed through the issues API.
- `pull-requests: write` — add/remove labels on the pull request.
- `contents: read` — default; the action reads `package.json` via the API and needs no checkout.

## Behavior

**label-PR mode** (`pull_request`): enumerates members at the PR's base and head SHAs (so members
added or renamed in the PR are caught), derives the labels touched by the PR's changed files
(including a renamed file's previous path), ensures each touched label exists, then reconciles the
PR's `<prefix>/*` labels — adding new ones and removing stale ones. Labels outside `<prefix>` are
never touched.

**prune-labels mode** (`push` to the default branch): enumerates the current members and deletes any
`<prefix>/*` repository label whose member no longer exists.

A hostile `package.json` `name` cannot inject arbitrary labels: every derived label is validated
against a conservative charset/length before use.

## Notes

- **Scope the triggers.** The mode is chosen from `github.event_name`, so a `push` to _any_ branch
  would run prune. Consumers MUST filter `push: branches: [<default>]` (and `pull_request:
branches`) so prune only runs on the default branch.
- **`pull_request`, not `pull_request_target`.** The action runs untrusted fork code with a
  read-only token plus the fork guard in the job `if:`. Do not switch to `pull_request_target` to
  obtain a write token on fork PRs — that is a security regression.

## Versioning

Reference the action by a tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/auto-label@v1
```

The synced `auto-label.yml` workflow references the action via `@main` so consumers always pick up
the latest behavior. Pin to a tag if you want explicit control.
