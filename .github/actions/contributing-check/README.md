# Contributing check

Composite GitHub Action that validates the three CONTRIBUTING.md enforcement points on a pull
request — branch name, commit messages, and PR title — in a single job. It wraps existing
community actions (`deepakputhraya/action-branch-name`, `wagoid/commitlint-github-action`,
`amannn/action-semantic-pull-request`) so consumer repos get the full check set with one `uses:`
line.

Consumer repos get the action by syncing [`contributing.yml`](../../workflows/contributing.yml)
via [`contributing-sync`](../contributing-sync/README.md). The synced workflow references the
action remotely (`awinogradov/code-assistants/.github/actions/contributing-check@main`), so the
action itself does not need to be checked into the consumer repo.

## Usage

```yaml
name: Contributing

on:
  pull_request:
    branches: [main]
    types: [opened, edited, synchronize, reopened]

concurrency:
  group: contributing-${{ github.workflow }}-${{ github.head_ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  validate:
    name: Validate PR
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: awinogradov/code-assistants/.github/actions/contributing-check@v1
```

## Inputs

| Input  | Required | Default | Description                                                                                                        |
| ------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| _none_ | —        | —       | The action is configuration-free. Rules and regexes are baked in so every consumer enforces identical conventions. |

## Outputs

| Output | Description                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| _none_ | The action signals violations through job status. Failed steps surface as inline annotations on the PR diff and a red check on the merge button. |

## Permissions

The workflow's default `GITHUB_TOKEN` is sufficient — no PAT or App token required. The action only reads:

- `contents: read` — `actions/checkout` needs it so `wagoid/commitlint-github-action` can walk the PR commit range.
- `pull-requests: read` — `amannn/action-semantic-pull-request` reads the PR title via the API.

The action never writes to the repository or to the PR, so writes are not requested.

## Behavior

The action runs four steps sequentially. The first failure short-circuits the job — later steps do not run.

Dependabot-authored PRs (author `dependabot[bot]`) skip every step — their machine-generated `dependabot/...` branches and update titles do not follow the human conventions. Each step is gated on the PR author, so the "Validate PR" job still reports success (green) rather than a stuck or failed required check.

1. **Branch name** — [`deepakputhraya/action-branch-name@v1.0.0`](https://github.com/deepakputhraya/action-branch-name) enforces the regex `^(issue-\d+-[a-z0-9]+(-[a-z0-9]+)*|[a-z][a-z0-9]*-\d+-[a-z0-9]+(-[a-z0-9]+)*|(hotfix|trivial|maintenance|proposal|security)-[a-z0-9]+(-[a-z0-9]+)*|release-([a-z0-9]+(-[a-z0-9]+)*-)?\d+\.\d+\.\d+)$` — the GitHub `issue-<n>-<slug>` form, the Linear `<team>-<n>-<slug>` form, the special prefixes, and release branches — with `min_length: 5`, `max_length: 100`, and `ignore: main,master`. This matches the CONTRIBUTING.md `Branches` section.
2. **Checkout** — `actions/checkout@v4` with `fetch-depth: 0` so commitlint can resolve the full PR commit range.
3. **Commit messages** — [`wagoid/commitlint-github-action@v6`](https://github.com/wagoid/commitlint-github-action) runs against `./commitlint.config.mjs` with `failOnWarnings: false`. Level-1 (warning) rules — `body-max-line-length` and `footer-max-line-length` — are surfaced as warnings but do not block merge. Level-2 (error) rules — including the custom `body-required-for-types`, `no-issue-id-in-subject`, and `no-ai-coauthored-by` — block merge.
4. **PR title (semantic)** — [`amannn/action-semantic-pull-request@v6`](https://github.com/amannn/action-semantic-pull-request) accepts the special prefixes (`HOTFIX`, `TRIVIAL`, `MAINTENANCE`, `PROPOSAL`, `SECURITY`, `Release`), the Linear ticket-id prefix via the `[A-Z][A-Z0-9]*-\d+` type pattern (e.g. `ENG-123: …` on Linear-tracked repos), and any capitalized business-style title via the `[A-Z]\w*` type pattern. Titles ending in a period are rejected with a CONTRIBUTING.md cross-reference.
5. **PR title length** — Inline bash check fails the job if the PR title exceeds 120 characters. The title is read via the `PR_TITLE` env var (not shell-interpolated) to avoid command injection from a hostile title.

All third-party action references are pinned to commit SHAs with `# vX.Y.Z` comments so a tag move does not silently change behavior.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/contributing-check@v1
```

The synced `contributing.yml` workflow references the action via `@main` so consumer repos always pick up the latest validation rules. Pin to a tag if you want explicit control.
