# Release auto-merge

[![GitHub Release](https://img.shields.io/badge/release-v0.2.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that merges a release PR once it is fully green and
approved. It is event-driven and self-healing: re-evaluated on every relevant
event, it merges as soon as the conditions are met, with no manual step.

A PR is merged only when **all** of the following hold:

- the head ref matches `^release-`,
- the PR is open,
- the releasing member opted in: `release.automerge` resolves to `true`, taking
  the member's own value and falling back to the root default — `member ?? root ??
false`, read at the PR head SHA,
- the PR's `reviewDecision` is `APPROVED` (checked first, so non-approval review
  events skip without waiting), and
- every sibling check is green. Because an approval commonly fires this action
  before CI finishes — and GitHub does not redeliver `check_suite` events for
  `GITHUB_TOKEN` check suites — pending checks are **polled** until they settle
  (15s interval, 8-minute cap inside the 10-minute job) rather than skipped; a
  failed check skips, as does one still pending after the cap.

> **The `APPROVED` decision comes from auto-approval.** [`code-review-action`](../code-review-action/README.md) posts it for trusted release-PR authors. That requires the release PR to be authored by an identity **distinct** from the reviewer (GitHub forbids approving your own PR); see [Author and approver must be distinct identities](../../../docs/07-release-automerge.md#author-and-approver-must-be-distinct-identities). Without a recorded approval this action never merges.

> **Opt-in (default off).** Auto-merge is disabled unless `release.automerge`
> resolves to `true` (see the [`release` field spec](../../../docs/06-release-field.md)).
> A monorepo opens one release PR per member (`release-<member>-<version>`), so the
> gate resolves per member: it reads the member's own `release.automerge` and falls
> back to the root default. Set it on the root to enable the whole repo, or on a
> member to opt that package in or out. Because consumers reference this action via
> `@main`, adopting the synced workflow alone does **not** enable auto-merge — each
> repo must add the flag, or its release PRs stay approved-but-unmerged for a human
> to merge.

The merge is pinned to the triggering head commit, so a push that lands during
evaluation is rejected rather than merged unreviewed. The check aggregation reuses
the same logic as the AI-review preflight (the shared
[`checkStatus`](../../../packages/actions-core/src/checkStatus.ts) helper),
deduplicated by name and excluding the action's own job. See the
[Release auto-merge flow](../../../docs/07-release-automerge.md) doc for the full
picture and the downstream-sync design.

## Usage

```yaml
name: Release auto-merge

on:
  check_suite:
    types: [completed]
  pull_request_review:
    types: [submitted]

concurrency:
  group: release-automerge-${{ github.event.check_suite.head_sha || github.event.pull_request.head.sha }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  automerge:
    # Run only for release branches — the triggers are repo-wide, so this guard
    # keeps the job (and its check) off every non-release PR.
    if: >-
      startsWith(github.event.check_suite.head_branch, 'release-')
      || startsWith(github.event.pull_request.head.ref, 'release-')
    runs-on: ubuntu-latest
    steps:
      - uses: awinogradov/code-assistants/.github/actions/release-automerge@v1
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
```

Most consumers receive this workflow automatically from
[`release-sync`](../release-sync/README.md) — which syncs the whole release pipeline
(`release-create.yml`, `release-publish.yml`, `release-automerge.yml`) — and never write it by hand.

## Inputs

| Input       | Required | Default | Description                                                                                                                                                          |
| ----------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot_token` | yes      | —       | PAT or GitHub App installation token used to read PR state and perform the merge. The default `GITHUB_TOKEN` is **not** supported — see [Permissions](#permissions). |

## Permissions

The `bot_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not
supported because a merge it performs **does not trigger downstream workflows** —
[`release-publish.yml`](../../workflows/release-publish.yml) (which runs on
`pull_request_target: [closed]` for `**/.release_notes/**`) would never fire, so the
release would not publish. Pass one of:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to this repository with
  `Contents: Read and write` and `Pull requests: Read and write`.
- A **GitHub App installation token** with the same `contents: write` +
  `pull-requests: write` permissions.

Store the token in a secret (e.g., `BOT_TOKEN`) and pass it via
`bot_token: ${{ secrets.BOT_TOKEN }}`.

> **Ruleset bypass for protected `main`.** If `main` is governed by a ruleset
> (`pull_request` / required-status-checks / linear-history / signed-commits rules),
> the `BOT_TOKEN` identity must be a **bypass actor** on it, and the ruleset's
> allowed merge methods must include the method the action selects (it prefers
> `rebase`, then `squash`, then `merge`) — otherwise the merge fails with an opaque
> 403/422. A required check that is _skipped_ on release branches must report a
> neutral/success conclusion or be marked non-required, or it blocks the merge.

## Behavior

- Resolves the open release PR from the triggering commit via the
  commit-associated-PRs API, then bails unless its head ref matches `^release-`.
- Identifies the releasing member from the PR's `<member>/.release_notes/<version>.md`
  file, then reads `release.automerge` from that member's `package.json` (overriding)
  and the root `package.json` (default) at the head SHA, skipping unless the resolved
  value is `true`. A missing `package.json` is a clean skip; a malformed one fails
  closed (no merge); a non-boolean `automerge` is rejected; an unresolvable member
  is left unmerged.
- Aggregates check runs and commit statuses in a single snapshot (no polling):
  any failed check or any still-pending check skips the merge until a later event.
- Reads `reviewDecision` and merges only when it is `APPROVED`.
- Reads the repository's allowed merge methods and prefers `rebase`, falling back
  to `squash` then `merge`. The merge is pinned to the head SHA.
- Fail-closed: any unmet condition or unexpected error performs no merge. An
  already-merged or no-longer-mergeable PR is a clean no-op.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/release-automerge@v1
```
