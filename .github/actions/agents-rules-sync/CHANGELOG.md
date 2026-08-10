# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [3.0.0](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v2.1.1...agents-rules-sync-action@v3.0.0) (2026-08-10)

## Release Notes

`AGENTS.md` is now the canonical rules file, with `CLAUDE.md` published as a Git symlink pointing to it — reversing the previous layout in a breaking change that requires a one-time workflow update before your next sync run.

## ✨ What's New

### `AGENTS.md` as the Canonical Rules File

The agent rules body now lands in `AGENTS.md`, which is the filename the broader agent ecosystem (Codex, Gemini CLI, and others) reads by convention. `CLAUDE.md` continues to be published alongside it, but now as a Git symlink (mode `120000`) that points at `AGENTS.md` rather than holding its own copy of the content. Both files are committed together in a single PR on every sync run — there is no configuration needed to enable this; it happens unconditionally.

<details><summary>Related issues</summary>

- [#558: Make AGENTS.md the canonical rules file and CLAUDE.md a symlink to it](https://github.com/awinogradov/code-assistants/issues/558)
- [#559: Publish agent rules to AGENTS.md with CLAUDE.md as a symlink](https://github.com/awinogradov/code-assistants/pull/559)
</details>

## 🐛 Bug Fixes

### Symlink Destination No Longer Blocks Content Sync

Previously, if `CLAUDE.md` existed in the repository as a symlink, the `files-sync` layer would skip the paired content entry for `AGENTS.md`, leaving the two files in an inconsistent state with no regular file holding the actual rules. This is now resolved: content entries whose destination is currently a symlink are detected and rewritten correctly, so both files always end up in the expected state after a sync run.

## ⚠️ Breaking Changes

### Rules File Layout Reversed — `agents-md` Input Removed

The previous layout placed the rules body in `CLAUDE.md` and treated `AGENTS.md` as optional or secondary. That is now inverted: `AGENTS.md` carries the content and `CLAUDE.md` becomes a symlink.

The `agents-md` input has been removed entirely. Because both files are now published unconditionally on every run, the input no longer has a meaningful role.

**What breaks if you do nothing:** your workflow will fail on the unknown `agents-md` input if it is still present, and the first sync run will rewrite both files in one PR — which is expected and safe, but should be reviewed before merging.

**Migration steps:**

1. Open your sync workflow file (typically `.github/workflows/sync-agents-rules.yml` or similar).
2. Remove any `agents-md:` line from the `with:` block of the `agents-rules-sync` step.
3. Bump the action ref to `v3`:
   ```yaml
   # Before
   - uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v2
     with:
       bot_token: ${{ secrets.BOT_TOKEN }}
       agents-md: true          # ← remove this line

   # After
   - uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v3
     with:
       bot_token: ${{ secrets.BOT_TOKEN }}
   ```
4. Trigger a manual sync run (`workflow_dispatch`). It will open a single PR rewriting both `AGENTS.md` (rules body) and `CLAUDE.md` (symlink). Review and merge that PR to complete the migration.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #558 | [#559](https://github.com/awinogradov/code-assistants/pull/559) | @awinogradov |

### ⚠ BREAKING CHANGES

* **agents-rules-sync:** the rules body now lands in AGENTS.md and CLAUDE.md becomes a
symlink to it, reversing the previous layout. The agents-md input is removed;
both files are published unconditionally, so remove any agents-md value from
your workflow. The first run after upgrading rewrites both files in one PR.

### Features

* **agents-rules-sync:** sync rules to agents.md ([c047b5e](https://github.com/awinogradov/code-assistants/commit/c047b5e584fc0dee23651f0d13acf56cc4dca2e8))
## [2.1.1](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v2.1.0...agents-rules-sync-action@v2.1.1) (2026-07-13)

## Release Notes

The upstream sync action now retries automatically when GitHub returns a transient server error, instead of failing the entire run on a momentary blip.

## 🐛 Bug Fixes

### Resilient Retry on GitHub Server Errors

Previously, a single transient GitHub 5xx response during the upstream sync would fail the workflow run immediately, often dumping a raw HTML error page into the job annotation with no useful context. The sync now automatically retries these transient failures, and if a request ultimately does not succeed, the error report includes the HTTP status code and a short excerpt rather than a full HTML page — making it much easier to understand what went wrong at a glance.


### Bug Fixes

* **actions-core:** retry transient github 5xx in sync ([63e8289](https://github.com/awinogradov/code-assistants/commit/63e82892eea86fd76b9e437466cf6bf6e420da68))
## [2.1.0](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v2.0.2...agents-rules-sync-action@v2.1.0) (2026-06-29)

## Release Notes

Repositories with multiple Linear teams can now declare all of them in a single `agents.trackers` array, with automatic routing by issue key prefix.

## ✨ What's New

### Multi-Team Linear Tracker Support

Consumer repositories that span more than one Linear team no longer need to pick just one. The `agents.trackers` array now accepts multiple Linear tracker entries side by side, and issues are automatically routed to the correct team based on their key prefix (e.g. `ARCH-` vs `ENG-`). When an AI agent creates or lists Linear issues and more than one Linear tracker is configured, it will prompt to select the appropriate team — keeping work items landing in the right place without manual disambiguation.

The array is validated on sync, and the action will reject configurations with a missing team, duplicate GitHub tracker entries, or colliding key prefixes across Linear teams, catching misconfiguration before it causes routing surprises downstream.

<details><summary>Related issues</summary>

- [#377: Support multiple Linear teams in agents.trackers](https://github.com/awinogradov/code-assistants/issues/377)
- [#378: Support multiple Linear teams in one repository](https://github.com/awinogradov/code-assistants/pull/378)
</details>

## 📋 Protocol & Contract Changes

### `agents.trackers` Array Now Supports Multiple Linear Entries

The `agents.trackers` field in the consumer repository's `package.json` previously supported a single tracker configuration. It now accepts an array with multiple Linear team entries alongside the GitHub entry.

**Before:**
```json
{
  "agents": {
    "rules": "Bun",
    "trackers": [
      { "type": "linear", "team": "ENG" }
    ]
  }
}
```

**After:**
```json
{
  "agents": {
    "rules": "Bun",
    "trackers": [
      { "type": "github" },
      { "type": "linear", "team": "ENG" },
      { "type": "linear", "team": "ARCH" }
    ]
  }
}
```

Validation rules enforced at sync time:
- Each Linear entry must specify a `team`
- Key prefixes across Linear entries must be unique (no two teams sharing the same prefix)
- Only one GitHub tracker entry is permitted

## 📚 Documentation & Settings Updates

### Multiple Linear Teams Documented

The `agents.trackers` configuration reference has been updated to cover the multi-team setup, including how key prefix routing works and the validation constraints the action enforces. Refer to the updated docs in the upstream `awinogradov/code-assistants` repository for full examples.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #377 | [#378](https://github.com/awinogradov/code-assistants/pull/378) | @awinogradov |

### Features

* **agents-rules-sync:** validate agents.trackers array ([72bb572](https://github.com/awinogradov/code-assistants/commit/72bb57228fc86ef2451662aeebb805acff9868f1))

### Documentation

* document multiple linear teams in trackers ([fcdf280](https://github.com/awinogradov/code-assistants/commit/fcdf280efaa6e523d307e1af161dbda4e0e82d4d))

### Tests

* **agents-rules-sync:** cover trackers resolver ([bba67a9](https://github.com/awinogradov/code-assistants/commit/bba67a931df6c49f9ca85b883a166f0f99c098d5))
## [2.0.2](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v2.0.1...agents-rules-sync-action@v2.0.2) (2026-06-13)

## Release Notes

Repository documentation chapters have been reorganized into a numbered book format, making it easier to find the information you need. All links within the service, including error messages and automated release skip notifications, have been updated to point to the correct chapters.

## 📚 Documentation & Settings Updates

### Documentation reorganization into numbered chapters
The service documentation has been restructured into clearly numbered book chapters with an annotated table of contents. This makes it easier to navigate and find specific configuration or integration guidance. All internal service links, including those in error messages and automated notifications, now correctly reference these new chapter numbers.

<details><summary>Related issues</summary>

- [#295: MAINTENANCE: Restructure docs into numbered book chapters](https://github.com/awinogradov/code-assistants/pull/295)
</details>


### Bug Fixes

* renumber docs and update shipped links ([4b77286](https://github.com/awinogradov/code-assistants/commit/4b77286ff4fa59ea51a25ca051e36e6898df4f06))
## [2.0.1](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v2.0.0...agents-rules-sync-action@v2.0.1) (2026-06-04)

## Release Notes

# Release Notes v2.0.1

Critical security updates protect against environment variable injection and fix YAML serialization issues that could corrupt release data.

## 🐛 Bug Fixes

### Fixed critical environment variable injection vulnerability
The release-publish workflow was vulnerable to attacks through PR filenames that could inject malicious environment variables. The workflow now uses the built-in file resolution mechanism instead of writing PR filenames to `$GITHUB_ENV`, completely eliminating this attack vector.

<details><summary>Related issues</summary>

- [#244: MAINTENANCE: Resolve open code-scanning security alerts](https://github.com/awinogradov/code-assistants/pull/244)
</details>

### Fixed YAML serialization for backslashes in PR titles
PR titles containing backslashes could corrupt the YAML output in release notes, potentially breaking downstream automation. The release action now properly escapes backslashes before quotes when serializing PR titles to YAML.

<details><summary>Related issues</summary>

- [#244: MAINTENANCE: Resolve open code-scanning security alerts](https://github.com/awinogradov/code-assistants/pull/244)
</details>

### Fixed incomplete string escaping in error messages
Error messages in the agents-rules-sync action could fail when special characters appeared in validation errors. The action now uses plain substring matching instead of constructed RegExp patterns, avoiding escaping issues entirely.

<details><summary>Related issues</summary>

- [#244: MAINTENANCE: Resolve open code-scanning security alerts](https://github.com/awinogradov/code-assistants/pull/244)
</details>


### Tests

* **agents-rules-sync:** match error by substring ([9e28609](https://github.com/awinogradov/code-assistants/commit/9e28609fd1b65b58bed3c9982617c1e74e6d07d2))
## [2.0.0](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v1.0.0...agents-rules-sync-action@v2.0.0) (2026-05-29)

## Release Notes

Agent rules are now synchronized with consistent bot authentication and easier configuration.

## ⚠️ Breaking Changes

### Action authentication inputs renamed
The `token` and `github_token` inputs have been renamed to `bot_token` for consistency across all actions. You'll need to update your workflow files to use the new input name.

**Before:**
```yaml
- uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v1
  with:
    token: ${{ secrets.GH_TOKEN }}
```

**After:**
```yaml
- uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v2
  with:
    bot_token: ${{ secrets.BOT_TOKEN }}
```

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>

## ✨ What's New

### Customizable sync commit author
You can now configure which bot account creates the sync commits by setting the `bot_username` input. This helps teams identify automated changes and maintain consistent commit attribution across their repositories.

```yaml
- uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v2
  with:
    bot_token: ${{ secrets.BOT_TOKEN }}
    bot_username: ${{ vars.BOT_USERNAME }}  # Optional, defaults to github-actions[bot]
```

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>

## 🐛 Bug Fixes

### Action loading errors resolved
The sync action would fail to load when called from external repositories due to an invalid variable expression in the action's metadata. This has been fixed, ensuring the action loads reliably regardless of where it's called from.

## ⚙️ Configuration Required

### Update workflow secrets
Replace any references to `secrets.GH_TOKEN` with `secrets.BOT_TOKEN` in your workflows. If you want to customize the commit author, also add `vars.BOT_USERNAME` to your repository variables.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #96 | [#103](https://github.com/awinogradov/code-assistants/pull/103) | @awinogradov |

### ⚠ BREAKING CHANGES

* **actions:** inputs token and github_token are renamed to bot_token; consumers must
update with: blocks to pass bot_token (and optional bot_username), and workflows now read
secrets.BOT_TOKEN and vars.BOT_USERNAME instead of secrets.GH_TOKEN.

### Features

* **actions:** rename token inputs to bot_token, add bot_username ([160049b](https://github.com/awinogradov/code-assistants/commit/160049b998131e2e5c503559bf5d8e70e7ea8d5a))

### Bug Fixes

* **actions:** remove vars expr from descriptions ([f5b2c74](https://github.com/awinogradov/code-assistants/commit/f5b2c74aef1561ca8366ed31da938ef6e7bfb514))
## 1.0.0 (2026-05-28)

## Release Notes

The agents-rules-sync action now streamlines synchronization of AI coding assistant rules between repositories, ensuring your development teams work with consistent, stack-specific guidance.

## ✨ What's New

### Stack-aware rules synchronization
Automatically sync the right AI assistant rules (`CLAUDE.md`) based on your project's technology stack. Just declare your stack in `package.json` (e.g., `{ "agents": { "rules": "Bun" } }`), and the action fetches the appropriate rules from the upstream repository. This ensures all your Bun projects get Bun-specific rules, React projects get React rules, and so on.

### Optional AGENTS.md symlink
Enable the `agents-md: true` input to also create an `AGENTS.md` symlink pointing to `CLAUDE.md`. This provides backward compatibility for teams transitioning between different AI assistant conventions while maintaining a single source of truth.

### Automatic change detection
The action intelligently detects when upstream rules have changed and creates a single pull request with all differences. It skips creating PRs when rules are already up-to-date, reducing noise in your repository.

## 🐛 Bug Fixes

### Better error messages for malformed package.json
When the action encounters invalid JSON in your `package.json`, it now provides a helpful error message with a direct link to the documentation explaining the required `agents.rules` field format.

### Clearer permission requirements  
Documentation now accurately states that GitHub App tokens need `contents: write` and `pull-requests: write` permissions at the repository level, not just installation level, preventing authentication failures during setup.

### Improved pull request tracking
The sync branch is now consistently named `sync/agents-rules` (previously used generic names), making it easier to identify and track rule synchronization PRs across your repositories.

### Step summaries with proper formatting
GitHub Actions step summaries now display with correct line breaks and formatting, making it easier to review what the action synchronized during each run.

## ⚠️ Breaking Changes

### Explicit token requirement
You must now provide a `token` input (PAT or GitHub App installation token) when using either `files-sync` or `agents-rules-sync` actions. The workflow's default `GITHUB_TOKEN` is no longer accepted due to GitHub's limitation preventing workflow tokens from creating PRs that trigger other workflows.

**Migration steps:**
1. Create a Personal Access Token or GitHub App with `contents: write` and `pull-requests: write` permissions
2. Add the token as a repository secret (e.g., `SYNC_PAT`)
3. Update your workflow to pass the token:
   ```yaml
   - uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v1
     with:
       token: ${{ secrets.SYNC_PAT }}
   ```

If you're currently using a pinned version tag, you can continue using it without changes until you're ready to upgrade.


### ⚠ BREAKING CHANGES

* **sync:** Consumers must now pass an explicit `token` input (PAT or GitHub App installation token) to both files-sync and agents-rules-sync. Pinning to an existing tag retains the old default behavior until upgrade.

### Features

* **agents-rules-sync:** add agents-md input for agents.md symlink ([68673cc](https://github.com/awinogradov/code-assistants/commit/68673ccf90e098a7182f30f473773cef55cb994e))
* **agents-rules-sync:** add composite action to sync rules to claude.md ([e5f7b35](https://github.com/awinogradov/code-assistants/commit/e5f7b359784bd22ce2cc801ed7a78047c3353950))
* **sync:** require explicit token input on sync actions ([f95876f](https://github.com/awinogradov/code-assistants/commit/f95876f5f522a60cf3a65d977088796a4028f341))

### Bug Fixes

* **agents-rules-sync:** include docs link in malformed-json error ([15a63ea](https://github.com/awinogradov/code-assistants/commit/15a63eac9b26a305b10f6ed7bc82509e98996e4f))
* **sync:** correct app token permissions claim ([b26f011](https://github.com/awinogradov/code-assistants/commit/b26f0118d7f13c0d16c2c8c919ade5002383f960))
* **sync:** rename branch and add step summary ([572716e](https://github.com/awinogradov/code-assistants/commit/572716e3bce0bbdd12ea7f9e90291f18980e8548))
* **sync:** render step summary with line breaks ([1c9ba10](https://github.com/awinogradov/code-assistants/commit/1c9ba10342f6b9b3b3455d170c3d04529685b986))

### Documentation

* document agents-md input and sync flow ([e3a6f44](https://github.com/awinogradov/code-assistants/commit/e3a6f44d8521c7f345ccb3dfb736d2434705938b))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### Refactoring

* move actions-lib to packages/actions-core ([14798cd](https://github.com/awinogradov/code-assistants/commit/14798cdda4cfc9bd10547b06b9133eda623c9b9a))

### Tests

* cover symlink entries and the entry-builder helper ([306d052](https://github.com/awinogradov/code-assistants/commit/306d052403f8b737446da6f98fbf58f18c3aaea9))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
