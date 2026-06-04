# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [1.2.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.1.0...autopilot@v1.2.0) (2026-06-04)

## Release Notes

The Autopilot Claude Plugin code review system now provides more thorough and contextual reviews, with better formatted output and improved review accuracy.

## ✨ What's New

### Enhanced code review context
Code reviews now gather comprehensive project context before analyzing changes, including your CLAUDE.md guidelines, README documentation, and related TODO items. This ensures reviewers understand your project's specific requirements and conventions before making suggestions, leading to more relevant and actionable feedback.

<details><summary>Related issues</summary>

- [#233: Improve the code review skill: context parity, inline history, and rule checks](https://github.com/awinogradov/code-assistants/issues/233)
</details>

### Prior review history tracking
Reviews now automatically load previous inline comments from earlier review rounds, enabling accurate follow-up reviews. Reviewers can see what was already discussed and whether previous feedback was addressed, avoiding repetitive comments and ensuring continuity across review iterations.

<details><summary>Related issues</summary>

- [#233: Improve the code review skill: context parity, inline history, and rule checks](https://github.com/awinogradov/code-assistants/issues/233)
</details>

### Expanded review rule checks
The review system now includes 14 comprehensive checks covering task/solution alignment, dead code detection, unvalidated external input, and platform-specific standards for logging, documentation, and service integration. These automated checks help catch common issues that manual reviews might miss.

<details><summary>Related issues</summary>

- [#233: Improve the code review skill: context parity, inline history, and rule checks](https://github.com/awinogradov/code-assistants/issues/233)
</details>

### Consistent reference formatting
All generated output — from skills to code reviews and release notes — now formats references consistently as clickable links. File paths, section references, commit SHAs, and issue numbers render as resolvable links instead of dead backticked text, making it easier to navigate between related content.

<details><summary>Related issues</summary>

- [#236: Standardize reference formatting and readability in generated output](https://github.com/awinogradov/code-assistants/issues/236)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #236 | [#237](https://github.com/awinogradov/code-assistants/pull/237) | @awinogradov |
| #233 | [#234](https://github.com/awinogradov/code-assistants/pull/234) | @awinogradov |

### Features

* **autopilot:** inline format rules into skills ([ebc8a89](https://github.com/awinogradov/code-assistants/commit/ebc8a89cc06d62b355e23821b38887fc57094963))
* **pr-review:** add logging, docs, service checks ([faf2b41](https://github.com/awinogradov/code-assistants/commit/faf2b41036f1b134c6f805e1cb1da0e223dfff5e))
* **pr-review:** load inline history, add checks ([79daac4](https://github.com/awinogradov/code-assistants/commit/79daac485a20ea33d8ada4355204fc00a1ec49ee))
* **pr-review:** load related todos for context ([68015b8](https://github.com/awinogradov/code-assistants/commit/68015b8cda6becd3395a43ebcc89c0607daea460))
## [1.1.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.0.0...autopilot@v1.1.0) (2026-06-01)

## Release Notes

The Autopilot Claude Plugin now seamlessly integrates with Google Gemini and OpenAI Codex, letting you delegate specialized AI tasks through simple commands while getting critical peer review of the results.

## ✨ What's New

### Ask Gemini for help
Claude can now delegate complex tasks to Google's Gemini model when you need a second AI perspective or specialized capabilities. The skill runs Gemini through its CLI interface and critically evaluates the response before presenting it to you, ensuring you get peer-reviewed insights rather than raw output.

<details><summary>Related issues</summary>

- [#221: Add ask:gemini skill to delegate tasks to the Gemini CLI](https://github.com/awinogradov/code-assistants/issues/221)
</details>

### Ask Codex for code assistance
Similar to the Gemini integration, Claude can now tap into OpenAI's Codex for specialized code analysis, refactoring, or automated editing tasks. The skill carefully handles the Codex CLI interaction, sandboxes the execution, and provides critical evaluation of the results — giving you the best of both AI assistants.

<details><summary>Related issues</summary>

- [#219: Add ask:codex skill to delegate tasks to the OpenAI Codex CLI](https://github.com/awinogradov/code-assistants/issues/219)
</details>

### Enhanced code review suggestions
Code review comments now include GitHub-compatible suggestion blocks that reviewers can apply with a single click. Each finding also includes a collapsible "Prompt for AI agents" section containing the full context, making it easy to ask AI for help implementing the suggested changes.

<details><summary>Related issues</summary>

- [#217: Add one-click suggestions and AI-agent prompts to code review comments](https://github.com/awinogradov/code-assistants/issues/217)
</details>

## 🐛 Bug Fixes

### Faster planning with single codebase analysis
The plan and run commands now analyze your codebase just once during the initial context gathering phase, rather than re-reading it multiple times throughout the planning process. This significantly speeds up planning for large projects while ensuring consistent analysis across all planning stages.

<details><summary>Related issues</summary>

- [#183: Reconcile plan skill context-gathering to stop re-traversing the codebase](https://github.com/awinogradov/code-assistants/issues/183)
- [#211: Plan skill's Deep Analysis phase re-reads a codebase already analyzed earlier](https://github.com/awinogradov/code-assistants/issues/211)
</details>

### No more permission prompts for planning tools
Planning and running tasks no longer interrupts your workflow with permission prompts for the internal task-tracking and sub-agent tools they need to function. These tools are now properly granted upfront.

<details><summary>Related issues</summary>

- [#214: Plan skill uses task tools it never grants and tracks progress out of order](https://github.com/awinogradov/code-assistants/issues/214)
</details>

## 📚 Documentation & Settings Updates

### New skill documentation
Complete documentation has been added for both the ask:codex and ask:gemini skills, including usage examples, model prompting details, and safety considerations for handling CLI interactions.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #221 | [#222](https://github.com/awinogradov/code-assistants/pull/222) | @awinogradov |
| #219 | [#220](https://github.com/awinogradov/code-assistants/pull/220) | @awinogradov |
| #217 | [#218](https://github.com/awinogradov/code-assistants/pull/218) | @awinogradov |
| #214 | [#216](https://github.com/awinogradov/code-assistants/pull/216) | @awinogradov |
| #183 | [#215](https://github.com/awinogradov/code-assistants/pull/215) | @awinogradov |
| #211 | [#215](https://github.com/awinogradov/code-assistants/pull/215) | @awinogradov |

### Features

* **autopilot:** add ask:codex skill ([773cb00](https://github.com/awinogradov/code-assistants/commit/773cb0097cf41912365c5d02981451fa52967f41))
* **autopilot:** add ask:gemini skill ([190eec4](https://github.com/awinogradov/code-assistants/commit/190eec459de16a5be398a9330e0571f2f7b9b68a))
* **code-review:** add suggestion and agent blocks ([18de884](https://github.com/awinogradov/code-assistants/commit/18de8845ebc8a0b3b9df3590324794b12e807143))

### Bug Fixes

* **autopilot:** add task and agent tool grants ([4825b20](https://github.com/awinogradov/code-assistants/commit/4825b20626b7c7e00e73645c2c419b6884a26c3b))
* **plan:** collapse codebase reads into one pass ([168829f](https://github.com/awinogradov/code-assistants/commit/168829f374172416e22d3aec70c2723284d86eca))
* **plan:** stop deep analysis re-reading codebase ([ab37008](https://github.com/awinogradov/code-assistants/commit/ab370085788793ec1c31e28d9e4e6eb61f60b216))

### Documentation

* **autopilot:** document ask:codex skill ([701873d](https://github.com/awinogradov/code-assistants/commit/701873dfd80ab40c7ab9fd55609e538385e8ff6f))
* **autopilot:** document ask:gemini skill ([fa0d905](https://github.com/awinogradov/code-assistants/commit/fa0d90502a88bed0acbaacc9ae65c0097d2e783b))

### Chores

* update resume example ([e570936](https://github.com/awinogradov/code-assistants/commit/e570936fb39fe34f4186f434966e25bdb3190dd4))
## [1.0.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v0.3.0...autopilot@v1.0.0) (2026-05-31)

## Release Notes

The Autopilot Claude Plugin now streamlines AI-assisted development workflows with faster code reviews, smarter planning, and better documentation support.

## ✨ What's New

### Streamlined code review process
Code reviews on large pull requests now complete significantly faster with a simplified single-pass architecture. The system analyzes your code once instead of coordinating multiple review agents, eliminating empty approvals that occurred when sub-agents failed. Review findings are now processed more efficiently through structured data rather than verbose text parsing.

<details><summary>Related issues</summary>

- [#161: Phase 6: cut code review per-agent and aggregation latency](https://github.com/awinogradov/code-assistants/issues/161)
- [#174: Code-review fan-out fails: all review sub-agents return no findings object](https://github.com/awinogradov/code-assistants/issues/174)
- [#177: Simplify code-review-action to one pr:review pass with anchored rule links](https://github.com/awinogradov/code-assistants/issues/177)
- [#179: Generate CHECK rule links inside the review skill instead of a resolver script](https://github.com/awinogradov/code-assistants/issues/179)
</details>

### Plan and Run skills documentation
Comprehensive documentation now explains exactly how the plan and run automation skills work. The new guide walks through the entire workflow from input to merged PR, complete with ASCII diagrams showing the pipeline flow, orchestrator delegation, and sub-agent architecture.

<details><summary>Related issues</summary>

- [#204: Document how the plan and run skills work in the README and docs](https://github.com/awinogradov/code-assistants/issues/204)
</details>

### Repository documentation awareness
Planning skills now read and understand your repository's README and documentation before creating implementation plans. Generated plans automatically include steps to update affected documentation, ensuring your docs stay in sync with code changes.

<details><summary>Related issues</summary>

- [#170: Make plan skills read and update repository README and docs/*](https://github.com/awinogradov/code-assistants/issues/170)
</details>

### Automatic issue assignment
When you start working on a GitHub issue, the system now automatically assigns it to you when creating the feature branch. This prevents multiple team members from accidentally working on the same issue.

<details><summary>Related issues</summary>

- [#151: Autopilot starts work on an issue without assigning it to the current user](https://github.com/awinogradov/code-assistants/issues/151)
</details>

### Structured planning outputs
Planning sub-agents now return validated JSON data instead of free text, making the planning flow more reliable and predictable. Context gathering, expert review, and other planning components communicate through typed schemas.

<details><summary>Related issues</summary>

- [#185: Return schema-validated output from expert-review and plan context agents](https://github.com/awinogradov/code-assistants/issues/185)
</details>

### Unified planning pipeline
Both Bun and Node.js/React projects now use the same planning pipeline, ensuring consistent behavior across technology stacks. Documentation lookup protocols and phase definitions are now shared, preventing drift between implementations.

<details><summary>Related issues</summary>

- [#184: Deduplicate the plan-bun and plan-nodejs-react phase pipeline into one source](https://github.com/awinogradov/code-assistants/issues/184)
- [#186: Remove duplicated documentation-lookup blocks from the plan stack skills](https://github.com/awinogradov/code-assistants/issues/186)
- [#187: Remove the dead Quiz Mode format from the plan skills](https://github.com/awinogradov/code-assistants/issues/187)
</details>

## 🐛 Bug Fixes

### Planning phase execution order
Plans are now properly drafted before being scored and reviewed, ensuring that expert feedback reflects the actual plan that will be implemented rather than an intermediate state.

<details><summary>Related issues</summary>

- [#181: Fix plan skill phase ordering so plans are drafted before scoring and review](https://github.com/awinogradov/code-assistants/issues/181)
</details>

### Context gathering efficiency
Planning skills now avoid redundant full codebase scans by using a single consistent rule for where context comes from, significantly reducing planning time on large repositories.

<details><summary>Related issues</summary>

- [#183: Reconcile plan skill context-gathering to stop re-traversing the codebase](https://github.com/awinogradov/code-assistants/issues/183)
</details>

### Tool availability in planning
Planning skills now properly declare all tools they use, including the agent launcher for sub-agents, preventing execution failures from missing tool grants.

<details><summary>Related issues</summary>

- [#182: Grant the sub-agent launcher tool in plan skills or align launch instructions](https://github.com/awinogradov/code-assistants/issues/182)
- [#188: Trim over-granted tools in the plan stack skills and expert-review agent](https://github.com/awinogradov/code-assistants/issues/188)
</details>

### Review token counting accuracy
The run summary now accurately reports total input tokens including cached content, replacing the previously misleading near-zero values that made cost estimation impossible.

<details><summary>Related issues</summary>

- [#175: Revalidate run-summary metrics: implausible token counts and likely undercounted cost](https://github.com/awinogradov/code-assistants/issues/175)
</details>

## ⚠️ Breaking Changes

### Code review action inputs removed
The `parallel_fanout` and `review_model_overrides` action inputs have been removed as part of the simplified single-pass review architecture. If your workflows use these inputs, remove them from your action configuration.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #204 | [#205](https://github.com/awinogradov/code-assistants/pull/205) | @awinogradov |
| #188 | [#203](https://github.com/awinogradov/code-assistants/pull/203) | @awinogradov |
| #184 | [#202](https://github.com/awinogradov/code-assistants/pull/202) | @awinogradov |
| #187 | [#202](https://github.com/awinogradov/code-assistants/pull/202) | @awinogradov |
| #186 | [#201](https://github.com/awinogradov/code-assistants/pull/201) | @awinogradov |
| #185 | [#200](https://github.com/awinogradov/code-assistants/pull/200) | @awinogradov |
| #183 | [#193](https://github.com/awinogradov/code-assistants/pull/193) | @awinogradov |
| #182 | [#192](https://github.com/awinogradov/code-assistants/pull/192) | @awinogradov |
| #181 | [#190](https://github.com/awinogradov/code-assistants/pull/190) | @awinogradov |
| #179 | [#180](https://github.com/awinogradov/code-assistants/pull/180) | @awinogradov |
| #177 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #174 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #175 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #170 | [#173](https://github.com/awinogradov/code-assistants/pull/173) | @awinogradov |
| #151 | [#172](https://github.com/awinogradov/code-assistants/pull/172) | @awinogradov |
| #161 | [#169](https://github.com/awinogradov/code-assistants/pull/169) | @awinogradov |

### ⚠ BREAKING CHANGES

* **code-review:** removed the parallel_fanout and review_model_overrides action inputs

### Features

* **plan:** read and require updating repo readme and docs ([c8cc235](https://github.com/awinogradov/code-assistants/commit/c8cc23573b5da417c500d21a98f5fafd010b804f))
* **plan:** return schema-validated sub-agent output ([8734148](https://github.com/awinogradov/code-assistants/commit/8734148fa2ccd29125c3e183a62ff6c476e5a052))

### Bug Fixes

* **autopilot:** self-assign current user on issue branch creation ([dbb9719](https://github.com/awinogradov/code-assistants/commit/dbb9719a342273468fa2346a5dc17da3f26a3e61))
* **plan:** add snapshot-vs-live context rule ([e88a936](https://github.com/awinogradov/code-assistants/commit/e88a9366bca613ea17f243ba55ae91db89e2b98e))
* **plan:** draft plan before scoring and review ([e4b9f48](https://github.com/awinogradov/code-assistants/commit/e4b9f48b14b9e103e03c00a431ffc4ec127f72aa))
* **plan:** grant agent tool in plan skills ([4361847](https://github.com/awinogradov/code-assistants/commit/4361847ddf5fbcb36ff1590035c489a3e1503cdd))
* **pr-review:** document inline-comment fetch limit honestly ([4ad5a83](https://github.com/awinogradov/code-assistants/commit/4ad5a83d27e29d7575d0413b7156c0c113aa2c97))
* **pr-review:** read prior reviews from gh pr view not gh api ([72972ec](https://github.com/awinogradov/code-assistants/commit/72972ec8e49df44ef8150ddd604f89fcd747b219))

### Performance

* **code-review:** aggregate findings in code via structured output ([4b53af9](https://github.com/awinogradov/code-assistants/commit/4b53af9c77da054ffe0a7e0fd583c352fb560416))

### Documentation

* explain how the plan and run skills work ([1b891ce](https://github.com/awinogradov/code-assistants/commit/1b891cef9595138861cd853a7efd7134ee89fb67))

### Refactoring

* **code-review:** build rule-code links in the review skill ([db457ff](https://github.com/awinogradov/code-assistants/commit/db457ff08007ad0cb3c73f0155cc76ea30d041f5))
* **code-review:** replace fan-out with single-pass review skill ([44b3c98](https://github.com/awinogradov/code-assistants/commit/44b3c9836414a2d3fcff57308d6312fa03b0520f))
* **plan:** dedupe doc-lookup into common instructions ([162791e](https://github.com/awinogradov/code-assistants/commit/162791eca9c05eba69dc12784423d05b77232f44))
* **plan:** dedupe stack pipeline into shared source ([65fc291](https://github.com/awinogradov/code-assistants/commit/65fc29115bfa894f0111918721aca58d183ea3b9))
* **plan:** remove dead quiz mode format ([1835f85](https://github.com/awinogradov/code-assistants/commit/1835f858d3c7f0e8e33a06743c6757ae1a642887))
* **plan:** trim over-granted plan-flow tools ([1612d65](https://github.com/awinogradov/code-assistants/commit/1612d6563955fda3a3e7928ab2b85efcd9d0e766))
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
