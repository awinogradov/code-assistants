# Release action

Composite GitHub Action that automates the release pipeline for npm packages, GitHub Actions, and Claude plugins.

The action drives a two-phase flow — **create** opens a release PR that bumps the version, generates the changelog from [conventional commits](https://www.conventionalcommits.org/), enriches it with ticket details (Linear, Jira, GitHub Issues) and an optional AI-generated summary; **publish** runs when the release PR is merged and creates the git tag, npm publish, GitHub Release, floating major-version tag, and Slack notification — selecting the right artifacts based on the `release:` field in `platform.meta.yml`.

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
          github_token: ${{ secrets.GH_TOKEN }}
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
          github_token: ${{ secrets.GH_TOKEN }}
          npm_token: ${{ secrets.NPM_TOKEN }}
          slack_token: ${{ secrets.SLACK_TOKEN }}
```

## Inputs

| Input               | Required | Default             | Description                                                                                                     |
| ------------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `mode`              | yes      | —                   | `create` or `publish`.                                                                                          |
| `github_token`      | yes      | —                   | PAT or App installation token with `contents: write` + `pull-requests: write`. See [Permissions](#permissions). |
| `npm_token`         | no       | —                   | NPM token. Required for `publish` with `lib-nodejs` or `lib-bun` release types.                                 |
| `anthropic_api_key` | no       | —                   | Anthropic API key. When set, generates human-readable release-note summaries.                                   |
| `name`              | no       | —                   | Service or library name for PR titles (e.g. `Dialog Manager` → `Release Dialog Manager 1.2.0`).                 |
| `branch`            | no       | `release-{version}` | Release branch template. `{version}` is substituted. `create` mode only.                                        |
| `linear_api_key`    | no       | —                   | Linear API key for ticket integration.                                                                          |
| `linear_keys`       | no       | —                   | Comma-separated Linear key prefixes (e.g. `TEAM,PROJ`).                                                         |
| `jira_base_url`     | no       | —                   | Jira instance base URL (used with `jira_email` + `jira_api_token`).                                             |
| `jira_email`        | no       | —                   | Jira authentication email.                                                                                      |
| `jira_api_token`    | no       | —                   | Jira API token.                                                                                                 |
| `jira_keys`         | no       | —                   | Comma-separated Jira key prefixes.                                                                              |
| `slack_token`       | no       | —                   | Slack bot token. Required to post release notifications.                                                        |

## Outputs

| Output         | Description                                     |
| -------------- | ----------------------------------------------- |
| `version`      | Released version number.                        |
| `release-type` | Detected release type from `platform.meta.yml`. |
| `pr-url`       | URL of the created or updated release PR.       |

## Modes

- **`create`** — analyzes commits since the last release tag, bumps the version per conventional-commit rules (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major), regenerates the changelog with ticket details and optional AI summary, and opens a `release-{version}` PR.
- **`publish`** — runs after the release PR is merged. Tags the merge commit, publishes artifacts based on `platform.meta.yml`, creates a GitHub Release, and (for action repos) updates the floating major tag (e.g. `v1`).

## `platform.meta.yml`

Release behavior is driven by the `release:` field. The fallback chain for the version source is `version` file → `package.json` → `plugin.json` → `pyproject.toml`.

| Value            | Version source   | NPM publish | GitHub Release | Major version tag (`v1`) |
| ---------------- | ---------------- | ----------- | -------------- | ------------------------ |
| `lib-nodejs`     | `package.json`   | Yes         | Yes            | No                       |
| `lib-bun`        | `package.json`   | Yes         | Yes            | No                       |
| `lib-python`     | `pyproject.toml` | No          | Yes            | No                       |
| `service-nodejs` | `package.json`   | No          | Yes            | No                       |
| `service-python` | `pyproject.toml` | No          | Yes            | No                       |
| `github-action`  | `package.json`   | No          | Yes            | Yes                      |
| `claude-plugin`  | `plugin.json`    | No          | Yes            | No                       |

Minimal `platform.meta.yml`:

```yaml
release: lib-nodejs
```

The `.release_bot` working directory is added to `.gitignore` automatically on the first run.

## Ticket integration

Extract ticket IDs from PR titles and commit messages, then fetch details via API and embed them in the changelog.

| System        | Pattern    | Environment variables                           |
| ------------- | ---------- | ----------------------------------------------- |
| Linear        | `TEAM-123` | `LINEAR_API_KEY`                                |
| Jira          | `PROJ-456` | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| GitHub Issues | `#123`     | `GH_TOKEN`                                      |

Optional key filtering via `LINEAR_KEYS` / `JIRA_KEYS` (e.g. `TEAM,PROJ`). When multiple ticket systems are configured, prefix keys are required so the action can route each ticket to the right system.

## Slack notifications

Add `slack.release` to `platform.meta.yml`:

```yaml
slack:
  release: "#your-channel"
```

Then pass `slack_token` to the publish workflow. The bot token needs the `chat:write` scope. The notification includes the version, the AI-generated release notes (when present), and a link to the GitHub release.

## Permissions

The `github_token` input is **required**. The workflow's default `GITHUB_TOKEN` is not supported, because creating pull requests with it can fail with an opaque 403 (`GitHub Actions is not permitted to create or approve pull requests`) whenever the repo or its org disables **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**.

Pass one of:

- A **classic Personal Access Token** with the `repo` scope.
- A **fine-grained Personal Access Token** scoped to the repo with `Contents: Read and write` and `Pull requests: Read and write`.
- A **GitHub App installation token** with the same `contents: write` + `pull-requests: write` permissions. (App tokens are not subject to the workflow-permissions toggle above — that toggle gates `GITHUB_TOKEN` only.)

Store the token as a secret (e.g. `GH_TOKEN`) and pass it via `github_token: ${{ secrets.GH_TOKEN }}`.

The Configure Git step inside the action commits as `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`.

## Versioning

Reference the action by tag, for example:

```yaml
uses: awinogradov/code-assistants/.github/actions/release-action@v1
```
