# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [6.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v5.1.0...code-review-action@v6.0.0) (2026-08-10)

## Release Notes

Skills directories have been renamed to a portable dash-only layout and branch names are now validated before creation, making this a breaking release for any integrations that reference colon-path skill directories.

## ✨ What's New

### Branch Name Validation Before Creation

Branch names are now checked against the canonical naming convention before the branch is created and again at commit time. When the autopilot proposes an invalid branch name, it's caught and flagged immediately — while a rename is still free — instead of surfacing as a CI failure on an already-opened PR. This eliminates a class of failed review cycles where a PR had to be closed and recreated just to fix the branch name.

<details><summary>Related issues</summary>

- [#565: Enforce branch naming before creation so invalid branches never reach a PR](https://github.com/awinogradov/code-assistants/issues/565)
</details>

## ⚠️ Breaking Changes

### Skill Directories Renamed to Dash-Only Paths

The autopilot skill directories have been renamed from colon-separated paths to dash-only paths to establish a single portable layout shared by Claude and other CLIs. The slash commands you use in PRs (e.g. `/autopilot:pr-review`) are unchanged — this only affects the on-disk directory structure and any external deep links or tooling that references the old paths.

**Old paths (no longer exist):**
```
skills/pr:review/
skills/pr:answer/
```

**New paths:**
```
skills/pr-review/
skills/pr-answer/
```

Additionally, the `agents-skills-sync` integration now syncs the plugin's skills directory verbatim to unprefixed `.agents/skills/` paths. Any previously synced `autopilot-*` directories under `.agents/skills/` need to be removed manually — they will not be cleaned up automatically.

The generated `agent-skills/` layout and its export pipeline have been removed entirely. The plugin's skills directory is now the canonical portable source, per [RFC-0002](https://github.com/awinogradov/code-assistants/pull/564).

**Migration steps:**
1. Update any external links, documentation, or tooling that references `skills/pr:review/` or other colon-path directories to use the new dash-only equivalents.
2. Manually delete any `autopilot-*` directories under `.agents/skills/` in repositories that were previously synced.
3. Remove any references to or pipelines that consumed the `agent-skills/` generated layout.

<details><summary>Related issues</summary>

- [#563: Converge skill sources so Claude and other CLIs share one layout](https://github.com/awinogradov/code-assistants/issues/563)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #565 | [#566](https://github.com/awinogradov/code-assistants/pull/566) | @awinogradov |
| #563 | [#564](https://github.com/awinogradov/code-assistants/pull/564) | @awinogradov |

### ⚠ BREAKING CHANGES

* **autopilot:** make skills the portable source layout

### Features

* **autopilot:** make skills the portable source layout ([e9859e9](https://github.com/awinogradov/code-assistants/commit/e9859e9477f3f199655f49d476b90b9a26ab6724))
* **autopilot:** validate branch names before creation and commit ([055897c](https://github.com/awinogradov/code-assistants/commit/055897cabe194bb6b467cef2f19c46711a9302e5))
## [5.1.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v5.0.0...code-review-action@v5.1.0) (2026-08-03)

## Release Notes

The AI reviewer's context gathering now includes full agent session history when Entire is available, giving the reviewer richer background on how the code it's examining came to be.

## ✨ What's New

### Session History in Review Context

When [Entire](https://entire.app) is connected to your environment, the Context Map that the AI reviewer builds before analysing a PR now includes the agent sessions that produced the relevant files and commits. Previously the reviewer could see the diff and surrounding code; now it can also trace *how* that code was written — which agent sessions touched which files and generated which commits — giving it meaningful background when it evaluates design decisions or flags potential issues.

No configuration changes are needed if Entire is already set up. If it isn't available, context gathering works exactly as before.

<details><summary>Related issues</summary>

- [#542: Connect commits and code to agent sessions via Entire in context gathering](https://github.com/awinogradov/code-assistants/issues/542)
- [#543: Connect commits and code to agent sessions via Entire in context gathering](https://github.com/awinogradov/code-assistants/pull/543)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #542 | [#543](https://github.com/awinogradov/code-assistants/pull/543) | @awinogradov |

### Features

* **gather-context:** add entire session-history digest ([ca09bfa](https://github.com/awinogradov/code-assistants/commit/ca09bfa4e86161b164566a7fab1b0c7fd5b07ebd))
## [5.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v4.0.1...code-review-action@v5.0.0) (2026-08-01)

## Release Notes

The autopilot skills and agents have been fully restructured for Claude 5's context engineering model, introducing breaking changes to agent output formats and review scoring that require immediate attention from any integration consuming these outputs.

## ⚠️ Breaking Changes

### Agent Outputs Are Now Bare JSON (No More Markdown Blocks)

The `fetch-pr-reviews`, `analyze-pr-commits`, `analyze-staged-changes`, and `scan-and-analyze-todos` agents previously wrapped their results in markdown code blocks. They now emit bare JSON objects directly. Any pipeline, parser, or downstream integration that strips markdown fences to extract JSON will need to be updated — the JSON is now the raw output with no wrapper.

### Expert Review Scoring Model Restructured

The `expert-review` agent no longer includes a `revision.rescore` field. Instead, the final `score` is now derived automatically from the agent's five scoring dimensions. Additionally, stored plan `Score:` lines now record individual per-reviewer verdicts rather than a single averaged value. Any tooling or reporting that reads `revision.rescore` or expects a single aggregated score will need to be updated to work with the new dimension-based and per-reviewer format.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

## ✨ What's New

### Claude 5 Context Engineering Optimisations

The autopilot skills have been restructured to take full advantage of Claude 5's generation model. Progressive disclosure means bulk content is surfaced only when needed, shared instruction blocks now have a single owner to eliminate duplication, and instructions are written intent-first. In practical terms, this translates to more consistent review outputs and lower token consumption per run.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

### On-Demand Check Details in PR Review

The `pr:review` skill now loads check-family details only when they are actually needed, rather than fetching everything upfront. This cuts the token cost of each review run while keeping every rule link fully resolvable — so reviewers still see complete, linked findings with no missing context.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

### Rebase-Merge Branch Detection in Preflight Check

The `preflight-check` now correctly identifies branches whose commits have already landed upstream via rebase-merge. Previously these branches could slip past the preflight gate; they are now caught and handled appropriately before a review run begins.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>

### Autopilot Commit Flows Unblocked for `pr:update`

The `pr:update` skill now supports a non-interactive `--autopilot` flag, allowing it to be invoked directly by other skill callers without requiring human input at the terminal. This unblocks fully automated commit flows that previously stalled waiting for interaction.

<details><summary>Related issues</summary>

- [#535: Align autopilot skills and agents with Claude 5 context engineering rules](https://github.com/awinogradov/code-assistants/issues/535)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #535 | [#536](https://github.com/awinogradov/code-assistants/pull/536) | @awinogradov |

### ⚠ BREAKING CHANGES

* **autopilot:** the four migrated agents emit bare JSON objects instead of markdown blocks, expert-review drops revision.rescore and derives score from its dimensions, and stored plan Score: lines record per-reviewer verdicts instead of a single average

Entire-Checkpoint: 77d4ce846534

### Refactoring

* **autopilot:** dedupe shared instruction blocks across skills ([3f369ed](https://github.com/awinogradov/code-assistants/commit/3f369edcc032e056bf70b5c54087ff7abcedb7e9))
* **autopilot:** define agent outputs as schemas not samples ([bb1d3dc](https://github.com/awinogradov/code-assistants/commit/bb1d3dcf97685f6865948e720a239ed8bdb9116f))
## [4.0.1](https://github.com/awinogradov/code-assistants/compare/code-review-action@v4.0.0...code-review-action@v4.0.1) (2026-07-31)

## Release Notes

The `linear-plan` skill now stores plans using a strict template that guarantees valid Linear markdown, preventing parse failures when plans are consumed by `linear-run`.

## ✨ What's New

### Strict Template for Stored Linear Plans

When the `linear-plan` skill writes a plan back to a Linear ticket, it now uses a controlled emission template restricted to markdown that Linear can reliably parse. Previously, plans could include formatting that looked fine in preview but caused issues downstream when `linear-run` picked them up for execution. With this change, stored plans are always structured in a way Linear accepts, so the handoff between planning and execution is clean and predictable.

<details><summary>Related issues</summary>

- [#531: Add a strict stored-plan template to the linear-plan skill](https://github.com/awinogradov/code-assistants/issues/531)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #531 | [#532](https://github.com/awinogradov/code-assistants/pull/532) | @awinogradov |

### Tests

* **code-review:** pin linear-plan emission template ([18a8228](https://github.com/awinogradov/code-assistants/commit/18a822862fb1e7c52597290d28ed4b5e4af75581))
## [4.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v3.0.0...code-review-action@v4.0.0) (2026-07-31)

## Release Notes

The `/autopilot:linear-plan` skill no longer runs the expert-review panel automatically — it's now an opt-in step you must explicitly request.

## ⚠️ Breaking Changes

### Expert Review Panel is Now Opt-In for Linear Planning

Previously, every time `/autopilot:linear-plan` ran, it automatically triggered a full expert-review panel as part of the planning process. As of this release, that panel is skipped by default.

If your team relies on the expert review scoring as part of your planning workflow, you must now explicitly pass the `--experts-review` flag when invoking the skill:

```
/autopilot:linear-plan --experts-review
```

**What happens if you don't update:**
Plans generated without the flag will complete normally, but the stored plan header will record `Score: skipped` instead of an actual review score. Any downstream processes or reports that read or depend on the `Score` field in stored plan headers will see that value change.

**Migration steps:**
1. Identify any workflows, runbooks, or automations that invoke `/autopilot:linear-plan`.
2. For any invocation where expert review scoring is expected or required, append `--experts-review` to the command.
3. For invocations where scoring is not needed, no change is required — plans will continue to generate normally, with `Score: skipped` recorded in the header.

<details><summary>Related issues</summary>

- [#527: HOTFIX: Make Linear planning expert review opt-in](https://github.com/awinogradov/code-assistants/pull/527)
</details>


### ⚠ BREAKING CHANGES

* **linear-plan:** /autopilot:linear-plan no longer runs the expert-review panel by default; pass --experts-review to keep the previous always-review behavior. Plans stored without the flag record Score: skipped in the stored header.

Entire-Checkpoint: d209733601ff

### Bug Fixes

* **linear-plan:** gate expert review behind opt-in flag ([99bca11](https://github.com/awinogradov/code-assistants/commit/99bca114ff702189b7f6f2bddd4de52234a160b7))
## [3.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v2.4.0...code-review-action@v3.0.0) (2026-07-30)

## Release Notes

Expert review in autopilot planning is now an opt-in step rather than a required gate, and the scoring system that blocked plans from being stored has been removed entirely.

## ✨ What's New

### Expert Review as an Optional Enhancement

The `/autopilot:plan` skill no longer requires an expert review panel to complete before a plan is accepted. Previously, planning ran a multi-expert review loop that had to reach a score of 98/100 across up to three revision passes before the plan could proceed — this gate is now gone. By default, planning runs straight through to completion without the expert panel. When you want the expert review layer, pass `--experts-review` to invoke it explicitly as an enhancement step, not a prerequisite.

This makes planning significantly faster for everyday use while keeping the deeper review available on demand.

<details><summary>Related issues</summary>

- [#521: Make expert review optional in the plan skill via an --experts-review flag](https://github.com/awinogradov/code-assistants/issues/521)
</details>

## ⚠️ Breaking Changes

### Expert Review No Longer Gates Planning

The 98/100 score requirement and the three-pass revision budget have been removed from the planning pipeline. Any automation or workflow that relied on plans being held until they passed expert review scoring will need to be updated — plans now proceed immediately without that gate.

To preserve the expert review step, update any calls to `/autopilot:plan` to include the `--experts-review` flag.

### Plans Now Stored Unconditionally in `linear:plan`

`linear:plan` previously only wrote a plan to Linear after a successful `ExitPlanMode` transition and a passing minimum score. Both conditions are removed — every plan run now stores its output unconditionally. If your integration assumed that a stored plan had cleared the review threshold, that assumption no longer holds.

### Plan Score Line Format Changed

The recorded score format has changed. Any tooling, dashboards, or scripts that parse the plan score output will need to be updated to match the new format.

**Before:**
```
Score: <N>/100
```

**After:**
```
Score: <N>/100 · weakest: <dimension>
```


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #521 | [#522](https://github.com/awinogradov/code-assistants/pull/522) | @awinogradov |

### ⚠ BREAKING CHANGES

* **plan:** expert review no longer gates planning. plan skips it unless --experts-review is passed; linear:plan stores plans unconditionally with no ExitPlanMode and no score check; the 98 scoring target and three-pass revision budget are removed from the shared pipeline; the recorded score line format changed to `Score: <N>/100 · weakest: <dimension>`.

Entire-Checkpoint: 4a56f00741be

### Features

* **plan:** make expert review an ungated opt-in step ([df68875](https://github.com/awinogradov/code-assistants/commit/df68875fb7862277a99a61f902714cb12046e8c6))
## [2.4.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v2.3.0...code-review-action@v2.4.0) (2026-07-30)

## Release Notes

The `linear-run` skill can now execute any Linear issue autonomously, even when no stored implementation plan exists.

## ✨ What's New

### Execute Any Linear Issue Without a Stored Plan

Previously, the `linear-run` skill required a pre-stored implementation plan to be attached to a Linear issue before it could run autonomously. Issues that hadn't gone through the planning stage would simply be skipped or fail. Now, `linear-run` handles these plan-less issues gracefully — it proceeds with execution using the issue description and context alone, so you're no longer blocked from running automation on issues that were created directly without a planning step.

This is particularly useful for straightforward issues or urgent tasks where the team wants to trigger autonomous execution immediately without first generating and storing a plan.

<details><summary>Related issues</summary>

- [#516: Allow linear-run to execute any Linear issue](https://github.com/awinogradov/code-assistants/issues/516)
- [#517: Allow linear-run to execute any Linear issue](https://github.com/awinogradov/code-assistants/pull/517)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #516 | [#517](https://github.com/awinogradov/code-assistants/pull/517) | @rovnyart |

### Features

* **linear-run:** support issues without stored plans ([a090923](https://github.com/awinogradov/code-assistants/commit/a0909235d67bc840f1bf04a6a6336cd3d9bcd918))
## [2.3.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v2.2.0...code-review-action@v2.3.0) (2026-07-30)

## Release Notes

Linear plan storage is now fully automated — plans are saved directly after scoring without requiring a separate approval step.

## ✨ What's New

### Path Drift Detection for Stored Linear Plans

When a stored Linear plan references files that have since been moved or renamed, the action now reports those missing paths before any steps execute. Previously, `linear:run` would begin executing a plan step-by-step and only surface a problem when a specific step failed — obscuring the real cause. Now, every path in the plan's `### Files` list is checked against the current checkout, and any that are gone are named upfront in an advisory report. Files marked `(new)` in the plan are correctly skipped, since those are intended to be created rather than already present. A clean result (all paths resolve) is also stated explicitly so there's no ambiguity about whether the check ran.

<details><summary>Related issues</summary>

- [#502: Stored Linear plans are not checked for moved file paths](https://github.com/awinogradov/code-assistants/issues/502)
</details>

### Richer Plan Score Recording

Plan files now record not just the final score, but how that score was reached. The stored line becomes `Score: <N>/100 · <P> pass(es) · <exit reason>`, where the exit reason is one of `target reached`, `no improvement`, or `budget spent`. This makes it possible to distinguish a plan that cleared the scoring target on the first pass from one that exhausted its revision budget and landed just short — information that was previously lost the moment a run completed.

<details><summary>Related issues</summary>

- [#503: Measure whether the 98 plan scoring target is reachable](https://github.com/awinogradov/code-assistants/issues/503)
</details>

## 🐛 Bug Fixes

### Linear Plan Storage No Longer Requires a Separate Approval Step

Plans are now stored automatically after scoring completes. The previous flow required a manual approval gate between scoring and storage, which added friction and an unnecessary intervention point. Plans now move straight from scored to stored without a separate sign-off.

<details><summary>Related issues</summary>

- [#512: Store Linear plans without a separate approval gate](https://github.com/awinogradov/code-assistants/issues/512)
</details>

### Expert Reviews Without Evidence Are Now Discarded

The `expert-review` agent was producing confident, detailed reviews based on file contents it had never actually read — in some cases inventing identifiers, imports, and contradictory versions of the same file. Because the parent skill had no way to detect this, fabricated reviews were averaged into the panel score as if they were legitimate. The agent now declares a `grounding` array listing what it actually consulted, and the parent discards any panel member whose grounding is empty, whose report is unparseable, or that quoted file contents not present in the plan or context. A panel where no members survive is now reported as unreviewed rather than silently emitting a score from zero evidence.

<details><summary>Related issues</summary>

- [#499: Expert-review agent invents file contents instead of reading them](https://github.com/awinogradov/code-assistants/issues/499)
- [#497: Add skills to store a plan on a Linear issue and execute it verbatim](https://github.com/awinogradov/code-assistants/issues/497)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #512 | [#513](https://github.com/awinogradov/code-assistants/pull/513) | @rovnyart |
| #501 | [#511](https://github.com/awinogradov/code-assistants/pull/511) | @awinogradov |
| #500 | [#511](https://github.com/awinogradov/code-assistants/pull/511) | @awinogradov |
| #503 | [#510](https://github.com/awinogradov/code-assistants/pull/510) | @awinogradov |
| #502 | [#508](https://github.com/awinogradov/code-assistants/pull/508) | @awinogradov |
| #497 | [#507](https://github.com/awinogradov/code-assistants/pull/507) | @awinogradov |
| #499 | [#507](https://github.com/awinogradov/code-assistants/pull/507) | @awinogradov |

### Features

* **linear:** report path drift on a stored plan ([5b35bde](https://github.com/awinogradov/code-assistants/commit/5b35bde5ba1142e58f453809a0a75d146d8289ed))
* **plan:** record passes and exit reason with the score ([3661ffa](https://github.com/awinogradov/code-assistants/commit/3661ffa2eb4dedf82fc724ccd7955d8a83288612))

### Bug Fixes

* **linear-plan:** remove separate approval gate ([ec810db](https://github.com/awinogradov/code-assistants/commit/ec810db9f3e3aa0a5a673df10c046960d7ae8c2b))
* **plan:** discard expert reviews with no grounding ([edc40ee](https://github.com/awinogradov/code-assistants/commit/edc40eec772799dbc2c4fcf7545d2bc9305e27ee))
* **turbo:** take markdown as an input to the test task ([d7b5c5c](https://github.com/awinogradov/code-assistants/commit/d7b5c5cae6ffa7c7d7615663b15cabdcb489076c))
## [2.2.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v2.1.0...code-review-action@v2.2.0) (2026-07-29)

## Release Notes

Two new Linear-integrated planning skills let teams store and execute implementation plans directly on Linear tickets, surviving beyond the session that created them.

## ✨ What's New

### Store Implementation Plans on Linear Tickets

The new `/autopilot:linear-plan` skill writes a scored implementation plan as a structured comment on its Linear ticket, so the plan persists after the session ends. This means a teammate can review and approve the plan before any code is written — closing the gap between "AI drafted a plan" and "everyone knows what we're building."

### Execute Stored Linear Plans Verbatim

The new `/autopilot:linear-run` skill picks up a plan already stored on a Linear ticket and executes it exactly as written. If no stored plan is found, it refuses with a clear, actionable message rather than silently generating a new one — preventing the common situation where an AI quietly substitutes its own interpretation for the agreed plan.

### Higher-Quality Plans Across All Planning Skills

The plan scoring threshold has been raised from 95 to 98, and the revision process now runs up to three passes instead of one. This applies to `/autopilot:plan`, `/autopilot:run`, and `/autopilot:run-primed` as well as the new Linear skills — plans must clear a higher bar before execution proceeds.

<details><summary>Related issues</summary>

- [#497: Add skills to store a plan on a Linear issue and execute it verbatim](https://github.com/awinogradov/code-assistants/issues/497)
- [#498: Store implementation plans on Linear tickets and execute them later](https://github.com/awinogradov/code-assistants/pull/498)
</details>

## 📚 Documentation & Settings Updates

### Linear Plugin README Now Lists All Skills

`/autopilot:linear-create` was missing from the plugin's structure tree and skill list in the README. It's now registered alongside the two new skills, so the documentation accurately reflects every available Linear skill.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #497 | [#498](https://github.com/awinogradov/code-assistants/pull/498) | @awinogradov |

### Features

* **linear:** add linear:plan and linear:run skills ([b9bbfe2](https://github.com/awinogradov/code-assistants/commit/b9bbfe2cce8dd372f342b21768687963bfa5e117))

### Bug Fixes

* **code-review:** assert non-null block in shared block test ([0806812](https://github.com/awinogradov/code-assistants/commit/08068126b9ea16d2b8536b1cd842d2f3b50371ac))
## [2.1.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v2.0.0...code-review-action@v2.1.0) (2026-07-27)

## Release Notes

The action now ships a dedicated strict entry point for sessions that have already completed an explore pass, avoiding redundant repository scanning when context is already known.

## ✨ What's New

### Strict Entry Point for Pre-Primed Sessions

When a review session has already run `/autopilot:explore` and produced a validated context brief, the action can now pick up exactly where explore left off — without re-scanning the repository from scratch. The new `/autopilot:run-primed` skill reads the existing brief directly and skips the repository-standards digest that explore already resolved, making the transition from explore to review faster and more deterministic.

A matching `primed` scope has been added to the context fan-out to support this: when the action detects a primed session, it routes through the leaner path automatically. `/autopilot:run` behaviour is completely unchanged, so existing review workflows are unaffected.

<details><summary>Related issues</summary>

- [#490: Add a strict run path for pre-primed explore sessions](https://github.com/awinogradov/code-assistants/issues/490)
- [#491: Add a strict run path for sessions already primed by explore](https://github.com/awinogradov/code-assistants/pull/491)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #490 | [#491](https://github.com/awinogradov/code-assistants/pull/491) | @awinogradov |

### Features

* **run-primed:** add strict primed-run entry point ([002c8b7](https://github.com/awinogradov/code-assistants/commit/002c8b725293b6bfe8630ebcbaf452912f49325e))
## [2.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.7.2...code-review-action@v2.0.0) (2026-07-25)

## Release Notes

The reviewer bot can now reliably lift its own `CHANGES_REQUESTED` verdict after PR authors address blockers — a pre-checkout `gh` resolution bug that silently disabled re-approval in every react-mode run has been fixed.

## 🐛 Bug Fixes

### Reviewer Bot Never Re-Approved After Blockers Were Addressed

When a PR author addressed a blocker raised by the reviewer bot and replied to the thread, the bot would draft a reply but never actually upgrade its verdict from `CHANGES_REQUESTED` to `APPROVED`. This was happening on every react-mode run in production.

The root cause was three `gh pr view` calls in the action running before `actions/checkout` — at that point there's no `.git` directory yet, so `gh` couldn't resolve the repository from a git remote and failed silently. Because those failures were treated as "bot is not blocking", the re-verdict logic never armed. The fix passes the repository explicitly to all pre-checkout `gh pr view` calls, so the bot's current review state is read correctly before the re-evaluation decision is made.

<details><summary>Related issues</summary>

- [#275: Approve a blocked PR when the reviewer bot agrees its blockers are resolved](https://github.com/awinogradov/code-assistants/issues/275)
</details>

## ✨ What's New

### Faster, Leaner Planning Pass

The autopilot's planning phase has been restructured around a single parallel fan-out. Previously, context was gathered in stages and the AI would ask clarifying questions before it had even read the code. Now all context calls — repo standards, branch diff, issue resolution, TODO search, stack detection, git state — fire in one message. The orchestrator receives compact JSON digests instead of raw documents (README, RFC text, unbounded diffs), which keeps token usage bounded and the human review gate fires only after the code is fully understood.

As a side effect, the branch-diff digest now correctly detects rebase-merged branches via patch equivalence — a gap where a rebase-merged branch was previously read as active in-progress work.

<details><summary>Related issues</summary>

- [#475: Restructure the plan pipeline for context ordering, parallelism, and tokens](https://github.com/awinogradov/code-assistants/issues/475)
</details>

### Cleaner Generated Plan Files

Plan files written by autopilot now read as plain prose describing what will happen, rather than embedding raw `AskUserQuestion` parameters and `Skill(...)` calls. Branch mechanics and autopilot wiring have moved into the skills themselves, so the plan file a developer sees is a readable handoff document rather than internal boilerplate.

<details><summary>Related issues</summary>

- [#481: Keep tool-call boilerplate out of the generated plan file](https://github.com/awinogradov/code-assistants/issues/481)
</details>

### Shared Instruction Blocks Across Autopilot Skills

Duplicated instruction blocks that had drifted across multiple autopilot skills (in some cases into three slightly different wordings) are now consolidated into a single `shared-rules` skill that all others read from. This reduces the risk of instructions going out of sync and makes future updates to shared guidance a one-place change.

<details><summary>Related issues</summary>

- [#479: Extract duplicated instruction blocks from autopilot skills into shared skills](https://github.com/awinogradov/code-assistants/issues/479)
</details>

## ⚠️ Breaking Changes

### PR Quality-Gate Workflow Must Be Named `PR`

This release ships (and then reverts) an experimental `workflow_run`-based trigger for AI review. The revert restores the `pull_request` trigger, but the attempted migration hardcoded the consuming repo's gate workflow name as `PR` because GitHub's `on.workflow_run.workflows` field accepts no expressions. If you adopted the intermediate `workflow_run` configuration from v1.7.x, you need to roll back your `ai-review.yml` to the `pull_request`-based trigger shown in the [README](https://github.com/awinogradov/code-assistants/blob/main/README.md#usage).

Additionally, the `workflow_run` approach dropped review re-triggers on PR title/body edits and `ready_for_review` events, and excluded fork PRs entirely. All of these behaviors are restored by reverting to the `pull_request` trigger.

If you were not on the intermediate `workflow_run` configuration, no action is needed — your setup is already correct.

<details><summary>Related issues</summary>

- [#275: Approve a blocked PR when the reviewer bot agrees its blockers are resolved](https://github.com/awinogradov/code-assistants/issues/275)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #481 | [#482](https://github.com/awinogradov/code-assistants/pull/482) | @awinogradov |
| #479 | [#480](https://github.com/awinogradov/code-assistants/pull/480) | @awinogradov |
| #475 | [#476](https://github.com/awinogradov/code-assistants/pull/476) | @awinogradov |
| #275 | [#473](https://github.com/awinogradov/code-assistants/pull/473) | @awinogradov |

### ⚠ BREAKING CHANGES

* **code-review:** the consuming repo's PR quality-gate workflow must be named `PR` (name:
PR) — on.workflow_run.workflows takes no expression, so the name is hardcoded. Review no
longer re-triggers on a PR edit or ready_for_review, and fork PRs are not reviewed
(actions/checkout refuses a fork head under workflow_run).

### Features

* **code-review:** run review after the pr gate via workflow_run ([504b161](https://github.com/awinogradov/code-assistants/commit/504b1612287b9c45ce41191984cd62016e0dcc82))

### Bug Fixes

* **code-review-action:** resolve repo for pre-checkout gh pr view ([ce6d406](https://github.com/awinogradov/code-assistants/commit/ce6d40602b22d9d93be65421eb6c6abda554749b))

### Reverts

* **code-review:** restore pull_request trigger for ai-review ([5675fcc](https://github.com/awinogradov/code-assistants/commit/5675fcca296b4587dbfdfd1d10014f7d464b87d5))

### Refactoring

* **autopilot:** gather planning context in one fan-out ([a9d78cc](https://github.com/awinogradov/code-assistants/commit/a9d78cc4de0fa98b8d20931851dfa23b038f7a8c))
* **autopilot:** read shared blocks from one skill ([ef961da](https://github.com/awinogradov/code-assistants/commit/ef961daec8afd78a439d7436f371e37651a3bacb))

### Tests

* **plan:** guard plan-file bodies against tool calls ([90436b3](https://github.com/awinogradov/code-assistants/commit/90436b3d300139917f39ac219c8442be6f922155))
## [1.7.2](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.7.1...code-review-action@v1.7.2) (2026-07-18)

## Release Notes

## [1.7.2](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.7.1...code-review-action@v1.7.2) (2026-07-18)

## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #461 | [#462](https://github.com/awinogradov/code-assistants/pull/462) | @awinogradov |

### Documentation

* add principles folder to repository standards docs ([2b495a4](https://github.com/awinogradov/code-assistants/commit/2b495a4924af76b0885dd244bf6a552eb4c1fa5d))


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #461 | [#462](https://github.com/awinogradov/code-assistants/pull/462) | @awinogradov |

### Documentation

* add principles folder to repository standards docs ([2b495a4](https://github.com/awinogradov/code-assistants/commit/2b495a4924af76b0885dd244bf6a552eb4c1fa5d))
## [1.7.1](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.7.0...code-review-action@v1.7.1) (2026-07-13)

## Release Notes

Transient GitHub API errors (502s, 429s) no longer cause the code review action to fail mid-job — requests are now retried automatically with backoff.

## 🐛 Bug Fixes

### Automatic Retry on GitHub API Errors

When GitHub returns a temporary error — such as a `502 Bad Gateway` or a `429 Too Many Requests` — the action previously failed the job outright, requiring a manual re-run. The action now detects these transient responses and retries the request with backoff, so auto-labelling, release-automerge, and code review jobs recover on their own without any intervention.

<details><summary>Related issues</summary>

- [#450: Auto label fails on transient GitHub 502 responses](https://github.com/awinogradov/code-assistants/issues/450)
- [#453: Keep Auto label green when GitHub returns a transient 502](https://github.com/awinogradov/code-assistants/pull/453)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #450 | [#453](https://github.com/awinogradov/code-assistants/pull/453) | @awinogradov |

### Bug Fixes

* retry transient github errors in action clients ([88529bf](https://github.com/awinogradov/code-assistants/commit/88529bfb976a72852df74767604e3276df180786))
## [1.7.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.6.3...code-review-action@v1.7.0) (2026-07-12)

## Release Notes

The AI reviewer's tips are now drawn from your own repository's conventions rather than a fixed pool of generic advice.

## ✨ What's New

### Context-Aware Review Tips

The code review action occasionally surfaces a "review tip" alongside its feedback. Previously these tips came from a static, built-in pool with no connection to your project. Now, when enabled, the action generates the tip dynamically by reading your repository's `CONTRIBUTING.md`, its docs listing, and the changed files in the PR — so the advice is grounded in your own conventions and contribution guidelines. If anything goes wrong during generation (missing file, model error, etc.), the action falls back to the static pool automatically, so reviews are never blocked.

This is opt-in via a new `generate_review_tips` input (see [⚙️ Configuration Required](#️-configuration-required) below).

<details><summary>Related issues</summary>

- [#395: Generate review tips dynamically with a model call and consumer context](https://github.com/awinogradov/code-assistants/issues/395)
- [#416: Generate review tips from the consumer's own repository context](https://github.com/awinogradov/code-assistants/pull/416)
</details>

## ⚙️ Configuration Required

### `generate_review_tips` Input

To opt in to context-aware tip generation, add the new `generate_review_tips` input to your action step:

```yaml
- uses: awinogradov/code-assistants/.github/actions/code-review-action@v1
  with:
    reviewer: ${{ vars.BOT_USERNAME }}
    bot_token: ${{ secrets.BOT_TOKEN }}
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    generate_review_tips: true   # ← add this
```

This is optional and defaults to the previous static-pool behaviour when omitted. When enabled, the action will attempt to read your repo's `CONTRIBUTING.md` and docs structure at review time, so the service account identified by `bot_token` needs read access to repository contents — which the standard `contents: read` permission already covers.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #395 | [#416](https://github.com/awinogradov/code-assistants/pull/416) | @awinogradov |

### Features

* **code-review:** generate review tips from context ([5ee88f1](https://github.com/awinogradov/code-assistants/commit/5ee88f1ed95a4ba4dc65e25044dcc7e9da8f8afa))

### Documentation

* **code-review:** document generated review tips ([b735394](https://github.com/awinogradov/code-assistants/commit/b7353940ebeacc75330c19c24f213dfce9135b60))

### Tests

* **code-review:** cover review tip generation ([d89a20c](https://github.com/awinogradov/code-assistants/commit/d89a20c830d457a774adc0ff0c9e655620b091ff))
## [1.6.3](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.6.2...code-review-action@v1.6.3) (2026-07-10)

## Release Notes

The code review action no longer silently reports success when it times out waiting for CI checks, and no longer crashes on PRs with emoji-heavy content.

## 🐛 Bug Fixes

### Preflight Timeout Now Fails the Check Run

When the code review action times out waiting for other CI checks to complete during preflight, it now correctly fails its own check run instead of silently reporting success. Previously, a timeout would leave the impression that the review passed when it actually never ran, making it easy to miss that no real review had occurred.

### Crash on Emoji-Heavy Pull Requests

Code review runs no longer crash with a "no low surrogate" API error on pull requests that contain a lot of emoji. The crash happened when the review payload was truncated mid-emoji — splitting a surrogate pair — which caused the AI review check to get stuck in a permanent red state. The underlying SDK has been updated to handle this gracefully.

<details><summary>Related issues</summary>

- [#431: code-review-action: verdict crashes with "no low surrogate" when payload truncation splits an emoji surrogate pair](https://github.com/awinogradov/code-assistants/issues/431)
- [#432: Fix code review verdict crash on emoji-heavy pull requests](https://github.com/awinogradov/code-assistants/pull/432)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #431 | [#432](https://github.com/awinogradov/code-assistants/pull/432) | @awinogradov |

### Bug Fixes

* **code-review-action:** upgrade claude-agent-sdk to 0.3.202 ([4ac793b](https://github.com/awinogradov/code-assistants/commit/4ac793b923bd7a02fa05176d5dd9de15fefa083f))
* **code-review:** fail job when preflight checks time out ([b951799](https://github.com/awinogradov/code-assistants/commit/b95179935c31e799499fafa58de33d3e81df81a7))
## [1.6.2](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.6.1...code-review-action@v1.6.2) (2026-07-03)

## Release Notes

Review comment rule-code anchor links now navigate directly to the correct rule section instead of dropping readers at the top of the document.

## 🐛 Bug Fixes

### Rule-Code Anchor Links Navigate to the Correct Section

When the AI reviewer references a specific rule in its comments (e.g. `check-naming` or `check-complexity`), the link now jumps directly to that rule's anchor in the rules document. Previously, these links were broken — they resolved to the top of the document regardless of which rule was cited, forcing readers to manually search for the relevant section. All rule-code links in both review comments and reply threads are now fixed.


### Bug Fixes

* **code-review:** lowercase check-* link fragments in review output ([976f0e1](https://github.com/awinogradov/code-assistants/commit/976f0e1cf70002069410b2d0de68ddfb4994648c))
## [1.6.1](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.6.0...code-review-action@v1.6.1) (2026-07-03)

## Release Notes

Dependabot PRs now pass validation checks automatically instead of failing, eliminating false-positive review failures on automated dependency updates.

## 🐛 Bug Fixes

### Dependabot PRs No Longer Fail Validation

Previously, Dependabot's automated dependency update PRs would fail the Contributing checks (branch name, commit message, and PR title validation) and trigger the AI Code Review workflow, causing noise and requiring manual intervention. Both checks now recognize Dependabot as an automated author and skip gracefully, so dependency updates flow through without generating false failures.

### Linked File and Doc References in Review Comments

AI code review comments now render file paths, documentation references, and RFC mentions as clickable links throughout the full comment body and summary — not just at the finding's source location. This makes it easier to navigate directly from a review finding to the relevant file or spec without having to hunt for it manually.


### Bug Fixes

* **actions:** skip dependabot pull requests in checks ([4e82a92](https://github.com/awinogradov/code-assistants/commit/4e82a92da5212a90a351fc85b7e74560a3916852))

### Tests

* **code-review:** guard no-line review body mentions ([06d4029](https://github.com/awinogradov/code-assistants/commit/06d40291a029a2fe8688d00df0f7137f81d8527e))

### CI

* **deps:** bump the github-actions group across 6 directories with 4 updates ([ea89dd2](https://github.com/awinogradov/code-assistants/commit/ea89dd248da6da72d90d1cfcaa36e2b415f356ee))
## [1.6.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.5.0...code-review-action@v1.6.0) (2026-07-02)

## Release Notes

The default AI review model is now Claude Sonnet 5, delivering sharper analysis out of the box alongside a set of quality and presentation improvements across review output.

## ✨ What's New

### Upgraded Default Model: Claude Sonnet 5

AI code reviews now run on Claude Sonnet 5 by default, with no configuration changes required. Teams that need to pin a specific model can still do so using the `model` input on the action. Expect noticeably more accurate and detailed review findings from this release onward.

<details><summary>Related issues</summary>

- [#392: Switch the code review default model to Claude Sonnet 5](https://github.com/awinogradov/code-assistants/issues/392)
</details>

### Repository RFC and Docs Standards Enforcement

The AI reviewer now reads a repository's own `rfc/` and `docs/` folders and enforces their conventions as part of every review. Violations of Accepted RFCs are flagged as blocking findings; conflicts with Draft RFCs or contradictions of documented conventions surface as suggestions. Two new RFC hygiene checks are also active: editing an Accepted RFC without a version bump is flagged, as is an RFC that is missing from the `rfc/README.md` index. Repositories that have no `rfc/` or `docs/` folders see no change in review behavior or cost.

<details><summary>Related issues</summary>

- [#403: Enforce consumer rfc/ and docs/ standards in code review](https://github.com/awinogradov/code-assistants/issues/403)
</details>

### Rotating Usage Tips (Occasional, Non-Repeating)

Roughly 1 in 20 reviews now includes a single rotating usage tip at the end of the comment. The tip pool is tracked per pull request so the same tip never appears twice on the same PR. Clean approvals never carry a tip. Duplicate-review suppression is unaffected. This replaces the static "ask the reviewer" hint that previously appeared on every review comment.

<details><summary>Related issues</summary>

- [#389: Show a random tip in 5% of AI review comments, never repeated within a PR](https://github.com/awinogradov/code-assistants/issues/389)
</details>

### Clickable References in Review Output

All file paths, doc references, RFC citations, Linear/GitHub tracker IDs, and fixing commit SHAs in generated review comments and PR bodies now render as real, clickable links rather than backticked dead text or bare hashes. File and doc references resolve to permalinks at the reviewed commit. This applies to both new reviews and reply comments from the `react` mode.

<details><summary>Related issues</summary>

- [#279: Apply RFC-0001 formatting to generated PR descriptions and release notes](https://github.com/awinogradov/code-assistants/issues/279)
- [#387: PR bodies and review replies still emit unlinked references violating RFC-0001](https://github.com/awinogradov/code-assistants/issues/387)
</details>

## 🐛 Bug Fixes

### Garbled Line Breaks in Review Comments

Review comments were rendering literal `\n` escape sequences instead of actual line breaks, making multi-point findings hard to read. Formatting now renders correctly in all review comment bodies.

### Repeated "Ask the Reviewer" Footer Removed

The static usage hint that appeared at the bottom of every review comment has been removed. That guidance now surfaces only through the rotating tip pool described above, keeping review footers clean and focused.

<details><summary>Related issues</summary>

- [#389: Show a random tip in 5% of AI review comments, never repeated within a PR](https://github.com/awinogradov/code-assistants/issues/389)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #389 | [#408](https://github.com/awinogradov/code-assistants/pull/408) | @awinogradov |
| #279 | [#406](https://github.com/awinogradov/code-assistants/pull/406) | @awinogradov |
| #403 | [#404](https://github.com/awinogradov/code-assistants/pull/404) | @awinogradov |
| #392 | [#394](https://github.com/awinogradov/code-assistants/pull/394) | @awinogradov |
| #387 | [#388](https://github.com/awinogradov/code-assistants/pull/388) | @awinogradov |

### Features

* **autopilot:** enforce repo rfc and docs standards in review ([1348297](https://github.com/awinogradov/code-assistants/commit/13482974363e8355dc488a23b1cfb61f51c8b6a1))
* **code-review-action:** show random tip in 5% of reviews ([f7f8401](https://github.com/awinogradov/code-assistants/commit/f7f84015cbda9f5f8d7759b7a628158b877175f0))
* **code-review:** switch default model to sonnet 5 ([1f8cb99](https://github.com/awinogradov/code-assistants/commit/1f8cb999486f34f091532930ef7718f9655773dc))

### Bug Fixes

* **code-review-action:** drop always-on usage hint from review footer ([c279ab2](https://github.com/awinogradov/code-assistants/commit/c279ab243134259228e2a72a6809d4d71c08bfd8))
* **code-review:** repair over-escaped newlines in review bodies ([1c2c653](https://github.com/awinogradov/code-assistants/commit/1c2c6539e580c484a1995409bd5d2ffe71f4f7bc))

### Tests

* **code-review:** guard linked review body references ([9a802f6](https://github.com/awinogradov/code-assistants/commit/9a802f67047e8c08846c526a640667b3c07110e4))
* guard linked reference forms in skills ([078b9ed](https://github.com/awinogradov/code-assistants/commit/078b9ed55d08bfd223564605726322772fb80472))
## [1.5.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.4.1...code-review-action@v1.5.0) (2026-06-26)

## Release Notes

The biggest change in this release is the new plugin and marketplace system, which lets you point the code reviewer at custom skills from your own repositories without forking the action.

## ✨ What's New

### Custom Review and React Prompts

The code-review action now accepts `review_prompt` and `react_prompt` inputs, so you can run a completely different skill for review or comment-reply without forking or modifying the action itself. The defaults are unchanged, so existing deployments continue to work as-is.

<details><summary>Related issues</summary>

- [#349: Make the code-review-action review prompt a configurable action input](https://github.com/awinogradov/code-assistants/issues/349)
</details>

### Plugin Marketplaces Support

Two new inputs — `marketplaces` and `plugins` — let a workflow register any plugin source and install specific plugins before the review runs. This is what makes `review_prompt`/`react_prompt` point at consumer-owned skills (like `/platform:pr-review`) work in practice. Without this, the SDK would run in cache-only mode and fail with "Unknown command" for any skill not bundled with autopilot.

`marketplaces` takes one `name=source` entry per line, where the source can be the checked-out repo (`.`), a GitHub repo (`owner/repo[@ref]`), a URL, or an npm package. `plugins` takes one `plugin@marketplace` entry per line.

Example configuration for a consumer workflow:

```yaml
with:
  review_prompt: "/platform:pr-review"
  react_prompt: "/platform:pr-react"
  marketplaces: |
    platform-engineering=.
  plugins: |
    platform@platform-engineering
```

### Private Plugin Marketplace Authentication

When a `marketplaces` entry points at a private GitHub repository, the SDK now has a git credential helper configured before it attempts to clone the plugin source. Previously, with no SSH key in CI, the clone would fail with an authentication error. The action uses the existing `bot_token` to set up credentials, so no additional secrets are needed.

<details><summary>Related issues</summary>

- [#336: Add pdf:create autopilot skill for beautiful, brand-themed PDFs](https://github.com/awinogradov/code-assistants/issues/336)
</details>

### Custom Anthropic Host / Gateway Support

The action now accepts two optional inputs — `anthropic_base_url` and `anthropic_auth_token` — for routing API calls through a proxy, gateway, or any Anthropic-compatible endpoint. `anthropic_auth_token` covers hosts that use a bearer token instead of the standard `x-api-key` header. When neither input is set, behaviour is identical to before.

<details><summary>Related issues</summary>

- [#27: Support a custom Anthropic host (base URL) for SDK-backed actions](https://github.com/awinogradov/code-assistants/issues/27)
</details>

## 🐛 Bug Fixes

### Bot-Authored PRs Are Now Fully Skipped

The reviewer previously only skipped PRs with a `ci-skip-review` label when a bot authored them. It now skips every PR authored by the configured bot, which prevents unnecessary review runs on automated PRs (dependency updates, release commits, etc.).

<details><summary>Related issues</summary>

- [#339: Support Linear as an issue tracker across the autopilot skills](https://github.com/awinogradov/code-assistants/issues/339)
</details>

### PR Author Passed Correctly to Comment-Reply Flow

When the action responded to a PR comment (the `react` mode), it wasn't passing the PR author's login to the reply skill. This could produce replies that misidentified or omitted the original author. The author context is now correctly forwarded.

<details><summary>Related issues</summary>

- [#347: Autopilot review replies show CHECK rule codes as bare text instead of links](https://github.com/awinogradov/code-assistants/issues/347)
</details>

### Rule Codes in Review Replies Now Link to Their Definitions

When the autopilot replied to a review thread, `CHECK-` rule codes appeared as plain text. They now render as clickable links to their rule definition, matching the behaviour already present in main review comments.

<details><summary>Related issues</summary>

- [#347: Autopilot review replies show CHECK rule codes as bare text instead of links](https://github.com/awinogradov/code-assistants/issues/347)
</details>

### "Ask the Reviewer" Tip Removed from Clean Approvals

A usage-hint tip ("you can ask the reviewer…") was being appended to approval reviews even when there were no issues at all, which looked out of place on a clean pass. Approvals with no findings no longer include it.

### Settings File Now Validated Before Being Applied

The action validates the repo's settings JSON with a strict schema check before merging it with action defaults. Previously a malformed settings file could cause silent misconfiguration; now it produces a clear error early in the run.

## ⚙️ Configuration Required

### `review_prompt` (Optional)

The skill command the action runs for pull request reviews. Defaults to the current built-in autopilot review skill. Set this if you want to use a custom or team-specific review skill from your own plugin.

### `react_prompt` (Optional)

The skill command the action runs when replying to a PR comment. Defaults to the current built-in autopilot reply skill. Set this alongside `review_prompt` when switching to a custom skill set.

### `marketplaces` (Optional)

A newline-separated list of `name=source` entries declaring plugin marketplaces the action should register before running. Required when `plugins` or your custom prompts reference skills that aren't part of the bundled autopilot plugin.

### `plugins` (Optional)

A newline-separated list of `plugin@marketplace` entries declaring which plugins to install. The marketplace name must match an entry in `marketplaces`. Consumers with no custom plugins are unaffected — this is a no-op when left unset.

### `anthropic_base_url` (Optional)

The base URL for the Anthropic SDK client. Leave unset to use the standard Anthropic API. Set this when routing through an internal gateway or a compatible third-party endpoint.

### `anthropic_auth_token` (Optional)

A bearer token used instead of `x-api-key` for hosts that require it. Only needed alongside `anthropic_base_url` when the target endpoint uses bearer-token authentication.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #347 | [#351](https://github.com/awinogradov/code-assistants/pull/351) | @awinogradov |
| #349 | [#350](https://github.com/awinogradov/code-assistants/pull/350) | @awinogradov |
| #340 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #341 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #342 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #339 | [#346](https://github.com/awinogradov/code-assistants/pull/346) | @awinogradov |
| #336 | [#337](https://github.com/awinogradov/code-assistants/pull/337) | @awinogradov |
| #334 | [#335](https://github.com/awinogradov/code-assistants/pull/335) | @awinogradov |
| #27 | [#326](https://github.com/awinogradov/code-assistants/pull/326) | @awinogradov |

### Features

* **code-review-action:** add review_prompt and react_prompt inputs ([d4f4158](https://github.com/awinogradov/code-assistants/commit/d4f415868b87c66ad2fa14c6147b040a4400afc6))
* **code-review:** add plugins and marketplaces inputs ([67d38d6](https://github.com/awinogradov/code-assistants/commit/67d38d6f0bacf19ba04a2179708ed61f0abeccbd))
* support custom anthropic host for sdk ([3f53bde](https://github.com/awinogradov/code-assistants/commit/3f53bde9f8dab8fabfa3f08c30addeac1bd8b097))

### Bug Fixes

* **autopilot:** link rule codes in review replies ([657d8e0](https://github.com/awinogradov/code-assistants/commit/657d8e03f606d853b2fd4f1c46ba18aba09a7d70))
* **code-review-action:** pass author login to react step prompt ([318282a](https://github.com/awinogradov/code-assistants/commit/318282a6368c3224edf7a22908f77181d9cc1c5d))
* **code-review:** authenticate git for private plugin marketplaces ([9263bbe](https://github.com/awinogradov/code-assistants/commit/9263bbe5bdae2d8e9eb1e67e26b39c2f6787f2c1))
* **code-review:** drop usage-hint tip on clean approvals ([4f23ef7](https://github.com/awinogradov/code-assistants/commit/4f23ef78aa6c8a48d56cb79e8d7473a53efb091d))
* **code-review:** install enabled plugins in headless review ([842e7d9](https://github.com/awinogradov/code-assistants/commit/842e7d976a069c1dc0cbe4294634cba4893a3029))
* **code-review:** skip ai review for all bot-authored prs ([a980413](https://github.com/awinogradov/code-assistants/commit/a98041330877fc8b1dc4bd8a7176a84f2c3dec5d))
* **code-review:** validate settings json with zod before merge ([5cbb209](https://github.com/awinogradov/code-assistants/commit/5cbb2093af948ebfcd9e6df26a21edfecd3bff37))

### Documentation

* **code-review-action:** document review_prompt and react_prompt inputs ([c9c92a7](https://github.com/awinogradov/code-assistants/commit/c9c92a7a9d098d836f4d928cd61010f46c210975))
* document anthropic base-url and auth inputs ([f902894](https://github.com/awinogradov/code-assistants/commit/f902894ab4c791545b720152ee8d730485584b4a))

### Refactoring

* share anthropic auth-exclusion guard ([d207c07](https://github.com/awinogradov/code-assistants/commit/d207c070410ff1081c142255c4615a33a656b6a1))

### Tests

* **code-review-action:** assert prompt input defaults and wiring ([a3a4cc0](https://github.com/awinogradov/code-assistants/commit/a3a4cc09cf227344cf6483b9ea74a007e8a63771))
* **code-review:** add linear:create to format guard ([8eb1228](https://github.com/awinogradov/code-assistants/commit/8eb1228f35e001f59afb4e0adefd38d9cf30d0f1))
* **code-review:** cover blank name and unresolved source skips ([c0414e6](https://github.com/awinogradov/code-assistants/commit/c0414e6e84912a9f205537f523c215f682511839))
* **code-review:** guard link resolution ([591330a](https://github.com/awinogradov/code-assistants/commit/591330a4a2a2f116ace34d02967b4f1f16510461))
* **code-review:** skip node_modules in link walk ([1208232](https://github.com/awinogradov/code-assistants/commit/120823228f998782643d510d65ba8887ad0b8094))
* cover sdk env and client-option helpers ([0a669d0](https://github.com/awinogradov/code-assistants/commit/0a669d01bb5c27bf51a250a18b244822c6fcf637))
## [1.4.1](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.4.0...code-review-action@v1.4.1) (2026-06-15)

## Release Notes

Documentation callouts and AI review footer hints now render as native GitHub alerts for better visibility.

## ✨ What's New

### Native GitHub alerts for documentation
Documentation callouts throughout the contributing guides and action READMEs now use GitHub's alert syntax instead of custom formatting. These render as proper colored alert boxes on GitHub, making important information more visible and consistent with GitHub's design language.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>

## 🐛 Bug Fixes

### AI review footer displays as GitHub tip
The usage hint at the bottom of AI code reviews now appears as a native GitHub "Tip" alert instead of plain text. This makes the instructions for interacting with the review bot more noticeable and visually consistent with GitHub's UI patterns.

<details><summary>Related issues</summary>

- [#315: Use GitHub tip formatting](https://github.com/awinogradov/code-assistants/issues/315)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #315 | [#316](https://github.com/awinogradov/code-assistants/pull/316) | @awinogradov |

### Bug Fixes

* **code-review-action:** render footer hint as github tip alert ([3d7ea5a](https://github.com/awinogradov/code-assistants/commit/3d7ea5a4bf9e3c8c476fcbf5f68ea14ebbd46e55))

### Documentation

* adopt github alert syntax for callouts ([151e57b](https://github.com/awinogradov/code-assistants/commit/151e57bd2694b5df626833d3243cdded6f77eef9))
## [1.4.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.3.0...code-review-action@v1.4.0) (2026-06-13)

## Release Notes

Review run metrics now travel in machine-readable comments, making cost monitoring resilient to format changes while footers show model details in cleaner, smaller text.

## ✨ What's New

### Review Cost Monitoring Protection
The code review cost monitor no longer breaks when repositories have few reviews or when footer formats change. Instead of parsing visible footers, it now reads metrics from dedicated machine-readable comments that survive any visual redesign. This ensures your cost monitoring stays operational regardless of how review footers evolve.

<details><summary>Related issues</summary>

- [#305: Cost-monitor can't distinguish footer drift from insufficient footer history](https://github.com/awinogradov/code-assistants/issues/305)
</details>

### Model Transparency in Review Summaries
Each code review now displays which Claude model served the request in the run summary table. This helps teams track model usage patterns and understand performance variations between different AI models.

### Cleaner Review Footer Design
Review run summaries now render in smaller text, keeping the visual focus on the actual review findings while still providing all the metrics your team needs. The table remains fully parseable for automated monitoring tools.

<details><summary>Related issues</summary>

- [#281: Use smaller text for the review run summary footer](https://github.com/awinogradov/code-assistants/issues/281)
</details>

## 📚 Documentation & Settings Updates

### Updated Documentation Links
All documentation links throughout the codebase have been updated to reflect the new chapter-based documentation structure. This affects README files and inline code documentation (JSDoc comments), ensuring all references point to the correct locations.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #305 | [#306](https://github.com/awinogradov/code-assistants/pull/306) | @awinogradov |
| #281 | [#298](https://github.com/awinogradov/code-assistants/pull/298) | @awinogradov |

### Features

* add model row to the run-summary table ([4f62199](https://github.com/awinogradov/code-assistants/commit/4f62199589049647bf9bc078039c671a2d080615))
* **code-review:** add run-summary data comment ([18d9e3e](https://github.com/awinogradov/code-assistants/commit/18d9e3e42774130901b2cc63c216f69824b5c05c))
* wrap run-summary table cells in <sub> ([3f56272](https://github.com/awinogradov/code-assistants/commit/3f562722e63348091a0520464e11c85173a0a0ca))

### Reverts

* wrap run-summary table cells in <sub> ([21475ee](https://github.com/awinogradov/code-assistants/commit/21475ee21219061dd1d6a76f4bb248864cde1915))

### Documentation

* update doc links in readmes and jsdoc ([8e468d2](https://github.com/awinogradov/code-assistants/commit/8e468d230fa333803a85665f0d26757c13e1350d))
## [1.3.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.2.0...code-review-action@v1.3.0) (2026-06-08)

## Release Notes

Code review action now explains AI review failures with direct links to check logs and automatically approves PRs when requested changes are addressed.

## ✨ What's New

### Smarter review failure explanations
When the AI can't review your PR, you'll now get a detailed explanation with direct links to the failing check logs. The comment includes a clear summary of what went wrong, making it easy for your team to troubleshoot without digging through workflows.

<details><summary>Related issues</summary>

- [#280: Add check log links and an AI failure summary to the code-review skip comment](https://github.com/awinogradov/code-assistants/issues/280)
</details>

### Multi-line findings stay in context
Review findings that span multiple lines now remain inline with your code even when they cross gaps in the diff. If a finding still needs to move to the main review body, it includes the suggested fix so you don't have to scroll back to the code to understand the recommendation.

<details><summary>Related issues</summary>

- [#265: Keep multi-line findings inline when their range crosses a hunk gap](https://github.com/awinogradov/code-assistants/issues/265)
</details>

### Concise AI agent prompts
The "Prompt for AI agents" blocks in reviews are now copy-paste ready with focused context. Instead of including entire code hunks and review formatting, they show just the relevant diff window and clean instructions that AI agents can directly process.

<details><summary>Related issues</summary>

- [#258: Make the "Prompt for AI agents" review block concise and prompt-shaped](https://github.com/awinogradov/code-assistants/issues/258)
</details>

### Standardized reference formatting
All generated PR descriptions, release notes, and review comments now follow a consistent reference formatting standard. Commit SHAs are always linked, RFC references point to stable versioned documents, and section anchors work reliably within the same document.

<details><summary>Related issues</summary>

- [#279: Apply RFC-0001 formatting to generated PR descriptions and release notes](https://github.com/awinogradov/code-assistants/issues/279)
- [#259: Apply RFC-0001 reference formatting to PR review replies and comments](https://github.com/awinogradov/code-assistants/issues/259)
</details>

## 🐛 Bug Fixes

### Automatic approval when changes are addressed
The review bot now properly approves PRs when an author confirms they've addressed the requested changes and the bot agrees. Previously, the bot would acknowledge the fix in a comment but leave its blocking review status unchanged, requiring manual intervention or a "re-review" command.

<details><summary>Related issues</summary>

- [#275: Approve a blocked PR when the reviewer bot agrees its blockers are resolved](https://github.com/awinogradov/code-assistants/issues/275)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #280 | [#285](https://github.com/awinogradov/code-assistants/pull/285) | @awinogradov |
| #265 | [#283](https://github.com/awinogradov/code-assistants/pull/283) | @awinogradov |
| #279 | [#282](https://github.com/awinogradov/code-assistants/pull/282) | @awinogradov |
| #275 | [#278](https://github.com/awinogradov/code-assistants/pull/278) | @awinogradov |
| #259 | [#268](https://github.com/awinogradov/code-assistants/pull/268) | @awinogradov |
| #258 | [#269](https://github.com/awinogradov/code-assistants/pull/269) | @awinogradov |

### Features

* **code-review-action:** bound prompt context and strip finding chrome ([e9dfc97](https://github.com/awinogradov/code-assistants/commit/e9dfc972cd2ce99df23012a1cb874ef5e6672ff2))
* **code-review-action:** clamp out-of-diff finding ranges ([707d105](https://github.com/awinogradov/code-assistants/commit/707d1050b75b2e29b2592c907c0650f08e69b3df))
* **code-review-action:** reuse review engine for skip reasons ([f62cc9c](https://github.com/awinogradov/code-assistants/commit/f62cc9cad7b2f78a188904712a1beb273bf0dbeb))

### Bug Fixes

* **code-review-action:** arm re-verdict on author ack ([3eb4bd2](https://github.com/awinogradov/code-assistants/commit/3eb4bd2dcf54c88605226f72b746e88b0c807ec5))
* **code-review-action:** drop incomplete html-comment sanitizer regex ([053891b](https://github.com/awinogradov/code-assistants/commit/053891bdd62f3833b957f46fca0b15deae7615dc))

### Refactoring

* **code-review-action:** simplify explain prompt building ([67bf3f9](https://github.com/awinogradov/code-assistants/commit/67bf3f9de93325241be5985d0ab1ce1775e906da))

### Tests

* **code-review-action:** cover reused-engine skip flow ([fb3ded5](https://github.com/awinogradov/code-assistants/commit/fb3ded59b50abcb4147b8c9845938e0163ac1aeb))
* **code-review-action:** guard reply formatting ([1559a23](https://github.com/awinogradov/code-assistants/commit/1559a234f6a9ac0e6fbc97cc3843662edf9381c9))
* **code-review:** guard pr body reference formatting ([eada5e0](https://github.com/awinogradov/code-assistants/commit/eada5e0ff592428077d8244ad58b9439c555881e))
## [1.2.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.1.0...code-review-action@v1.2.0) (2026-06-04)

## Release Notes

The AI code reviewer no longer edits PR descriptions, providing cleaner workflows and more accurate review status tracking.

## ✨ What's New

### Reference formatting standard
All generated output — from code reviews to release notes — now follows a documented standard for formatting references. File names appear in backticks (`example.ts`), commits and RFCs link to stable URLs that won't break when files move, and issue references use full descriptive links. This ensures your team can always resolve references to their sources.

<details><summary>Related issues</summary>

- [#246: Version the reference-formatting standard as a stable RFC](https://github.com/awinogradov/code-assistants/issues/246)
- [#236: Standardize reference formatting and readability in generated output](https://github.com/awinogradov/code-assistants/issues/236)
</details>

### Enhanced code review context
The AI reviewer now gathers comprehensive project context before analyzing pull requests, including project documentation (`CLAUDE.md`, `README`), related TODOs, and domain-specific standards. Reviews also load prior inline comments to provide accurate follow-up feedback. The reviewer performs 14 distinct checks covering task alignment, dead code detection, input validation, and platform-specific standards for logging, documentation, and service integration.

<details><summary>Related issues</summary>

- [#233: Improve the code review skill: context parity, inline history, and rule checks](https://github.com/awinogradov/code-assistants/issues/233)
</details>

## 🐛 Bug Fixes

### Cleaner PR workflows without description edits
The AI reviewer no longer adds "Available commands" footers to pull request descriptions. Instead, usage instructions appear directly in the review comment where they're more discoverable. This eliminates duplicate review runs and ensures the review status accurately reflects whether a review was posted — no more "skipped" status when a review actually ran.

<details><summary>Related issues</summary>

- [#245: Drop the code-review-action PR-body footer that self-triggers reviews](https://github.com/awinogradov/code-assistants/issues/245)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #245 | [#252](https://github.com/awinogradov/code-assistants/pull/252) | @awinogradov |
| #246 | [#249](https://github.com/awinogradov/code-assistants/pull/249) | @awinogradov |
| #236 | [#237](https://github.com/awinogradov/code-assistants/pull/237) | @awinogradov |
| #233 | [#234](https://github.com/awinogradov/code-assistants/pull/234) | @awinogradov |

### Features

* **rfc:** version the reference-formatting standard ([cdd6c04](https://github.com/awinogradov/code-assistants/commit/cdd6c042605c3f28cd4b3299fa61bcec6a4f8c64))

### Bug Fixes

* **code-review:** remove pr-body help footer ([bab0546](https://github.com/awinogradov/code-assistants/commit/bab0546152c8040ef1b3febfec39a4b78d36b625))
* **code-review:** stop bot self-edit from skipping ai-review ([17666fc](https://github.com/awinogradov/code-assistants/commit/17666fc51904d234f7016f16409ad573fd1dde87))

### Tests

* **code-review:** add ref-format drift guard ([a846a41](https://github.com/awinogradov/code-assistants/commit/a846a411601aec37d2a2a834f96239002564f9c8))
* **code-review:** rescope rules_doc_url check ([4f3b7e0](https://github.com/awinogradov/code-assistants/commit/4f3b7e0a48444a1cbdf36e9999b59b3d01bec947))

### CI

* **code-review:** allow read-only gh api gets ([3259a63](https://github.com/awinogradov/code-assistants/commit/3259a630c47bec7323d581cbb34168914856b2d6))
## [1.1.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v1.0.0...code-review-action@v1.1.0) (2026-06-01)

## Release Notes

Code review findings now include one-click fix suggestions and AI-agent prompts for easier remediation.

## ✨ What's New

### One-click fix suggestions in code reviews
The AI code reviewer now generates GitHub suggestion blocks that let you apply proposed fixes with a single click. Whether it's a typo, a missing import, or a logic improvement, you can accept the suggestion directly from the PR interface without manual editing. Both single-line and multi-line suggestions are supported.

<details><summary>Related issues</summary>

- [#217: Add one-click suggestions and AI-agent prompts to code review comments](https://github.com/awinogradov/code-assistants/issues/217)
</details>

### AI-agent prompts for complex findings
Each code review finding now includes a collapsible "Prompt for AI agents" section. This gives AI coding assistants like GitHub Copilot or Cursor the full context they need to understand and fix the issue. The prompt includes the specific finding details and surrounding code diff, making it easy to get targeted help for more complex problems that can't be fixed with a simple suggestion.

<details><summary>Related issues</summary>

- [#217: Add one-click suggestions and AI-agent prompts to code review comments](https://github.com/awinogradov/code-assistants/issues/217)
</details>

## 📚 Documentation & Settings Updates

### Inline suggestions documentation
The README now includes documentation about the new inline suggestion feature, explaining how the code review action generates one-click fixes and AI-agent prompts within review comments.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #217 | [#218](https://github.com/awinogradov/code-assistants/pull/218) | @awinogradov |

### Features

* **code-review:** add suggestion and agent blocks ([18de884](https://github.com/awinogradov/code-assistants/commit/18de8845ebc8a0b3b9df3590324794b12e807143))

### Documentation

* **code-review:** document inline suggestions ([93273dc](https://github.com/awinogradov/code-assistants/commit/93273dc151abb0a664748453db0a5ec1a201cde1))

### Tests

* **code-review:** cover suggestion rendering and ranges ([f0c3394](https://github.com/awinogradov/code-assistants/commit/f0c339435ecd38d4f6947b8aeadfbcb3e4fd8349))

### CI

* **code-review:** add suggestion fields to schema ([9f35aa9](https://github.com/awinogradov/code-assistants/commit/9f35aa961b2aee7bd369a3cdfd5870b499bbd7bf))
## [1.0.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v0.3.0...code-review-action@v1.0.0) (2026-05-31)

## Release Notes

Major improvements to AI code review speed and reliability, with transparent run metrics on every review.

## ✨ What's New

### Single-pass code review architecture
AI code reviews now complete in one efficient pass, eliminating the multi-agent fan-out that could leave empty reviews when sub-agents failed. The system processes the entire pull request at once, providing more consistent and reliable results.

<details><summary>Related issues</summary>

- [#177: Simplify code-review-action to one pr:review pass with anchored rule links](https://github.com/awinogradov/code-assistants/issues/177)
- [#174: Code-review fan-out fails: all review sub-agents return no findings object](https://github.com/awinogradov/code-assistants/issues/174)
- [#161: Phase 6: cut code review per-agent and aggregation latency](https://github.com/awinogradov/code-assistants/issues/161)
</details>

### Review run metrics in every comment
Each AI review now includes detailed performance metrics in a collapsible footer, showing exactly how much the review cost, how long it took, token usage, and cache efficiency. This transparency helps teams track AI usage costs and identify performance bottlenecks.

<details><summary>Related issues</summary>

- [#162: Include the per-run summary report in the footer (under the cut) of every review comment](https://github.com/awinogradov/code-assistants/issues/162)
</details>

### Smart rule code linking
Code review findings now generate proper markdown links to rule documentation directly, without post-processing. Each CHECK-* rule code links straight to its detailed explanation in the skill documentation.

<details><summary>Related issues</summary>

- [#179: Generate CHECK rule links inside the review skill instead of a resolver script](https://github.com/awinogradov/code-assistants/issues/179)
</details>

## 🐛 Bug Fixes

### Clear feedback on clean pull requests
When the AI approves a PR with no issues, it now posts a clear "✅ No issues found." message alongside the metrics footer, instead of what appeared to be an empty or broken review containing only statistics.

<details><summary>Related issues</summary>

- [#196: Code review posts a stats-only comment on clean approvals](https://github.com/awinogradov/code-assistants/issues/196)
</details>

### Accurate token usage reporting
The run summary now correctly shows total input tokens including cached content, fixing the previously implausible near-zero values that made cost tracking unreliable.

<details><summary>Related issues</summary>

- [#175: Revalidate run-summary metrics: implausible token counts and likely undercounted cost](https://github.com/awinogradov/code-assistants/issues/175)
</details>

### Review metrics footer deployment
The PR help footer containing review metrics now posts correctly instead of failing silently due to missing environment configuration.

## ⚠️ Breaking Changes

### Removed configuration options
The `parallel_fanout` and `review_model_overrides` action inputs have been removed as part of the single-pass architecture. If you were using these inputs to customize review behavior, remove them from your workflow configuration. The new single-pass system provides better performance without requiring these options.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #196 | [#197](https://github.com/awinogradov/code-assistants/pull/197) | @awinogradov |
| #179 | [#180](https://github.com/awinogradov/code-assistants/pull/180) | @awinogradov |
| #177 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #174 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #175 | [#178](https://github.com/awinogradov/code-assistants/pull/178) | @awinogradov |
| #161 | [#169](https://github.com/awinogradov/code-assistants/pull/169) | @awinogradov |
| #162 | [#168](https://github.com/awinogradov/code-assistants/pull/168) | @awinogradov |

### ⚠ BREAKING CHANGES

* **code-review:** removed the parallel_fanout and review_model_overrides action inputs

### Features

* **code-review:** add per-run summary footer to review comments ([0a169d4](https://github.com/awinogradov/code-assistants/commit/0a169d4275bda84db4a0740b06c56dfe7d7c94aa))

### Bug Fixes

* **code-review:** log agent errors and flatten aggregation loop ([47937cf](https://github.com/awinogradov/code-assistants/commit/47937cfddfec97f3fce836099dce395fe490bfe2))
* **code-review:** pass reviewer env to footer step ([e95d144](https://github.com/awinogradov/code-assistants/commit/e95d14417fa620aaba87f44248f2d35d08dcf27c))
* **code-review:** post a no-issues line on clean approvals ([6c03c51](https://github.com/awinogradov/code-assistants/commit/6c03c5126be8064ddcff5cf92c1fdaffefd8aeae))

### Performance

* **code-review:** aggregate findings in code via structured output ([4b53af9](https://github.com/awinogradov/code-assistants/commit/4b53af9c77da054ffe0a7e0fd583c352fb560416))

### Documentation

* **code-review:** document run-summary footer flow ([776741f](https://github.com/awinogradov/code-assistants/commit/776741f53e76baa31d66cd19fb13c33d99a80b69))

### Refactoring

* **code-review:** build rule-code links in the review skill ([db457ff](https://github.com/awinogradov/code-assistants/commit/db457ff08007ad0cb3c73f0155cc76ea30d041f5))
* **code-review:** extract shared marked-details footer builder ([8665adb](https://github.com/awinogradov/code-assistants/commit/8665adbddb0cfa2e08faacbdfe4a2017b693b851))
* **code-review:** replace fan-out with single-pass review skill ([44b3c98](https://github.com/awinogradov/code-assistants/commit/44b3c9836414a2d3fcff57308d6312fa03b0520f))
* **code-review:** simplify finding sort and cover fanout paths ([5107033](https://github.com/awinogradov/code-assistants/commit/510703378b326f9bed5cb63d56f96c7bc791f5f8))

### Tests

* **code-review:** cover run-summary footer and fan-out stats ([13b4ba6](https://github.com/awinogradov/code-assistants/commit/13b4ba6837fd830ffb18848ba341b7c543c8cb25))

### CI

* **code-review:** pass run_summary output to submit review step ([7f6b3e7](https://github.com/awinogradov/code-assistants/commit/7f6b3e73cb4c9bae64471616e2cd493845df2c3c))
## [0.3.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v0.2.0...code-review-action@v0.3.0) (2026-05-29)

## Release Notes

The code review action now runs faster and smarter, with specialized security reviews and detailed performance tracking.

## ✨ What's New

### Security and performance review agents
Code reviews now include dedicated security checks that catch common vulnerabilities like hardcoded secrets, SQL injection risks, and insecure cryptography usage. Performance reviews also flag inefficient algorithms and resource leaks. You can customize which AI model handles each type of review through the new `review_model_overrides` configuration.

<details><summary>Related issues</summary>

- [#148: Right-size review model tiers and add security/performance review checks](https://github.com/awinogradov/code-assistants/issues/148)
</details>

### Performance instrumentation
Each code review run now logs detailed metrics including execution time, token usage, API costs, and the number of AI interactions required. This data appears in your action logs as structured "Run summary" entries, making it easy to track performance and costs over time.

<details><summary>Related issues</summary>

- [#143: Add per-run instrumentation to code-review-action (timing, tokens, cost)](https://github.com/awinogradov/code-assistants/issues/143)
</details>

### Smarter follow-up responses
When developers reply to review comments with questions or clarifications, the action now responds much faster by skipping the full re-review unless explicitly requested. This makes conversational back-and-forth during code review feel more natural and responsive.

<details><summary>Related issues</summary>

- [#144: Fix code-review follow-up reply flow and submission-logic correctness](https://github.com/awinogradov/code-assistants/issues/144)
</details>

## 🐛 Bug Fixes

### Review submission reliability
The action now correctly handles pull requests with more than 100 comment threads and prevents duplicate reviews when multiple instances run simultaneously. Review formatting is preserved exactly as the AI generates it, fixing cases where whitespace changes caused reviews to be incorrectly identified as duplicates.

<details><summary>Related issues</summary>

- [#144: Fix code-review follow-up reply flow and submission-logic correctness](https://github.com/awinogradov/code-assistants/issues/144)
- [#149: Make the code-review submission pipeline testable and add tests](https://github.com/awinogradov/code-assistants/issues/149)
</details>

### Configuration validation
Invalid model override configurations now generate clear warning messages instead of silently failing. The action also properly counts AI interactions for accurate cost tracking.

<details><summary>Related issues</summary>

- [#159: Address code review suggestions and nitpicks from the optimization epic](https://github.com/awinogradov/code-assistants/issues/159)
- [#142: Optimize code-review-action: latency, tokens, follow-up flow, models, tests](https://github.com/awinogradov/code-assistants/issues/142)
</details>

## ⚙️ Configuration Required

### Model overrides
You can now customize which AI models handle different types of code review through the `review_model_overrides` input. This allows you to use faster, cheaper models for simple checks while reserving more powerful models for complex security analysis.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #142 | [#160](https://github.com/awinogradov/code-assistants/pull/160) | @awinogradov |
| #159 | [#160](https://github.com/awinogradov/code-assistants/pull/160) | @awinogradov |
| #144 | [#158](https://github.com/awinogradov/code-assistants/pull/158) | @awinogradov |
| #149 | [#158](https://github.com/awinogradov/code-assistants/pull/158) | @awinogradov |
| #148 | [#157](https://github.com/awinogradov/code-assistants/pull/157) | @awinogradov |
| #147 | [#154](https://github.com/awinogradov/code-assistants/pull/154) | @awinogradov |
| #143 | [#150](https://github.com/awinogradov/code-assistants/pull/150) | @awinogradov |

### Features

* **code-review:** add security agent and model overrides ([31282af](https://github.com/awinogradov/code-assistants/commit/31282af6f3f9a9b5d5dad3bffca00421617bffb8))
* **code-review:** log per-run phase timings, tokens, and round-trips ([d28a2ce](https://github.com/awinogradov/code-assistants/commit/d28a2ce2f36f3d5e426489d27a124b3e9a32818f))

### Bug Fixes

* **code-review:** count tool round-trips by turn, not by block ([36a9cd0](https://github.com/awinogradov/code-assistants/commit/36a9cd0454de8257765d7da799d083d1971de43a))
* **code-review:** gate verdict re-eval and harden review submission ([79cafc6](https://github.com/awinogradov/code-assistants/commit/79cafc62919ad63dfdd36aa58456eb7899866121))
* **code-review:** inject logger so override warning fires ([c0150bc](https://github.com/awinogradov/code-assistants/commit/c0150bc8efbf35fee41053192222573e24f81d54))

### Performance

* **code-review:** resolve rule links in code, not in the model ([8adb856](https://github.com/awinogradov/code-assistants/commit/8adb8561b2675624b0c6c1641d37f85e38e38858))

### Refactoring

* **code-review:** extract review-output module for tests ([2987044](https://github.com/awinogradov/code-assistants/commit/2987044aac4b5bddd7acf0c3c9782699518fb665))
* **code-review:** validate output with zod and reuse helpers ([a4f5f94](https://github.com/awinogradov/code-assistants/commit/a4f5f942442bb38e40f237861f24c64717c866ef))
## [0.2.0](https://github.com/awinogradov/code-assistants/compare/code-review-action@v0.1.0...code-review-action@v0.2.0) (2026-05-29)

## Release Notes

The code review action now handles rapid-fire PR comments and stops replying unnecessarily to acknowledgements.

## ✨ What's New

### Automatic release PR merging
Approved release PRs with passing CI checks now merge automatically, eliminating the manual merge step before publication. The release pipeline workflows (create, publish, and auto-merge) synchronize together to downstream repositories, streamlining your entire release process.

<details><summary>Related issues</summary>

- [#107: Add release-automerge composite action with downstream sync workflow](https://github.com/awinogradov/code-assistants/issues/107)
</details>

### Smarter acknowledgement handling
The AI reviewer recognizes when you're just acknowledging its feedback (like "Fixed —") and reacts with a 👍 instead of generating a new reply. It still responds to questions and explicit re-review requests, reducing notification noise while keeping the conversation flow natural.

<details><summary>Related issues</summary>

- [#111: Code review react mode replies to every review-thread acknowledgement](https://github.com/awinogradov/code-assistants/issues/111)
</details>

## 🐛 Bug Fixes

### Concurrent comment handling
The code review bot no longer misses @-mentions when multiple PR comments arrive at the same time. Each comment now gets its own processing queue, ensuring every mention gets a response regardless of timing.

<details><summary>Related issues</summary>

- [#71: Code review action drops bot mentions when comments arrive in quick succession](https://github.com/awinogradov/code-assistants/issues/71)
</details>

### Release PR approval flow
Release PRs now properly trigger auto-approval by using different identities for the PR author and reviewer. Previously, release PRs were stuck because GitHub prevents users from approving their own PRs — the bot was trying to approve PRs it created itself.

## ⚙️ Configuration Required

### Release PR author identity
Your release workflow must use a different token for creating release PRs than the one used for code review. Update your `release-create.yml` workflow to use a personal access token (like `secrets.GH_TOKEN`) instead of `secrets.BOT_TOKEN` to ensure the reviewer bot can approve the PR.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #111 | [#113](https://github.com/awinogradov/code-assistants/pull/113) | @awinogradov |
| #107 | [#110](https://github.com/awinogradov/code-assistants/pull/110) | @awinogradov |
| #71 | [#105](https://github.com/awinogradov/code-assistants/pull/105) | @awinogradov |

### Features

* **release-automerge:** add release auto-merge action and workflow ([1863ee9](https://github.com/awinogradov/code-assistants/commit/1863ee92945dcbe381b4ccd12ce51d6b4748eceb))

### Bug Fixes

* **code-review-action:** require a positive token to skip ack replies ([930479a](https://github.com/awinogradov/code-assistants/commit/930479a15604294c9532285cb8123509d9528fa2))
* **code-review-action:** skip react reply for author acknowledgements ([ea88093](https://github.com/awinogradov/code-assistants/commit/ea8809340f3273c43067074fed43ec2da2dc6b54))
* **code-review:** scope concurrency group per comment id ([05ab7f8](https://github.com/awinogradov/code-assistants/commit/05ab7f83cc68a37f89492014e84f38fae79bd57b))
* **release:** author release prs with a distinct identity ([fc6b266](https://github.com/awinogradov/code-assistants/commit/fc6b266a2d926a13876778be2ea848f9ec349382))

### Documentation

* **release:** document distinct release-pr author identity ([eb99546](https://github.com/awinogradov/code-assistants/commit/eb995467a7fad1f4408c6cbf8736e8a4e8d2097c))

### Refactoring

* **checks:** extract shared check-status poll loop ([8987c37](https://github.com/awinogradov/code-assistants/commit/8987c379894c8ddf5a77e1fae0d495fd17341b92))
## 0.1.0 (2026-05-28)

## Release Notes

## 0.1.0

Initial release of the GitHub Action for AI-powered code reviews using Claude Code.

## ✨ What's New

### AI Code Review for Pull Requests
Teams can now add automated AI code reviews to their PRs with a single GitHub Action. The bot analyzes code changes and submits structured reviews with approve/request changes/comment verdicts, including inline findings when relevant. Simply add the reviewer as a PR reviewer or @mention them in a comment to trigger a review.

### Interactive PR Conversations
The bot responds to questions and feedback on pull requests, creating a conversational review experience. When mentioned in PR comments, it drafts contextual replies, can resolve conversation threads, and updates its existing review based on the discussion.

### Smart Auto-Approve for Release PRs
Release pull requests from authorized bot accounts are automatically approved to streamline your deployment pipeline. This prevents release automation from getting blocked waiting for manual approvals while maintaining security by checking PR authorship.

### Project Context Detection
The action automatically detects your project's technology stack and context through `agents.rules` files, ensuring reviews are tailored to your specific codebase and conventions.

## ⚙️ Configuration Required

### Required Secrets
Set up these GitHub secrets in your repository:
- `BOT_TOKEN`: GitHub token for the bot account (needs `contents: read` and `pull-requests: write` permissions)
- `ANTHROPIC_API_KEY` or `CLAUDE_OAUTH_TOKEN`: Authentication for Claude Code API

### Required Variables
- `BOT_USERNAME`: GitHub username of your review bot (used for reviewer assignment and mention detection)

### Workflow Configuration
Add the provided workflow file to `.github/workflows/ai-review.yml` to enable:
- Automatic reviews on new PRs and updates
- Interactive responses to PR comments
- Proper concurrency handling to prevent duplicate reviews


### Features

* **code-review-action:** add composite action for ai pr review ([c83e2d6](https://github.com/awinogradov/code-assistants/commit/c83e2d66a18e12afca4e8247ac7eab12fef169af))

### Bug Fixes

* **code-review-action:** detect stack via agents.rules ([8893136](https://github.com/awinogradov/code-assistants/commit/8893136104370ddc85382e57ec4693073105c444))
* **code-review-action:** read version from package.json ([93feb72](https://github.com/awinogradov/code-assistants/commit/93feb72a418eb882318418fcdf13c5d208d95cb0))
* **code-review-action:** resolve claude binary in bun .bun cache ([17f36b4](https://github.com/awinogradov/code-assistants/commit/17f36b4ffeec6e215e0935b62dca3eb2f84b1645))
* **code-review:** auto-approve release prs on skip ([73d62fb](https://github.com/awinogradov/code-assistants/commit/73d62fb02a9e486d2f4aa6f0fbfb29b1ced0e505))
* **code-review:** escalate approve failure to error ([5f5d4f6](https://github.com/awinogradov/code-assistants/commit/5f5d4f6c89c0cdfae3f1347821a602408807de37))
* **code-review:** gate release approve by author ([f41b35f](https://github.com/awinogradov/code-assistants/commit/f41b35fa3a3fa39e64e2abaad223abdf9607f9b9))
* **code-review:** match release authors literally ([162af36](https://github.com/awinogradov/code-assistants/commit/162af36f01b4bbeb62a8a61156398f9814f5e715))
* **pr-review:** align fan-out on autopilot prefix ([8e36b8b](https://github.com/awinogradov/code-assistants/commit/8e36b8be95e3312f7feda730d8bcd94b49429d81))

### Chores

* **actions:** declare release.type for each composite action ([7650e6a](https://github.com/awinogradov/code-assistants/commit/7650e6a6a081b568f9c6ee09520232aa8e78bc1c))
* **workspaces:** declare agents field on workspace modules ([68c6d3a](https://github.com/awinogradov/code-assistants/commit/68c6d3a19026b2265efa737ddba6484222de8289))

### CI

* pin actions with floating semver tags ([d1e0af8](https://github.com/awinogradov/code-assistants/commit/d1e0af8ce106b938140a5d6f42d31a8055909c73))
