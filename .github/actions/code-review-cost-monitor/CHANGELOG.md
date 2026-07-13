# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [0.2.2](https://github.com/awinogradov/code-assistants/compare/code-review-cost-monitor-action@v0.2.1...code-review-cost-monitor-action@v0.2.2) (2026-07-13)

## Release Notes

The cost monitor now uses the same retrying GitHub client as the rest of the system, so retry behavior is consistent and maintained in one place.

## 🐛 Bug Fixes

### Unified GitHub Client in Cost Monitor

Previously, the cost monitor maintained its own separate GitHub API client, meaning the retry policy (how the action handles rate limits and transient API errors) was duplicated and could drift out of sync with the shared client used elsewhere. The monitor now uses the single shared retrying Octokit client, so all GitHub API calls across the action suite behave consistently — no separate copy to maintain or misconfigure.

<details><summary>Related issues</summary>

- [#454: Dedupe the retrying Octokit factory in code-review-cost-monitor](https://github.com/awinogradov/code-assistants/issues/454)
- [#455: Dedupe the retrying Octokit client in code-review-cost-monitor](https://github.com/awinogradov/code-assistants/pull/455)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #454 | [#455](https://github.com/awinogradov/code-assistants/pull/455) | @awinogradov |

### Bug Fixes

* reuse the shared octokit client in cost monitor ([387183f](https://github.com/awinogradov/code-assistants/commit/387183fa4cbfce2ddc73d718153001a4eae9b619))
## [0.2.1](https://github.com/awinogradov/code-assistants/compare/code-review-cost-monitor-action@v0.2.0...code-review-cost-monitor-action@v0.2.1) (2026-07-02)

## Release Notes

The review footer no longer ends every AI comment with a repeated usage hint, cleaning up the noise that was skewing the cost monitor's baseline data.

## 🐛 Bug Fixes

### Always-On Usage Hint Removed from Review Footer

Every AI review comment previously ended with a static "ask the reviewer" tip appended directly to the footer — unconditionally, on every run. That text was being picked up as part of the "Review run summary" footer the cost monitor relies on to collect cost, token, and round-trip data. Because the hint appeared on every comment regardless of context, it introduced consistent noise into the footer content and could interfere with the monitor's footer parsing across runs.

The hint no longer appears in the review footer. Usage guidance now surfaces occasionally through the existing rotating review-tip pool (on roughly 5% of comments, never repeated within a PR), which keeps the footer clean and the cost monitor's data collection accurate. Duplicate-review suppression behaviour is unchanged.

<details><summary>Related issues</summary>

- [#389: Show a random tip in 5% of AI review comments, never repeated within a PR](https://github.com/awinogradov/code-assistants/issues/389)
- [#408: HOTFIX: Stop the always-on usage hint tip on AI reviews](https://github.com/awinogradov/code-assistants/pull/408)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #389 | [#408](https://github.com/awinogradov/code-assistants/pull/408) | @awinogradov |

### Bug Fixes

* **code-review-action:** drop always-on usage hint from review footer ([c279ab2](https://github.com/awinogradov/code-assistants/commit/c279ab243134259228e2a72a6809d4d71c08bfd8))
## [0.2.0](https://github.com/awinogradov/code-assistants/compare/code-review-cost-monitor-action@v0.1.0...code-review-cost-monitor-action@v0.2.0) (2026-06-26)

## Release Notes

The cost-monitor's optional attribution step now works correctly when run against a custom Anthropic endpoint, and both the base URL and auth token can be configured to route through a gateway or proxy.

## ✨ What's New

### Custom Anthropic Endpoint Support

The monitor's optional attribution step (which names the change that caused a cost regression) can now be routed through an Anthropic-compatible gateway or proxy instead of hitting the Anthropic API directly. Two new optional inputs cover the common gateway patterns: `anthropic_base_url` sets the target host, and `anthropic_auth_token` handles hosts that expect a bearer token rather than the standard `x-api-key` header. When neither input is set, behaviour is identical to before — this is purely additive.

<details><summary>Related issues</summary>

- [#27: Support a custom Anthropic host (base URL) for SDK-backed actions](https://github.com/awinogradov/code-assistants/issues/27)
- [#326: Support a custom Anthropic host (base URL) for SDK-backed actions](https://github.com/awinogradov/code-assistants/pull/326)
</details>

## 🐛 Bug Fixes

### Attribution Step Now Authenticates Correctly

When the optional attribution analysis was enabled, it was being invoked without passing the authentication token through to the Anthropic SDK, causing it to fail silently or error out. The token is now forwarded correctly, so cost-regression reports that include attribution (the "what changed" analysis) will produce results reliably.

<details><summary>Related issues</summary>

- [#326: Support a custom Anthropic host (base URL) for SDK-backed actions](https://github.com/awinogradov/code-assistants/pull/326)
</details>

## ⚙️ Configuration Required

### `anthropic_base_url` — Custom API Host (Optional)

Points the Anthropic SDK at a gateway, proxy, or compatible endpoint instead of the default Anthropic API. Set this if your organisation routes model calls through an internal gateway or a third-party Anthropic-compatible service. Has no effect when left unset.

### `anthropic_auth_token` — Bearer Token Authentication (Optional)

Supplies a bearer token for hosts that authenticate with `Authorization: Bearer <token>` rather than the standard `x-api-key` header. Only relevant when `anthropic_base_url` is also set and your gateway requires bearer auth. Has no effect when left unset.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #27 | [#326](https://github.com/awinogradov/code-assistants/pull/326) | @awinogradov |

### Features

* support custom anthropic host for sdk ([3f53bde](https://github.com/awinogradov/code-assistants/commit/3f53bde9f8dab8fabfa3f08c30addeac1bd8b097))

### Bug Fixes

* run cost-monitor attribution with auth token ([ce9cdd4](https://github.com/awinogradov/code-assistants/commit/ce9cdd43b34028912ee412b02c2c236cf47eb0c7))

### Documentation

* document anthropic base-url and auth inputs ([f902894](https://github.com/awinogradov/code-assistants/commit/f902894ab4c791545b720152ee8d730485584b4a))
## 0.1.0 (2026-06-13)

## Release Notes

Initial release of the code review cost monitor — a scheduled action that automatically detects and reports when your AI code review costs increase unexpectedly.

## ✨ What's New

### Automated Cost Regression Monitoring
Your repository can now track code review costs over time and automatically open a GitHub issue when costs spike. The monitor analyzes cost data from review comments (no extra instrumentation needed) and uses smart thresholds to avoid false alarms from normal PR-to-PR variation. It watches for sustained increases, efficiency drops, and catastrophic single runs.

<details><summary>Related issues</summary>

- [#287: Reduce AI code-review cost driven up ~2.4x by checklist expansion](https://github.com/awinogradov/code-assistants/issues/287)
- [#288: Add an action that auto-reports code-review cost regressions as a GitHub issue](https://github.com/awinogradov/code-assistants/issues/288)
</details>

### Cost Report Issue Notifications
When the monitor detects a cost regression, it creates or updates a single deduplicated GitHub issue with detailed cost tables and trend analysis. The workflow run page now shows a direct link to this report issue, making it easy to investigate cost spikes right from your Actions tab.

<details><summary>Related issues</summary>

- [#300: Code review cost regression report](https://github.com/awinogradov/code-assistants/issues/300)
</details>

### Optional Root Cause Analysis
Enable the `attribution` input to get AI-powered analysis of what changed to drive costs up. When a cost breach occurs, the monitor can identify the specific process changes or configuration updates that likely caused the increase, making issues immediately actionable.

## 🐛 Bug Fixes

### Resilient Footer Parsing
The monitor no longer fails when review comment footers change format or when your repository has limited review history. Cost metrics are now stored in machine-readable data comments alongside the visible footer, ensuring monitoring continues working even as the footer layout evolves.

<details><summary>Related issues</summary>

- [#305: Cost-monitor can't distinguish footer drift from insufficient footer history](https://github.com/awinogradov/code-assistants/issues/305)
</details>

## ⚙️ Configuration Required

### Default Thresholds
The monitor works out-of-the-box with sensible defaults: $1.50 per-run ceiling, 25% increase threshold, 14-run comparison windows. These values come from real cost analysis where a process regression doubled output tokens while normal per-PR costs ranged $0.17–$1.54.

### Optional Attribution Analysis
To enable root cause analysis when costs breach, set `attribution: true` in your workflow. This requires an Anthropic API key in your `ANTHROPIC_API_KEY` secret. Without this, the monitor still detects and reports regressions but won't analyze what caused them.

### Upstream Sync Integration
If you're using the code-review upstream sync, the cost monitor workflow (`code-review-cost-monitor.yml`) is now included automatically. Downstream repositories need only the existing `BOT_TOKEN` secret — no additional setup required.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #305 | [#306](https://github.com/awinogradov/code-assistants/pull/306) | @awinogradov |
| #300 | [#304](https://github.com/awinogradov/code-assistants/pull/304) | @awinogradov |
| #287 | [#299](https://github.com/awinogradov/code-assistants/pull/299) | @awinogradov |
| #288 | [#299](https://github.com/awinogradov/code-assistants/pull/299) | @awinogradov |

### Features

* **cost-monitor:** add cost regression monitor ([46e2cee](https://github.com/awinogradov/code-assistants/commit/46e2ceed2834425a83edfbf77ecff6aa74f7084f))

### Bug Fixes

* **cost-monitor:** link report issue on run page ([00e16ae](https://github.com/awinogradov/code-assistants/commit/00e16ae3fc2b1db5b7fa1aca150a8ef82c173ec3))
* **cost-monitor:** read metrics from data comment ([b394872](https://github.com/awinogradov/code-assistants/commit/b394872f21c4a21ad9e32825bdf8451112f2e540))

### Documentation

* document run-page link annotations ([a3b0197](https://github.com/awinogradov/code-assistants/commit/a3b0197753dfb84d48887adf34f18999c6b9896b))
* document run-summary footer data comment ([b7ddbf0](https://github.com/awinogradov/code-assistants/commit/b7ddbf03c1dfb1deeda7c7501f4f7b4b29ccf75e))

### Refactoring

* **cost-monitor:** dedupe median helpers ([4ff5916](https://github.com/awinogradov/code-assistants/commit/4ff59168ca23afb3198ee693dca5baa659a0726a))

### Tests

* **cost-monitor:** pin report annotation format ([63fdf46](https://github.com/awinogradov/code-assistants/commit/63fdf465dea478f45001f421eedf5df7aa965f9f))
