# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [0.3.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v0.2.0...autopilot@v0.3.0) (2026-05-29)

## Release Notes

Code review optimization brings faster responses and more thorough security checks to your pull request workflow.

## ✨ What's New

### Security-focused code reviews
The code review system now includes a dedicated security agent that automatically checks for common vulnerabilities like hardcoded secrets, SQL injection risks, improper access controls, and insecure cryptography usage. This means your team gets an extra layer of security review on every pull request without any additional configuration.

<details><summary>Related issues</summary>

- [#148: Right-size review model tiers and add security/performance review checks](https://github.com/awinogradov/code-assistants/issues/148)
- [#142: Optimize code-review-action: latency, tokens, follow-up flow, models, tests](https://github.com/awinogradov/code-assistants/issues/142)
</details>

### Model selection per review type
You can now configure different AI models for different types of code reviews. For example, use a faster model for quick syntax checks and a more powerful model for architecture reviews. This gives you better control over review quality versus speed trade-offs.

<details><summary>Related issues</summary>

- [#148: Right-size review model tiers and add security/performance review checks](https://github.com/awinogradov/code-assistants/issues/148)
</details>

## 🐛 Bug Fixes

### Reliable review submissions
Code reviews are now posted more reliably, especially when multiple reviews happen quickly. The system checks for duplicate reviews more accurately and handles concurrent submissions better, preventing those confusing situations where the same review appears multiple times or reviews mysteriously disappear.

<details><summary>Related issues</summary>

- [#144: Fix code-review follow-up reply flow and submission-logic correctness](https://github.com/awinogradov/code-assistants/issues/144)
</details>

### Faster follow-up responses
When you reply to a code review comment with a question or clarification, the response is now much faster. The system intelligently determines whether a full re-review is needed or just a quick reply, cutting response times significantly for simple follow-up discussions.

<details><summary>Related issues</summary>

- [#144: Fix code-review follow-up reply flow and submission-logic correctness](https://github.com/awinogradov/code-assistants/issues/144)
</details>

## ⚙️ Configuration Required

### Review model overrides
A new `review_model_overrides` configuration option lets you specify which AI model to use for each type of review. This is optional - if not configured, the system uses sensible defaults.

## 📚 Documentation & Settings Updates

### Performance review rules
The code review documentation now includes new rules for identifying performance bottlenecks and dependency/license issues, helping teams catch these concerns early in the review process.

<details><summary>Related issues</summary>

- [#148: Right-size review model tiers and add security/performance review checks](https://github.com/awinogradov/code-assistants/issues/148)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #142 | [#157](https://github.com/awinogradov/code-assistants/pull/157) | @awinogradov |
| #148 | [#157](https://github.com/awinogradov/code-assistants/pull/157) | @awinogradov |
| #147 | [#154](https://github.com/awinogradov/code-assistants/pull/154) | @awinogradov |
| #144 | [#152](https://github.com/awinogradov/code-assistants/pull/152) | @awinogradov |

### Features

* **code-review:** add security agent and model overrides ([31282af](https://github.com/awinogradov/code-assistants/commit/31282af6f3f9a9b5d5dad3bffca00421617bffb8))

### Bug Fixes

* **code-review:** gate verdict re-eval and harden review submission ([79cafc6](https://github.com/awinogradov/code-assistants/commit/79cafc62919ad63dfdd36aa58456eb7899866121))

### Performance

* **code-review:** resolve rule links in code, not in the model ([8adb856](https://github.com/awinogradov/code-assistants/commit/8adb8561b2675624b0c6c1641d37f85e38e38858))
## [0.2.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v0.1.0...autopilot@v0.2.0) (2026-05-29)

## Release Notes

New Autopilot capabilities and repository visibility features that help with code reviews and development workflows.

## ✨ What's New

### Automatic codebase snapshots on merge
Your repository now maintains an up-to-date snapshot of its entire codebase in `.repomix/pack.xml` that automatically refreshes with every merge to the main branch. This gives Claude instant access to your complete codebase structure without needing to scan files during conversations, making code reviews and architecture discussions significantly faster.

The Autopilot plugin automatically uses these snapshots when available, falling back to live scanning only when needed. For repositories that want this capability, there's also a new `repomix-sync` action that helps propagate the snapshot workflow and configuration to other repos.

<details><summary>Related issues</summary>

- [#62: Run repomix pack on PR merge and commit snapshot to repo](https://github.com/awinogradov/code-assistants/issues/62)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #62 | [#106](https://github.com/awinogradov/code-assistants/pull/106) | @awinogradov |

### Features

* **repomix:** add pack-on-merge workflow and snapshot reader ([cfa4065](https://github.com/awinogradov/code-assistants/commit/cfa4065de142e776428ba65e9adaafa8c05e20f7))
## 0.1.0 (2026-05-28)

## Release Notes

Release notes synthesis reveal significant improvements to the Autopilot development assistant.

## ✨ What's New

### Autopilot Mode
Skip confirmation prompts when running skills with the new `--autopilot` flag, enabling smoother automated workflows through your development tasks.

### Enhanced Project Planning
When creating project plans, the system now includes pre-mortem risk analysis and steelman arguments to thoroughly evaluate approaches before implementation. Plans follow clearer structure with required H1 titles and adopt industry-standard Karpathy guidelines for better technical documentation.

<details><summary>Related issues</summary>

- [Pre-mortem expert and steelman intent improvements](https://github.com/awinogradov/code-assistants/commit/eab9db00207b3ec47771fbaeaac6a259927396e7)
- [Karpathy guidelines adoption](https://github.com/awinogradov/code-assistants/commit/2c066890a74a59c67d4b2ec601445bc0be62c82c)
</details>

### Intelligent Issue Creation
The new issue creation skill helps file well-structured GitHub issues with automatic documentation search across context7, ref, exa, and perplexity sources. The system checks for duplicates after generating titles to prevent redundant issues.

### Smart Issue Assignment
When resolving issue context, the system can now automatically assign the current user to the issue, streamlining workflow management.

### Contributing Check Automation
New GitHub action and workflow automatically verify pull requests against contribution guidelines, helping maintain code quality standards.

### Enhanced PR Reviews
Pull request review feedback now includes direct links to the source agent files containing specific rule codes, making it easier to understand and address review comments.

## 🐛 Bug Fixes

### Autopilot Assignment Control
The auto-assign feature is now properly gated behind a configuration flag and the verification pipeline has been fixed to work correctly.

### Issue Creation Reliability
The duplicate detection formula now handles empty keyword sets gracefully, preventing crashes when checking for similar issues. The skill has been updated to use the current `perplexity_` tool prefix and removes deprecated exa tool references.

### Plan Input Processing
Removed unnecessary prefix prompts when processing issue inputs, streamlining the planning workflow.

### PR Review Alignment
Fixed the fan-out mechanism to properly recognize the autopilot prefix, ensuring review tasks are distributed correctly.

## 📚 Documentation & Settings Updates

### Plan Step Templates
Cleaned up duplicate verification lines in plan step templates for clearer documentation.

### Visual Change Recommendations
Plans now recommend using the ascii-schemas skill when dealing with visual or structural changes, helping teams better document architectural decisions.


### Features

* **autopilot:** add --autopilot flag to skip sub-skill prompts ([f29dbbd](https://github.com/awinogradov/code-assistants/commit/f29dbbdb51e98375b701048e74013202461f8e62))
* **autopilot:** add pre-mortem expert and steelman intent to plan ([eab9db0](https://github.com/awinogradov/code-assistants/commit/eab9db00207b3ec47771fbaeaac6a259927396e7))
* **autopilot:** adopt karpathy guidelines in rules and plan skills ([2c06689](https://github.com/awinogradov/code-assistants/commit/2c066890a74a59c67d4b2ec601445bc0be62c82c))
* **autopilot:** auto-assign user when resolving issue context ([f88b55d](https://github.com/awinogradov/code-assistants/commit/f88b55d4ce007e3747882cc31a65b390b06821ef))
* **autopilot:** require h1 title at top of every plan file ([6974b3e](https://github.com/awinogradov/code-assistants/commit/6974b3e89aff350318b9ad292cb39bd7510d35c3))
* **contributing-check:** add action and workflow ([7b4d5fe](https://github.com/awinogradov/code-assistants/commit/7b4d5fe91f309dc1b584c6c281a9251d470888fc))
* **issue-create:** add skill for filing structured github issues ([eaff31d](https://github.com/awinogradov/code-assistants/commit/eaff31d6e962cd6311515fbd66cddac695c6a181))
* **issue-create:** pull docs from context7, ref, exa, perplexity ([fcbd133](https://github.com/awinogradov/code-assistants/commit/fcbd133c77fb944ceaaf8aa3fd6d787ccdefc6e0))
* **pr-review:** link rule codes to source agent files ([f264890](https://github.com/awinogradov/code-assistants/commit/f2648901468eabcfd7355df7447111436e1f988f))

### Bug Fixes

* **autopilot:** gate auto-assign behind flag, fix verify pipe ([4b86d02](https://github.com/awinogradov/code-assistants/commit/4b86d02745811b26cc28c37e651f7d7f76d81791))
* **issue-create:** guard overlap formula against empty keyword sets ([baac42e](https://github.com/awinogradov/code-assistants/commit/baac42eb40412d3aa38d9a83f9d0a82afe78c3e8))
* **issue-create:** run duplicate check after title generation ([5cbe413](https://github.com/awinogradov/code-assistants/commit/5cbe413284045abcbec2f3e397294f8e3ab2550f))
* **issue-create:** use perplexity_ prefix, drop deprecated exa tool ([a26e8c0](https://github.com/awinogradov/code-assistants/commit/a26e8c004e706fbd72055e9c492016528cef0566))
* **plan:** drop prefix prompt for issue inputs ([22fd744](https://github.com/awinogradov/code-assistants/commit/22fd744154caba2adbcf0d5e4d7bd546a0b525eb))
* **pr-review:** align fan-out on autopilot prefix ([8e36b8b](https://github.com/awinogradov/code-assistants/commit/8e36b8be95e3312f7feda730d8bcd94b49429d81))

### Documentation

* **autopilot:** dedupe verify line in plan step template ([071b9e4](https://github.com/awinogradov/code-assistants/commit/071b9e47557e5331057a61fbfb3a3d2d78d13d35))
* **plan:** recommend ascii-schemas skill for visual changes ([050d6c0](https://github.com/awinogradov/code-assistants/commit/050d6c0a7a0f6d80bbc92077ae0f91119853ef91))

### Chores

* add local hooks and plugin validators ([ca7425c](https://github.com/awinogradov/code-assistants/commit/ca7425cbf4938e6ce36dcd0e20435ce035756e03))
* **autopilot:** bump plugin version to 0.5.0 ([ca35946](https://github.com/awinogradov/code-assistants/commit/ca359464d28e161cc767638ab5a2edd86ec05b50))
* bump version from 0.1.0 to 0.2.0 ([c114394](https://github.com/awinogradov/code-assistants/commit/c1143947a9306004580bf9864b11e013a59d750a))
* bump version from 0.5.0 to 0.5.1 ([cf9922d](https://github.com/awinogradov/code-assistants/commit/cf9922d4cd2455ba1be78c72c6392c235b265d81))
* bump version from 0.5.1 to 0.5.2 ([11a6bbb](https://github.com/awinogradov/code-assistants/commit/11a6bbb666cb4c261091f8b36cdb2c7d1d8c728a))
* bump version from 0.5.2 to 0.5.3 ([fbb517c](https://github.com/awinogradov/code-assistants/commit/fbb517caa44a906b30595437714396568f2124a8))
* initial commit ([433c180](https://github.com/awinogradov/code-assistants/commit/433c180bd515189ebc447ec88ccea908e92ca3c9))
* **plugin:** declare release.type claude-plugin ([3761e45](https://github.com/awinogradov/code-assistants/commit/3761e458df7c4adaadac3d46faa4cf7895ee993e))
