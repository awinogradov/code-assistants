# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [2.0.0](https://github.com/awinogradov/code-assistants/compare/files-sync-action@v1.0.0...files-sync-action@v2.0.0) (2026-05-29)

## Release Notes

Major changes to authentication and configuration for smoother deployment

## ⚠️ Breaking Changes

### Authentication inputs renamed
The action's authentication configuration has been standardized. Your workflow files must be updated to use the new input names. The `token` and `github_token` inputs are now consolidated into `bot_token`.

**Migration steps:**
1. In your workflow files, find all uses of this action
2. Update the `with:` section to use `bot_token` instead of `token` or `github_token`
3. Update your secrets references from `secrets.GH_TOKEN` to `secrets.BOT_TOKEN`

**Before:**
```yaml
- uses: awinogradov/code-assistants/.github/actions/files-sync@v1
  with:
    token: ${{ secrets.GH_TOKEN }}
```

**After:**
```yaml
- uses: awinogradov/code-assistants/.github/actions/files-sync@v2
  with:
    bot_token: ${{ secrets.BOT_TOKEN }}
```

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>

## ✨ What's New

### Customizable bot username
You can now configure which bot user appears as the author of sync commits. This helps teams identify automated changes more clearly in their commit history. The new `bot_username` input accepts any valid GitHub username and defaults to `github-actions[bot]` if not specified.

To use a custom bot account, add the `bot_username` input to your workflow:
```yaml
- uses: awinogradov/code-assistants/.github/actions/files-sync@v2
  with:
    bot_token: ${{ secrets.BOT_TOKEN }}
    bot_username: ${{ vars.BOT_USERNAME }}
```

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>

## 🐛 Bug Fixes

### Bot email generation
The action now correctly generates the bot's email address by querying the GitHub API for the user ID, ensuring commits have properly formatted noreply email addresses that GitHub recognizes.

### Action loading errors
Composite actions were failing to load due to invalid variable expressions in their input descriptions. The action now loads correctly without errors during workflow initialization.


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

