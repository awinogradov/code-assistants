# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## 1.0.0 (2026-08-10)

## Release Notes

`agents-skills-sync` v1.0.0 is the initial release of the action, bringing portable autopilot skill syncing to Codex, Kimi, and any other SKILL.md-compatible CLI — alongside breaking renames that require immediate attention if you're migrating from a pre-release setup.

## ✨ What's New

### Portable Skills Sync Action

The autopilot skills, previously available only through Claude-specific paths, are now synced to a vendor-neutral `.agents/skills/` directory that Codex, Kimi, and any other SKILL.md-compatible CLI can read. The new `agents-skills-sync` action handles this automatically: it reads the canonical skills tree from the upstream repository via the Git Trees API and opens a single idempotent PR in your repo whenever something changes. When nothing has changed, no PR is created and the existing sync branch is left alone.

The action composes with [`files-sync`](https://github.com/awinogradov/code-assistants/tree/main/.github/actions/files-sync) in the same pattern used by [`agents-rules-sync`](https://github.com/awinogradov/code-assistants/tree/main/.github/actions/agents-rules-sync) — resolve, diff, PR — so teams already familiar with rules syncing will find the workflow identical.

<details><summary>Related issues</summary>

- [#561: Make autopilot skills and agents usable from Codex, Kimi, and other CLIs](https://github.com/awinogradov/code-assistants/issues/561)
</details>

### Single Canonical Skill Source

The plugin's own `claude-plugins/autopilot/skills/` directory, as defined in [RFC-0002](https://github.com/awinogradov/code-assistants/blob/main/rfc/0002-portable-skills-layout.md), is now the one portable layout shared by all CLIs. The previously maintained generated `agent-skills/` export pipeline has been removed — the plugin directory is synced verbatim with no content transformation, so what Claude sees and what Codex or Kimi see is identical.

<details><summary>Related issues</summary>

- [#563: Converge skill sources so Claude and other CLIs share one layout](https://github.com/awinogradov/code-assistants/issues/563)
</details>

## ⚙️ Configuration Required

### Workflow Setup

Add a workflow to your repository to run the sync on a schedule or on demand. The only required input is `bot_token` — a PAT or GitHub App installation token with permission to open pull requests (the default `GITHUB_TOKEN` cannot do this).

```yaml
name: Sync agent skills
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: awinogradov/code-assistants/.github/actions/agents-skills-sync@main
        with:
          bot_token: ${{ secrets.BOT_TOKEN }}
          bot_username: ${{ vars.BOT_USERNAME }}
```

`source-repo` defaults to `awinogradov/code-assistants` and `source-ref` defaults to the source repo's default branch. Both can be pinned if you need a specific snapshot.

## ⚠️ Breaking Changes

### Skill Directory Paths Renamed to Dash-Only

Skill directories that previously used colon separators (e.g. `skills/pr:review/`) have been renamed to use dashes only (e.g. `skills/pr-review/`). Slash commands used inside Claude are unchanged, but any external tooling, documentation links, or scripts that reference the old colon-style paths must be updated to the new dash-style equivalents.

<details><summary>Related issues</summary>

- [#563: Converge skill sources so Claude and other CLIs share one layout](https://github.com/awinogradov/code-assistants/issues/563)
</details>

### Previously Synced `autopilot-*` Directories Require Manual Cleanup

Earlier pre-release versions of the action synced skills into prefixed `autopilot-*` directories inside `.agents/skills/`. The action now syncs to unprefixed paths (e.g. `.agents/skills/pr-review/` instead of `.agents/skills/autopilot-pr-review/`). The old prefixed directories are not automatically removed — you must delete them manually from any repository that ran a pre-release version of the sync. Leaving them in place will result in duplicate skill definitions being visible to CLIs.

**Migration steps:**
1. In each target repository, delete any `.agents/skills/autopilot-*` directories.
2. Commit and push the removal directly or as part of the next sync PR.
3. Trigger the sync workflow (manually or wait for the next scheduled run) to populate the new unprefixed paths.

<details><summary>Related issues</summary>

- [#563: Converge skill sources so Claude and other CLIs share one layout](https://github.com/awinogradov/code-assistants/issues/563)
</details>

### Generated `agent-skills/` Export Pipeline Removed

The separately generated `agent-skills/` directory and its export pipeline no longer exist. Any references to that path in downstream tooling or documentation should be updated to point to `.agents/skills/` instead.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #563 | [#564](https://github.com/awinogradov/code-assistants/pull/564) | @awinogradov |
| #561 | [#562](https://github.com/awinogradov/code-assistants/pull/562) | @awinogradov |

### ⚠ BREAKING CHANGES

* **agents-skills-sync:** sync skills from plugin source

### Features

* **agents-skills-sync:** add skills sync action ([be57cb5](https://github.com/awinogradov/code-assistants/commit/be57cb5868f9c97feae81c60ef427afaa198ad84))
* **agents-skills-sync:** sync skills from plugin source ([ad0b23c](https://github.com/awinogradov/code-assistants/commit/ad0b23cc4f6f7c0fa95fc048894e71f4a2a2852d))
