# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

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
