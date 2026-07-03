# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [0.2.3](https://github.com/awinogradov/code-assistants/compare/validate-actions-action@v0.2.2...validate-actions-action@v0.2.3) (2026-07-03)

## Release Notes

`actions/checkout` is updated to v7, which blocks checkout of fork PRs in `pull_request_target` and `workflow_run` triggers — a security hardening change that affects how this action behaves in repositories using those triggers.

## ✨ What's New

### Hardened Fork PR Checkout Security

The `actions/checkout` dependency used internally by this action has been updated from v6 to v7. The most significant change in v7 is that it now blocks checking out pull requests from forks when the workflow is triggered via `pull_request_target` or `workflow_run` events. This is a security improvement that prevents a class of privilege-escalation attacks where untrusted fork code could be executed in a context with elevated permissions.

For the `validate-actions` action itself — which uses a `pull_request` trigger and `contents: read` permissions — this change has no functional impact on normal operation. However, if your repository wraps or re-uses this action in workflows with `pull_request_target` or `workflow_run` triggers, be aware that checkout of fork PRs in those contexts will now fail by design.

<details><summary>Related issues</summary>

- [#419: ci(deps): bump the github-actions group across 6 directories with 4 updates](https://github.com/awinogradov/code-assistants/pull/419)
</details>


### CI

* **deps:** bump the github-actions group across 6 directories with 4 updates ([ea89dd2](https://github.com/awinogradov/code-assistants/commit/ea89dd248da6da72d90d1cfcaa36e2b415f356ee))
## [0.2.2](https://github.com/awinogradov/code-assistants/compare/validate-actions-action@v0.2.1...validate-actions-action@v0.2.2) (2026-06-15)

## Release Notes

Documentation now renders with GitHub's native alert styling for better visual consistency.

## 📚 Documentation & Settings Updates

### GitHub alert syntax for callouts
All documentation callouts now use GitHub's native alert syntax instead of HTML/Markdown formatting. This provides consistent styling across the codebase with GitHub's built-in tip, note, warning, and caution styles. The change affects contributing guides, documentation pages, and action READMEs throughout the project.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #315 | [#316](https://github.com/awinogradov/code-assistants/pull/316) | @awinogradov |

### Documentation

* adopt github alert syntax for callouts ([151e57b](https://github.com/awinogradov/code-assistants/commit/151e57bd2694b5df626833d3243cdded6f77eef9))
## [0.2.1](https://github.com/awinogradov/code-assistants/compare/validate-actions-action@v0.2.0...validate-actions-action@v0.2.1) (2026-06-08)

## Release Notes

The validate-actions workflow can now be automatically distributed to all consumer repositories through the contributing-sync mechanism, ensuring consistent GitHub Actions linting across your entire organization.

## ✨ What's New

### Automatic distribution of validate-actions workflow
Consumer repositories now automatically receive the validate-actions workflow through contributing-sync, just like the licenses and auto-label workflows. This means every repository in your organization will run the same GitHub Actions linting checks on pull requests without needing to manually copy or maintain the workflow. The workflow validates both GitHub workflow files and composite action manifests for syntax errors and shell script issues before they can be merged.

<details><summary>Related issues</summary>

- [#271: Distribute the validate-actions workflow to consumers via contributing-sync](https://github.com/awinogradov/code-assistants/issues/271)
</details>

## 📚 Documentation & Settings Updates

### Contributing-sync configuration expanded
The contributing-sync mechanism now includes `.github/workflows/validate-actions.yml` in its synced file set. This workflow file is distributed with a header marking it as managed by upstream-sync, preventing accidental local modifications. Documentation has been updated in the contributing-sync README, validate-actions versioning notes, and the upstream-sync guide to reflect this new synchronized file.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #271 | [#273](https://github.com/awinogradov/code-assistants/pull/273) | @awinogradov |

### CI

* **contributing-sync:** distribute validate-actions workflow ([eea10e1](https://github.com/awinogradov/code-assistants/commit/eea10e1f2a7390228f58bffcbc8facd46277fac9))
## 0.2.0 (2026-06-04)

## Release Notes

The new validate-actions action automatically checks GitHub Actions files in pull requests, catching syntax errors and shell script issues before they break your CI/CD pipelines.

## ✨ What's New

### GitHub Actions validation on pull requests
Teams using GitHub Actions can now automatically validate their workflow files and composite actions whenever changes are proposed. The action runs `actionlint` on workflow files and `shellcheck` on embedded shell scripts, ensuring your automation scripts follow best practices and won't fail due to syntax errors. This fail-fast validation only checks files modified in the pull request, so existing issues elsewhere won't block unrelated work.

<details><summary>Related issues</summary>

- [#247: Add an action and workflow to lint GitHub Actions and workflow files](https://github.com/awinogradov/code-assistants/issues/247)
- [#253: Add an action to lint GitHub Actions workflows and composite-action shell](https://github.com/awinogradov/code-assistants/pull/253)
</details>

## 🐛 Bug Fixes

### Better error diagnostics for linting failures
When the validation process encounters an unexpected error (like a missing file or permission issue), you'll now see the specific error type in the output, making it easier to diagnose and fix configuration problems.

## ⚙️ Configuration Required

### actionlint version selection
You can specify which version of actionlint to use by setting the `actionlint-version` input in your workflow. If not specified, version 1.7.11 is used by default. The action automatically verifies the download against published checksums for security.

## 📚 Documentation & Settings Updates

### Complete setup guide for validate-actions
The action now includes comprehensive documentation covering installation, configuration options, and example workflows. The docs explain how to set up the validation workflow, what permissions are required (only `contents: read`), and how the action determines which files to check based on pull request changes.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #247 | [#253](https://github.com/awinogradov/code-assistants/pull/253) | @awinogradov |

### Features

* **validate-actions:** add action to lint workflow and action shell ([5c6bacd](https://github.com/awinogradov/code-assistants/commit/5c6bacdc16ca951f0cbc5e877325bc8ec1cf6d71))

### Bug Fixes

* **validate-actions:** include error class in process failure detail ([42e9d01](https://github.com/awinogradov/code-assistants/commit/42e9d01c38e23534948ab2fcf5ce646296389f57))

### Documentation

* **validate-actions:** document the linter action ([5f13ee9](https://github.com/awinogradov/code-assistants/commit/5f13ee9796d915d2b06516b49d48c43f252274eb))

### Tests

* **validate-actions:** cover orchestrator and malformed-manifest paths ([d20a6ef](https://github.com/awinogradov/code-assistants/commit/d20a6ef80caca782eb6255940bce5d999a462c68))
