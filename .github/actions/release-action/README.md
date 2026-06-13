# Release action

[![GitHub Release](https://img.shields.io/badge/release-v1.1.2-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

Composite GitHub Action that automates the release pipeline for npm packages, GitHub Actions, and Claude plugins.

The action drives a two-phase flow — **create** opens a release PR that bumps the version, generates the changelog from [conventional commits](https://www.conventionalcommits.org/), enriches it with ticket details (Linear, Jira, GitHub Issues) and an optional AI-generated summary; **publish** runs when the release PR is merged and creates the git tag, npm publish, GitHub Release, floating major-version tag, and Slack notification — selecting the right artifacts based on the `release` field in `package.json` (see [`docs/06-release-field.md`](../../../docs/06-release-field.md)).

## Usage

### Create

Runs on push to `main`. Generates the changelog and opens a release PR.

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: awinogradov/code-assistants/.github/actions/release-action@v1
        with:
          mode: create
          # Authors the release PR. When release PRs are auto-approved by
          # code-review-action, this token's identity must differ from the
          # reviewer's — GitHub forbids approving your own PR. This repo passes a
          # separate GH_TOKEN here while the reviewer/publish steps use BOT_TOKEN
          # (see Permissions). Repos without auto-approval can reuse one token.
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_RELEASE_KEY }}
          linear_api_key: ${{ secrets.LINEAR_API_KEY }}
          linear_keys: ${{ vars.LINEAR_KEYS }}
```

### Publish

Triggers when a release PR is merged (detected via `.release_notes/**` changes).

```yaml
name: Publish

on:
  pull_request_target:
    types: [closed]
    paths: [.release_notes/**]

permissions:
  contents: write

jobs:
  publish:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: awinogradov/code-assistants/.github/actions/release-action@v1
        with:
          mode: publish
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
          npm_token: ${{ secrets.NPM_TOKEN }}
          slack_token: ${{ secrets.SLACK_TOKEN }}
```

## Inputs

| Input               | Required | Default               | Description                                                                                                     |
| ------------------- | -------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `mode`              | yes      | —                     | `create` or `publish`.                                                                                          |
| `bot_token`         | yes      | —                     | PAT or App installation token with `contents: write` + `pull-requests: write`. See [Permissions](#permissions). |
| `bot_username`      | no       | `github-actions[bot]` | Git author/committer login for release commits, tags, and PRs. Pass `${{ vars.BOT_USERNAME }}`.                 |
| `npm_token`         | no       | —                     | NPM token. Required for `publish` with `lib-nodejs` or `lib-bun` release types.                                 |
| `anthropic_api_key` | no       | —                     | Anthropic API key. When set, generates human-readable release-note summaries.                                   |
| `name`              | no       | —                     | Service or library name for PR titles (e.g. `Dialog Manager` → `Release Dialog Manager 1.2.0`).                 |
| `branch`            | no       | `release-{version}`   | Release branch template. `{version}` is substituted. `create` mode only.                                        |
| `linear_api_key`    | no       | —                     | Linear API key for ticket integration.                                                                          |
| `linear_keys`       | no       | —                     | Comma-separated Linear key prefixes (e.g. `TEAM,PROJ`).                                                         |
| `jira_base_url`     | no       | —                     | Jira instance base URL (used with `jira_email` + `jira_api_token`).                                             |
| `jira_email`        | no       | —                     | Jira authentication email.                                                                                      |
| `jira_api_token`    | no       | —                     | Jira API token.                                                                                                 |
| `jira_keys`         | no       | —                     | Comma-separated Jira key prefixes.                                                                              |
| `slack_token`       | no       | —                     | Slack bot token. Required to post release notifications.                                                        |

## Outputs

| Output         | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `version`      | Released version number.                                   |
| `release-type` | Detected release type from `package.json` `release` field. |
| `pr-url`       | URL of the created or updated release PR.                  |

## Modes

- **`create`** — analyzes commits since the last release tag, bumps the version per conventional-commit rules (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major), regenerates the changelog with ticket details and optional AI summary, and opens a `release-{version}` PR.
- **`publish`** — runs after the release PR is merged. Tags the merge commit, publishes artifacts based on `package.json` `release`, creates a GitHub Release, and (for action repos) updates the floating major tag (e.g. `v1`).

## Release type

Release behavior is driven by the top-level `release` field in the consumer's `package.json`. See [`docs/06-release-field.md`](../../../docs/06-release-field.md) for the full spec; the at-a-glance table is reproduced below in the same row order. The fallback chain for the version source is `version` file → `package.json` → `plugin.json` → `pyproject.toml`.

| Value            | Version source   | NPM publish | GitHub Release | Major version tag (`v1`) |
| ---------------- | ---------------- | ----------- | -------------- | ------------------------ |
| `lib-nodejs`     | `package.json`   | Yes         | Yes            | No                       |
| `lib-bun`        | `package.json`   | Yes         | Yes            | No                       |
| `lib-python`     | `pyproject.toml` | No          | Yes            | No                       |
| `service-nodejs` | `package.json`   | No          | Yes            | No                       |
| `service-python` | `pyproject.toml` | No          | Yes            | No                       |
| `github-action`  | `package.json`   | No          | Yes            | Yes                      |
| `claude-plugin`  | `plugin.json`    | No          | Yes            | No                       |

Minimal `package.json`:

```json
{
  "name": "my-lib",
  "release": {
    "type": "lib-nodejs"
  }
}
```

The `.release_bot` working directory is added to `.gitignore` automatically on the first run.

## Ticket integration

Extract ticket IDs from PR titles and commit messages, then fetch details via API and embed them in the changelog.

| System        | Pattern    | Environment variables                           |
| ------------- | ---------- | ----------------------------------------------- |
| Linear        | `TEAM-123` | `LINEAR_API_KEY`                                |
| Jira          | `PROJ-456` | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| GitHub Issues | `#123`     | `BOT_TOKEN`                                     |

Optional key filtering via `LINEAR_KEYS` / `JIRA_KEYS` (e.g. `TEAM,PROJ`). When multiple ticket systems are configured, prefix keys are required so the action can route each ticket to the right system.

## Slack notifications

Add `slack` to the `release` object in `package.json`:

```json
{
  "release": {
    "type": "lib-nodejs",
    "slack": "#your-channel"
  }
}
```

Then pass `slack_token` to the publish workflow. The bot token needs the `chat:write` scope. The notification includes the version, the AI-generated release notes (when present), and a link to the GitHub release. Omit `release.slack` to skip Slack entirely.

## Permissions

The `bot_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever the repo or its org disables **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**.

Pass one of:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to the repo with `Contents: Read and write` and `Pull requests: Read and write`.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token as a secret (e.g. `BOT_TOKEN`) and pass it via `bot_token: ${{ secrets.BOT_TOKEN }}`.

The Configure Git step inside the action commits as the `bot_username` input, defaulting to `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`. Pass `bot_username: ${{ vars.BOT_USERNAME }}` to author releases as a dedicated bot identity.

> **Distinct identity when auto-approval is enabled.** If release PRs are auto-approved by [`code-review-action`](../code-review-action/README.md) (to feed [`release-automerge`](../release-automerge/README.md)), the `bot_token` identity that opens the PR must **differ** from the reviewer identity that approves it — GitHub forbids approving your own PR. In this repo, `release-create.yml` opens PRs with `GH_TOKEN` while the reviewer/merge token is `BOT_TOKEN`. See [Author and approver must be distinct identities](../../../docs/07-release-automerge.md#author-and-approver-must-be-distinct-identities).

## Monorepo mode

When the repository root declares either `release.members` or a `workspaces` array, `release-action` switches to **monorepo mode** and runs the create/publish flow once per release-eligible workspace member.

### Discovery

| Source                                          | Effect                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Root `release.members: string[]`                | Explicit allow-list of workspace paths. Preferred when not every workspace member should release.                              |
| Root `workspaces: string[]`                     | Fallback when `release.members` is absent. Each glob is expanded and every member with a `release` field is included.          |
| Member without its own `release` field          | Skipped (internal-only).                                                                                                       |
| No eligible members AND root has `release.type` | Standalone fallback — the legacy single-artifact pipeline runs against the repo root, identical to the pre-monorepo behaviour. |

### Per-member behaviour

| Concern            | Standalone                   | Monorepo (per member)                                                                                   |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Last tag           | `v*`                         | `<name>@v*` (e.g. `release-action@v1.2.0`)                                                              |
| Floating major tag | `v1` (`github-action` only)  | `<name>@v1` (`github-action` only)                                                                      |
| Changelog file     | `CHANGELOG.md`               | `<member>/CHANGELOG.md`                                                                                 |
| Release notes file | `.release_notes/<v>.md`      | `<member>/.release_notes/<v>.md`                                                                        |
| Branch             | `release-<v>` (configurable) | `release-<name>-<v>` (template `release-{member}-{version}`)                                            |
| PR label           | `release-action`             | `release-<name>` (auto-created per member)                                                              |
| Slack channel      | Root `release.slack`         | Each member's own `release.slack`                                                                       |
| Migrations         | n/a                          | `<member>/MIGRATING.md` is appended on major bumps with notes extracted from `BREAKING CHANGE:` footers |

A member with no commits touching its path since its last tag is skipped silently. When a member's release ships and another member declares a workspace dependency on it, the dependent picks up at least a `patch` bump and a `chore(deps)` entry in its changelog.

### Tag-ref ergonomics

Composite-action consumers reference the action by ref: `uses: owner/repo/.github/actions/<name>@<ref>`. With `<name>@v<version>` tags, the ref contains a literal `@`, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/release-action@release-action@v1
```

GitHub accepts this form. SHA pins (`@<commit>`) are also fine.

### Publish workflow

A single shared `publish` workflow handles every member — the action reads the merged PR's changed files and resolves the unique `<member>/.release_notes/<version>.md` path to determine which member to publish:

```yaml
name: Publish

on:
  pull_request_target:
    types: [closed]
    paths:
      - "**/.release_notes/**"

permissions:
  contents: write

jobs:
  publish:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: awinogradov/code-assistants/.github/actions/release-action@v1
        with:
          mode: publish
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
          npm_token: ${{ secrets.NPM_TOKEN }}
          slack_token: ${{ secrets.SLACK_TOKEN }}
```

The action reads the merged PR's changed files itself — via `GITHUB_EVENT_PATH` (the GitHub event payload) and the GitHub API using `bot_token` — so no upstream step or extra environment configuration is required.

## Versioning

Reference the action by tag, for example:

```yaml
uses: awinogradov/code-assistants/.github/actions/release-action@v1
```
