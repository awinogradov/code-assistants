# Release auto-merge

Release PRs (branch `release-<version>`) are auto-approved by
[`code-review-action`](../.github/actions/code-review-action/README.md) but then
sit approved-but-unmerged until a human clicks merge, stalling the publish
pipeline. This repository closes that gap with an event-driven
[`release-automerge`](../.github/actions/release-automerge/README.md) action that
merges a release PR the moment it is green and approved. This document describes
why it exists, how the merge gate works, and how the workflow is propagated
downstream.

## Why it exists

GitHub's native auto-merge cannot be scoped to a specific PR or branch under this
repository's org settings, so it cannot be limited to release branches. A custom,
event-driven action is the only way to merge **only** release PRs without
babysitting each release. Because it re-evaluates on every relevant event, it is
self-healing: a late approval or a re-run that turns the last check green triggers
the merge with no manual step.

## How it works

```
 release PR (head: release-<version>)
   │ checks run            code-review-action auto-approves
   │ (CI, lint, …)         (release-* PR by trusted author)
   ▼                                  │
 ┌──────────────────────────────────────────────────────────┐
 │ release-automerge.yml  (event-driven)                     │
 │ on: check_suite[completed] · status · pull_request_review │
 └───────────────────────────┬───────────────────────────────┘
                             ▼
   ┌─────────────────────────────────────────────────┐
   │ release-automerge action                         │
   │ 1. resolve open PR for the head SHA              │
   │ 2. head ref ~ ^release-  AND  state == open ?    │
   │ 3. all checks green? (shared aggregation)        │
   │ 4. reviewDecision == APPROVED ?                  │
   │ 5. merge (sha-pinned) with an allowed method     │
   └───────────────────────────┬─────────────────────┘
                  ▼ all true                ▼ any false / any error
            merge PR                   no-op (never merge)
                  │
                  ▼ merge cascades (PAT bot_token)
            publish.yml runs on merge
```

- **Triggers:** `check_suite: [completed]`, `status`, and
  `pull_request_review: [submitted]`. The first two cover the case where the last
  green signal (a check run **or** a commit status) arrives after approval; the
  third covers a late approval landing after checks are already green.
- **Merge conditions (all must hold):** the head ref matches `^release-`, the PR
  is open, every sibling check is green (failed → skip; still pending → skip), and
  `reviewDecision == APPROVED`. The check aggregation reuses the same logic as the
  AI-review preflight (see [the shared `checkStatus` helper][checkstatus]),
  deduplicated by name and excluding the action's own job.
- **Merge method:** the action reads the repository's allowed merge methods
  (`allow_rebase_merge` / `allow_squash_merge` / `allow_merge_commit`) and prefers
  `rebase`, falling back to `squash` then `merge`. The merge is pinned to the
  triggering head SHA, so a push that lands mid-evaluation is rejected rather than
  merged unreviewed.
- **Fail-closed:** any unmet condition or unexpected error results in no merge.
  An already-merged or no-longer-mergeable PR is treated as a clean no-op so
  concurrent events do not error.

### Why a PAT/App token, not `GITHUB_TOKEN`

The action merges with the repository's `BOT_TOKEN` (a PAT or GitHub App
installation token), **not** the default `GITHUB_TOKEN`. A merge performed with
`GITHUB_TOKEN` does not trigger downstream workflows, so
[`publish.yml`](../.github/workflows/publish.yml) — which runs on
`pull_request_target: [closed]` for `**/.release_notes/**` — would never fire and
the release would not publish. The upstream auto-approval is posted with the same
token for the same reason.

> **Ruleset bypass for protected `main`.** If `main` is governed by a ruleset
> (`pull_request` / required-status-checks / linear-history / signed-commits
> rules), the `BOT_TOKEN` identity must be a **bypass actor** on it, and the
> ruleset's allowed merge methods must include the method the action selects —
> otherwise `gh`/the merge API returns an opaque 403/422. A required check that is
> _skipped_ on release branches (e.g. the AI review) must report a neutral/success
> conclusion or be marked non-required, or it will block the merge. Add the bot to
> the ruleset's bypass list (Settings → Rules → the branch ruleset → Bypass list).

## Downstream propagation

The workflow is distributed to downstream repositories exactly like the
code-review and repomix workflows:

```
   upstream.yml ──hourly──> release-automerge-sync ──> files-sync
     (cron)                  (wraps files-sync)          │
                                                         ▼
                  PR: sync .github/workflows/release-automerge.yml
                  (action dir NOT synced — referenced via @main)
```

The [`release-automerge-sync`](../.github/actions/release-automerge-sync/README.md)
action wraps [`files-sync`](../.github/actions/files-sync/README.md) to sync only
`.github/workflows/release-automerge.yml` to a `maintenance-sync-release-automerge`
branch and open (or reuse) a single PR. The `release-automerge` action directory
itself is **not** synced — downstream repos reference it via `@main`, the same way
`code-review.yml` references `code-review-action`. A new `sync-release-automerge`
job in [`upstream.yml`](../.github/workflows/upstream.yml) runs it on the existing
hourly schedule.

The merge this action performs is what feeds the publish step; see the
[`release` field spec](./release-field.md) for how `release-action` then selects
artifacts on publish.

[checkstatus]: ../packages/actions-core/src/checkStatus.ts
