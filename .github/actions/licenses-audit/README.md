# Licenses audit

Composite GitHub Action that keeps a repository's license report in sync with its dependency
tree. On a pull request that changes dependencies, it detects the consumer's package manager
(pnpm, npm, or bun), installs with the matching frozen-lockfile command, regenerates the report
with its **bundled** generator, auto-commits the result on same-repo PRs, and fails fork PRs that
ship a stale report. When no lockfile is present it skips gracefully, so it is safe to run anywhere.

It is the logic behind the synced [`licenses.yml`](../../workflows/licenses.yml) workflow,
distributed to consumers by [`contributing-sync`](../contributing-sync/README.md). The action
itself stays in the upstream repository — consumers reference it via `@main` and do not vendor a
local copy, so they get the generator (and any later fix to it) for free.

## How it works for a consumer

A consumer does not write or copy any generator: it ships **inside** this action. Enable the synced
`licenses.yml` workflow, and on every dependency-changing PR the action:

1. installs the consumer's dependencies with their own package manager, then
2. runs the bundled generator against the installed tree to regenerate `LICENSES.md`.

On a same-repo PR the regenerated report is committed back to the branch; on a fork PR a stale
report fails the check. The only requirement is a lockfile at the repository root
(`pnpm-lock.yaml`, `package-lock.json`, or `bun.lock`) — without one the action cannot run a
reproducible install, so it skips with a `::notice::`.

The action does not assume a package manager: it picks the installer from the lockfile —
`pnpm-lock.yaml` → `pnpm install --frozen-lockfile`, `package-lock.json` → `npm ci`, `bun.lock` →
`bun install --frozen-lockfile`. This matters because many pnpm repos run a
`preinstall: npx only-allow pnpm` guard that hard-fails any non-pnpm installer (including Bun), so
the audit must install with the consumer's actual package manager to get past it.

### Bundled generator

The generator lives at [`src/licenses-report.ts`](./src/licenses-report.ts) and runs under the
action's own Bun. It walks `node_modules` and reads each package's declared license, so it is
package-manager-agnostic and emits a deterministic, SPDX-grouped report with no machine-specific
paths — drift-stable across machines and CI. It has zero runtime dependencies (only `node:`
built-ins), tolerates the legacy `license` object and `licenses` array shapes, and skips private
packages (a consumer's own workspace members). The action ships the generator, not the report's
content — that is generated from each repo's own dependency tree.

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
      - "pnpm-lock.yaml"
      - "package-lock.json"
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

| Input               | Required | Default               | Description                                                                                                                                                                                                             |
| ------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot_token`         | Yes      | —                     | PAT or GitHub App token used to check out the PR branch and push the regenerated report. Pass `${{ secrets.BOT_TOKEN }}`; `GITHUB_TOKEN` is not used (see Permissions). An empty value fails the push with no fallback. |
| `bot_username`      | No       | `github-actions[bot]` | Git author/committer login for the auto-commit. Pass `${{ vars.BOT_USERNAME }}` for a dedicated bot identity.                                                                                                           |
| `licenses-file`     | No       | `LICENSES.md`         | Path the bundled generator writes and the action checks for drift.                                                                                                                                                      |
| `node-version-file` | No       | `.nvmrc`              | File `actions/setup-node` reads the Node version from.                                                                                                                                                                  |

## Outputs

| Output    | Description                                                         |
| --------- | ------------------------------------------------------------------- |
| `skipped` | `true` when no lockfile was found and the audit skipped.            |
| `drifted` | `true` when the regenerated report differed from the committed one. |

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
3. **Detect package manager** — picks pnpm, npm, or bun from the root lockfile; skips the rest with
   a `::notice::` (and `skipped=true`) when none is present.
4. **Setup and regenerate** — sets up Node from `node-version-file` (always), enables Corepack for
   pnpm, and sets up Bun (always — the action runs its bundled generator under Bun). It installs the
   consumer's dependencies with the matching frozen-lockfile command (`pnpm install --frozen-lockfile`
   / `npm ci` / `bun install --frozen-lockfile`), then runs `src/licenses-report.ts` to write the
   `licenses-file`.
5. **Detect drift** — `git diff --quiet` on the report file.
6. **Resolve drift** — on a same-repo PR, commits and pushes the regenerated report to the head
   branch; on a fork PR, prints the diff and fails with an actionable `::error::`.

The report path (`licenses-file`) and `head_ref` are passed via environment variables (never
shell-interpolated). Third-party action references (`actions/checkout`, `actions/setup-node`,
`oven-sh/setup-bun`) are pinned to major versions.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/licenses-audit@v1
```

The synced `licenses.yml` workflow references the action via `@main` so consumer repos always pick
up the latest audit logic. Pin to a tag if you want explicit control.
