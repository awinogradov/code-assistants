# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [2.0.0](https://github.com/awinogradov/code-assistants/compare/agents-rules-sync-action@v1.0.0...agents-rules-sync-action@v2.0.0) (2026-05-29)

## Release Notes

The agents-rules-sync action now uses standardized authentication inputs, making it easier to configure bot credentials across your automation workflows.

## ⚠️ Breaking Changes

### Action authentication inputs renamed
The authentication inputs have been renamed for consistency. You'll need to update your workflow files to use `bot_token` instead of the previous `token` or `github_token` inputs.

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

If your workflows reference `secrets.GH_TOKEN`, update them to use `secrets.BOT_TOKEN`.

## ✨ What's New

### Customizable bot identity
You can now specify which bot user creates the sync commits by providing a `bot_username` input. This is particularly useful if you have a dedicated bot account for automation or want commits to appear under a specific user.

```yaml
- uses: awinogradov/code-assistants/.github/actions/agents-rules-sync@v2
  with:
    bot_token: ${{ secrets.BOT_TOKEN }}
    bot_username: ${{ vars.BOT_USERNAME }}
```

If you don't provide this input, commits will continue to use the default `github-actions[bot]` identity.

<details><summary>Related issues</summary>

- [#96: Standardize actions on bot_token and bot_username](https://github.com/awinogradov/code-assistants/issues/96)
</details>

## 🐛 Bug Fixes

### Action loading errors resolved
The action will no longer fail to load when called from external repositories. A configuration issue that referenced GitHub variables in the action metadata has been corrected.


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