* **actions:** derive bot uid from github api for noreply email ([cd9b047](https://github.com/awinogradov/code-assistants/commit/cd9b0475830816e1be8f5e5d62362acf289d166e))
* **actions:** remove vars expr from descriptions ([f5b2c74](https://github.com/awinogradov/code-assistants/commit/f5b2c74aef1561ca8366ed31da938ef6e7bfb514))
## 1.0.0 (2026-05-28)

## Release Notes

Version 1.0.0 brings file syncing automation to GitHub repositories, helping teams keep consistent documentation and configuration across multiple projects.

## ✨ What's New

### Automated File Synchronization
Keep files synchronized across your GitHub repositories without manual copying. The files-sync action pulls specified files from source repositories and automatically creates pull requests with any differences, perfect for maintaining consistent documentation, configuration, or build rules across your organization.

### Symlink Support
Create Git symlinks instead of copying files when you need references rather than duplicates. This is particularly useful for maintaining single sources of truth while still making files appear in multiple locations.

### Simplified AI Assistant Rules Management
The new agents-rules-sync action specializes in keeping AI assistant configuration (like Claude prompt files) synchronized across repositories. Teams can maintain centralized AI behavior rules that automatically propagate to all projects.

### GitHub Actions Workflow Summaries
Every sync run now generates a detailed summary visible in the GitHub Actions UI, showing exactly which files were synchronized, what changed, and the resulting pull request details.

## ⚠️ Breaking Changes

### Explicit Authentication Token Required
Both files-sync and agents-rules-sync actions now require an explicit `token` input parameter. The default GitHub Actions token is no longer supported due to permission limitations.

**Migration steps:**
1. Create a Personal Access Token (PAT) or configure a GitHub App installation token with `contents: write` and `pull-requests: write` permissions
2. Add the token to your repository secrets (e.g., as `SYNC_PAT`)
3. Update your workflow files to pass the token:
   ```yaml
   - uses: awinogradov/code-assistants/.github/actions/files-sync@v1
     with:
       token: ${{ secrets.SYNC_PAT }}  # Now required
       files: |
         ...
   ```

Note: Workflows pinned to existing tags will continue working with the old behavior until upgraded.

## 📋 Protocol & Contract Changes

### New Action Scope
The action has moved from the `@autopilot` namespace to `@code-assistants`. Update your workflow references:

**Before:**
```yaml
uses: awinogradov/autopilot/.github/actions/files-sync@v0.x
```

**After:**
```yaml
uses: awinogradov/code-assistants/.github/actions/files-sync@v1
```

## ⚙️ Configuration Required

### Personal Access Token or GitHub App Token
A token with elevated permissions is now mandatory for the sync actions to work across repositories.

**What it does:** Enables the action to read files from source repositories and create pull requests in the destination repository.

**Why it's needed:** GitHub's default workflow token has limited cross-repository permissions that prevent file synchronization.

**Required permissions:** `contents: write` and `pull-requests: write` on destination repositories.


### ⚠ BREAKING CHANGES

* **sync:** Consumers must now pass an explicit `token` input (PAT or GitHub App installation token) to both files-sync and agents-rules-sync. Pinning to an existing tag retains the old default behavior until upgrade.

### Features

* **agents-rules-sync:** add composite action to sync rules to claude.md ([e5f7b35](https://github.com/awinogradov/code-assistants/commit/e5f7b359784bd22ce2cc801ed7a78047c3353950))
* **files-sync:** add composite action with turborepo monorepo setup ([26e9647](https://github.com/awinogradov/code-assistants/commit/26e9647fd40428b91f0d4f60c9b53e54250216dd))
* **files-sync:** support symlink entries in sync payload ([260bfc9](https://github.com/awinogradov/code-assistants/commit/260bfc908f2259775dfae13e727b3d80faeed0f4))
* **sync:** require explicit token input on sync actions ([f95876f](https://github.com/awinogradov/code-assistants/commit/f95876f5f522a60cf3a65d977088796a4028f341))

### Bug Fixes

* **files-sync:** preserve modes, harden fetch, pin setup-bun ([ac6334a](https://github.com/awinogradov/code-assistants/commit/ac6334a47af887746ebe0dc287c891fc4947285d))
* **files-sync:** throw on truncated source tree response ([9b50e98](https://github.com/awinogradov/code-assistants/commit/9b50e988cc4d06c85a21310a0a9a9e92c8ef5717))
* **files-sync:** walk dest non-recursively, relax content schema ([9c5098c](https://github.com/awinogradov/code-assistants/commit/9c5098ce7c2c9d4aacff7a54e949a4a4b35ece55))
* **sync:** correct app token permissions claim ([b26f011](https://github.com/awinogradov/code-assistants/commit/b26f0118d7f13c0d16c2c8c919ade5002383f960))
* **sync:** rename branch and add step summary ([572716e](https://github.com/awinogradov/code-assistants/commit/572716e3bce0bbdd12ea7f9e90291f18980e8548))
* **sync:** render step summary with line breaks ([1c9ba10](https://github.com/awinogradov/code-assistants/commit/1c9ba10342f6b9b3b3455d170c3d04529685b986))

### Documentation

* document agents-md input and sync flow ([e3a6f44](https://github.com/awinogradov/code-assistants/commit/e3a6f44d8521c7f345ccb3dfb736d2434705938b))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **deps:** pin @types/bun to exact version 1.3.14 ([fd9aaef](https://github.com/awinogradov/code-assistants/commit/fd9aaefbb3cd6b4d97edad556a4d0f8afc70f94c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### Refactoring

* **files-sync:** rename [@autopilot](https://github.com/autopilot) scope to [@code-assistants](https://github.com/code-assistants) ([b4ad5e8](https://github.com/awinogradov/code-assistants/commit/b4ad5e804c900e1e8ece5f981d152951e35662af))
* move actions-lib to packages/actions-core ([14798cd](https://github.com/awinogradov/code-assistants/commit/14798cdda4cfc9bd10547b06b9133eda623c9b9a))

### Tests

* cover symlink entries and the entry-builder helper ([306d052](https://github.com/awinogradov/code-assistants/commit/306d052403f8b737446da6f98fbf58f18c3aaea9))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
