# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## 0.2.0 (2026-06-13)

## Release Notes

Performance reporting now available for your builds with automatic PR comments showing bundle size and Lighthouse metric changes.

## ✨ What's New

### Performance Report Action
A new GitHub Action automatically tracks your app's performance health on every pull request. After building your target, it measures bundle sizes (raw, gzip, and brotli) plus key Lighthouse metrics like Performance score, Accessibility, and Core Web Vitals. The action compares these against your main branch baseline and posts a sticky comment on the PR showing what changed. This helps your team catch performance regressions before they reach production without adding friction — the action never fails your build, just provides visibility.

<details><summary>Related issues</summary>

- [#64: Add perf-report composite action and adopt it in symbiot](https://github.com/awinogradov/code-assistants/issues/64)
</details>

## 🐛 Bug Fixes

### CLS Delta Display
Small layout shift changes now display correctly as "≈ 0" instead of showing confusing tiny decimal values. This makes the performance report cleaner and focuses attention on meaningful changes rather than measurement noise.

## ⚙️ Configuration Required

### GitHub Workflow Setup
To use the performance reporting in your project, update your GitHub workflow with the action configuration. You'll need to specify your build command, bundle output location, and optionally any bundle analysis commands. The action requires permissions for reading contents and actions, plus writing pull request comments.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #64 | [#301](https://github.com/awinogradov/code-assistants/pull/301) | @awinogradov |

### Features

* **perf-report:** add sticky perf comment action ([2941670](https://github.com/awinogradov/code-assistants/commit/2941670fdaec91bd99592bcc3d41794c1f22d055))

### Bug Fixes

* **perf-report:** render in-band cls delta as ≈ 0 ([e66dcad](https://github.com/awinogradov/code-assistants/commit/e66dcad0315295f44666c2540b90f7c0e96ae746))
