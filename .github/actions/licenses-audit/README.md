# Licenses audit

Composite GitHub Action that keeps a repository's license report in sync with its dependency
tree. On a pull request that changes dependencies, it regenerates the report, auto-commits the
result on same-repo PRs, and fails fork PRs that ship a stale report. When the consumer has no
license-audit script or report file, the action skips gracefully so it is safe to run anywhere.

It is the logic behind the synced [`licenses.yml`](../../workflows/licenses.yml) workflow,
distributed to consumers by [`contributing-sync`](../contributing-sync/README.md). The action
itself stays in the upstream repository — consumers reference it via `@main` and do not vendor a
local copy.

## Requirements

The consumer must expose, in its own repository:

- a `package.json` script (default name `licenses:audit`) that regenerates the report, and
- a committed report file (default `LICENSES.md`).

When either is missing, the action emits a `::notice::` and exits successfully without auditing.
Porting a report generator into a consumer is out of scope for this action.

## Usage

```yaml
name: Licenses

on:
  pull_request:
    branches: [main]
    paths:
      - "package.json"
      - "**/package.json"
      - "bun.lock"
      - "scripts/licenses-report.ts"
      - "LICENSES.md"

concurrency:
  group: licenses-${{ github.workflow }}-${{ github.head_ref }}
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  audit:
    name: Audit
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: awinogradov/code-assistants/.github/actions/licenses-audit@main
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
```

## Inputs

| Input               | Required | Default               | Description                                                                                                                                                             |
| ------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot_token`         | No       | —                     | PAT or GitHub App token used to check out the PR branch and push the regenerated report. Pass `${{ secrets.BOT_TOKEN }}`; `GITHUB_TOKEN` is not used (see Permissions). |
| `bot_username`      | No       | `github-actions[bot]` | Git author/committer login for the auto-commit. Pass `${{ vars.BOT_USERNAME }}` for a dedicated bot identity.                                                           |
| `script`            | No       | `licenses:audit`      | Name of the `package.json` script that regenerates the report.                                                                                                          |
| `licenses-file`     | No       | `LICENSES.md`         | Path to the generated report checked for drift.                                                                                                                         |
| `node-version-file` | No       | `.nvmrc`              | File `actions/setup-node` reads the Node version from.                                                                                                                  |
| `bun-version-file`  | No       | `package.json`        | File `oven-sh/setup-bun` reads the Bun version from.                                                                                                                    |

## Outputs

| Output    | Description                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| `skipped` | `true` when no license-audit script or report file was found and the audit skipped. |
| `drifted` | `true` when the regenerated report differed from the committed one.                 |

## Permissions

The auto-commit is authored by and pushed as the dedicated bot via `bot_token` (a PAT or GitHub
App token, e.g. `${{ secrets.BOT_TOKEN }}`) with `bot_username` as the commit author — not
`github-actions[bot]`/`GITHUB_TOKEN`:

- `contents: write` — needed so the same-repo auto-commit can push the regenerated report back to
  the PR branch.

`GITHUB_TOKEN` is deliberately not used: it would attribute the commit to `github-actions[bot]`,
and commits pushed with `GITHUB_TOKEN` do not re-trigger the PR's checks, so the regenerated report
would never be re-validated. `bot_token` fixes both. Consumers of the sync system already provision
`BOT_TOKEN`, so no extra setup is required.

## Behavior

1. **Detect PR origin** — compares `head.repo.full_name` with the repository to set a same-repo vs
   fork flag.
2. **Checkout** — same-repo PRs check out the head branch writable (`persist-credentials: true`)
   so the report can be pushed; fork PRs check out the head SHA read-only
   (`persist-credentials: false`) so the base token is never written into a fork-controlled tree.
3. **Detect capability** — skips the rest with a `::notice::` (and `skipped=true`) when the
   `script` is absent from `package.json` or the `licenses-file` is missing.
4. **Setup and regenerate** — sets up Node and Bun from the version files, runs
   `bun install --frozen-lockfile`, then `bun run <script>`.
5. **Detect drift** — `git diff --quiet` on the report file.
6. **Resolve drift** — on a same-repo PR, commits and pushes the regenerated report to the head
   branch; on a fork PR, prints the diff and fails with an actionable `::error::` so the
   contributor regenerates it locally.

The `script` name and `head_ref` are passed via environment variables (never shell-interpolated)
to avoid command injection from a hostile script name or branch name. Third-party action
references (`actions/checkout`, `actions/setup-node`, `oven-sh/setup-bun`) are pinned to major
versions.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/licenses-audit@v1
```

The synced `licenses.yml` workflow references the action via `@main` so consumer repos always pick
up the latest audit logic. Pin to a tag if you want explicit control.
