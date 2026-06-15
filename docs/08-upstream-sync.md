# Upstream sync

> Chapter 8 of the [repository docs](../README.md#repository-docs).

`awinogradov/code-assistants` is an upstream hub: consumer repositories pull shared standards
and workflows from it on a schedule and receive one maintenance pull request per change. A
consumer wires this up with a single workflow, `.github/workflows/upstream.yml`, that runs the
[`upstream-sync`](../.github/actions/upstream-sync/README.md) composite action.

The `upstream-sync` action aggregates five independent sync kinds behind one step. Every kind runs by
default and is opt-out: it is disabled by setting its input to `false`. Because the kinds live
inside the action — not in the consumer's workflow — adding a sync kind upstream propagates to
every consumer automatically, with no consumer workflow edit.

## Sync kinds

| Kind           | Files synced into the consumer                                                                                                                                                                                             | Maintenance branch              | Action                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `agents-rules` | `rules/<stack>.md` → `CLAUDE.md`                                                                                                                                                                                           | `maintenance-sync-agents-rules` | [`agents-rules-sync`](../.github/actions/agents-rules-sync/README.md) |
| `code-review`  | `.github/workflows/code-review.yml`, `.github/workflows/code-review-cost-monitor.yml`                                                                                                                                      | `maintenance-sync-code-review`  | [`code-review-sync`](../.github/actions/code-review-sync/README.md)   |
| `repomix`      | `.github/workflows/repomix-pack.yml`, `repomix.config.json`                                                                                                                                                                | `maintenance-sync-repomix`      | [`repomix-sync`](../.github/actions/repomix-sync/README.md)           |
| `release`      | `.github/workflows/release-create.yml`, `release-publish.yml`, `release-automerge.yml`                                                                                                                                     | `maintenance-sync-release`      | [`release-sync`](../.github/actions/release-sync/README.md)           |
| `contributing` | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE.md`, `SECURITY.md`, `.github/workflows/contributing.yml`, `.github/workflows/auto-label.yml`, `.github/workflows/licenses.yml`, `.github/workflows/validate-actions.yml` | `maintenance-sync-contributing` | [`contributing-sync`](../.github/actions/contributing-sync/README.md) |

Each kind delegates to its `*-sync` action, which delegates the diff and PR mechanics to
[`files-sync`](../.github/actions/files-sync/README.md). The action directories these synced
workflows reference (`code-review-action`, `release-action`, etc.) are **not** vendored
downstream — consumers reference them via `@main`.

## Setup

A consumer needs:

- A repository secret **`BOT_TOKEN`** — a PAT (classic with `repo`, or fine-grained with
  `contents: write` + `pull-requests: write`) or a GitHub App installation token. The default
  `GITHUB_TOKEN` is not supported; see the action's
  [Permissions](../.github/actions/upstream-sync/README.md#permissions) for the rationale.
- An optional repository variable **`BOT_USERNAME`** — the git author login for sync commits.
  Defaults to `github-actions[bot]`.
- For the `repomix` kind, the `BOT_TOKEN` identity must be a **bypass actor** on the
  default-branch ruleset (the synced `repomix-pack.yml` pushes the pack directly to the default
  branch).

The workflow itself is the recipe in the action's
[Usage](../.github/actions/upstream-sync/README.md#usage) section — schedule + `workflow_dispatch`, one
job, one `upstream-sync@main` step.

## Behavior

- **Opt-out:** every kind defaults to `true`. Disable a kind with `<kind>: false` in the step's
  `with:` block. Booleans are strings — use `true` / `false`, not YAML's `yes` / `on`.
- **Serial, single job:** the five kinds run as steps on one runner. Each is API-only and fast,
  so the run finishes well within the workflow timeout.
- **Failure isolation:** each kind runs with `continue-on-error`, and a final step fails the job
  if any _enabled_ kind failed, naming the failed kinds in a `::error::` annotation. A disabled
  kind is skipped and never fails the job. The hourly schedule retries every enabled kind on the
  next run; each child action is idempotent (it force-updates its own maintenance branch).
- **Local edits are overwritten:** maintenance branches are force-updated, so local changes to a
  synced file are replaced when upstream changes.

## Topology

```
BEFORE: upstream.yml = 5 hand-maintained parallel jobs
  job:agents-rules  job:code-review  job:repomix  job:release  job:contributing
        each → <kind>-sync@main → files-sync → 1 maintenance PR / kind
        (adding a 6th kind = every consumer edits this file)

AFTER: upstream.yml = 1 thin job (same name, same cron)
  job: uses upstream-sync@main  with { bot_token, bot_username, release: false }
        │
        ▼
  upstream-sync@main (composite)   gate: if inputs['<kind>'] == 'true'  (all default "true")
    ├─ agents-rules-sync  ┐
    ├─ code-review-sync   │ each step: continue-on-error
    ├─ repomix-sync       ├─→ files-sync → 1 maintenance PR / kind
    ├─ release-sync       │
    ├─ contributing-sync  ┘
    └─ aggregate outcomes → fail job if any enabled kind failed
```

## Migration

Replace the body of an existing five-job `.github/workflows/upstream.yml` with the one-job recipe
from the action's [Usage](../.github/actions/upstream-sync/README.md#usage) section. Keep the file name,
triggers, concurrency, and permissions — only the `jobs:` section changes, so existing links to
`upstream.yml` stay valid and there is no second workflow racing on the `maintenance-sync-<kind>`
branches.
