# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.

## [1.8.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.7.0...autopilot@v1.8.0) (2026-07-03)

## Release Notes

The plan skill now discovers and enforces your repo's `rfc/` and `docs/` standards, closing the gap where review enforced conventions that planning ignored.

## ✨ What's New

### RFC and Docs Standards Awareness in Planning

The autopilot loop's review side has long discovered and enforced a repo's versioned RFC standards and `docs/` conventions — flagging drift, checking compliance, requiring version-bump hygiene. The plan skill now does the same. When kicking off a plan, autopilot will inventory your `rfc/` directory (up to 3 applicable standards), fall back through your `docs/` chain, record the applicable standards in its Context Map, score compliance as part of Phase 5, and enforce RFC version-bump hygiene in Post-Implementation. This means plans are drafted to comply with your repo's own standards from the start, not just checked against them after the fact.

The four `rules/*.md` files have also been updated to declare `rfc/` in their Mandatory Context blocks, with the precedence order: Accepted RFC → `docs/` → the rule file itself.

<details><summary>Related issues</summary>

- [#421: Support rfc/ and docs/ standards in the plan skills and rules](https://github.com/awinogradov/code-assistants/issues/421)
- [#422: Support rfc/ and docs/ standards in the plan skills and rules](https://github.com/awinogradov/code-assistants/pull/422)
</details>

## 🐛 Bug Fixes

### Linked File and Doc References in Review Comments

Code review comments now render file paths, doc mentions, and RFC references as clickable links directly in the comment prose and summary — not just at the finding location. Previously, a reviewer reading a comment about a standards violation had to hunt for the relevant file or RFC separately; now those references resolve inline where they appear.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #421 | [#422](https://github.com/awinogradov/code-assistants/pull/422) | @awinogradov |

### Features

* **autopilot:** read repo rfc/docs standards in plan skill ([ee6490d](https://github.com/awinogradov/code-assistants/commit/ee6490d5b00de91c07b446765864e2d4bdffaff3))

### Bug Fixes

* **autopilot:** link file and doc mentions in review prose ([25ec5a0](https://github.com/awinogradov/code-assistants/commit/25ec5a0ce2ba993457fd4e0193a57cce870754fd))
## [1.7.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.6.0...autopilot@v1.7.0) (2026-07-02)

## Release Notes

Reference formatting compliance is the headline of this release: generated PR bodies, review comments, issue bodies, and release notes now all emit clickable links for files, tickets, and commit SHAs instead of dead text or bare identifiers.

## ✨ What's New

### RFC & Docs Standards Enforced in AI Review

The AI code review now checks pull changes against the repository's own `rfc/` and `docs/` conventions. Accepted-RFC violations are flagged as blockers, while contradictions with Draft RFCs or docs conventions surface as suggestions. New hygiene checks also catch an Accepted RFC that was edited without a version bump and any RFC missing from the `rfc/README.md` index. Repositories that don't have `rfc/` or `docs/` folders are unaffected — no behavior change, no added cost.

<details><summary>Related issues</summary>

- [#403: Enforce consumer rfc/ and docs/ standards in code review](https://github.com/awinogradov/code-assistants/issues/403)
</details>

### Auto-Linked References in Generated Issue Bodies

When Autopilot generates a GitHub issue body, it now automatically links any mentioned repo files to their source and any cited external resources to their canonical URLs. This keeps generated issues navigable and compliant with the reference formatting standard without any extra effort from the author.

<details><summary>Related issues</summary>

- [#386: Auto-link mentioned files and external resources in generated issue bodies](https://github.com/awinogradov/code-assistants/issues/386)
</details>

### Self-Assign in One Step with Linear Issue Creation

The `/autopilot:linear-create` assignee picker now lists you first, labelled **(you) — recommended**, so self-assigning a new Linear issue takes a single keystroke instead of scrolling through the full team list. Assignee resolution also now works correctly when you're running your own Linear MCP server rather than the bundled one.

<details><summary>Related issues</summary>

- [#410: Put the current user first in the Linear assignee picklist](https://github.com/awinogradov/code-assistants/issues/410)
</details>

### Faster Review Reply Flow — No Approval Prompt

`pr:resolve` now posts drafted review replies immediately after showing the summary, skipping the confirmation step that previously interrupted the workflow. If a re-run is needed, it automatically skips threads already answered and continues past any reply posts that failed, so the command is safely re-entrant.

<details><summary>Related issues</summary>

- [#397: Post drafted review replies without asking for approval](https://github.com/awinogradov/code-assistants/issues/397)
</details>

---

## 🐛 Bug Fixes

### Linear Status Transitions Now Work with a User-Configured MCP Server

Linear ticket status transitions, issue creation, and listing were silently doing nothing for users who run their own Linear MCP server. The bundled server was being shadowed by endpoint deduplication, so calls never reached Linear. Linear-aware skills now resolve tools under any server prefix and surface a clear error when no Linear MCP is available at all. **Action required:** reload or update the plugin after deploying this release — a cached older plugin keeps the stale tool references.

<details><summary>Related issues</summary>

- [#401: Linear status transitions silently no-op with a user-configured Linear MCP](https://github.com/awinogradov/code-assistants/issues/401)
</details>

### PR Titles Now Always Carry the Linear Ticket Prefix

`pr:create` and `pr:update` now run a mandatory title self-check so that any Linear-tracked PR always carries the `TEAM-N:` prefix before it's submitted. `pr:validate` also enforces the `TEAM-N:` title and `<team>-<number>-<slug>` branch conventions, gated on the repository's `agents.trackers` config. Previously a PR could be created without the prefix and pass validation silently.

<details><summary>Related issues</summary>

- [#390: Document and validate the Linear ticket-ID PR title prefix](https://github.com/awinogradov/code-assistants/issues/390)
</details>

### Clickable Links for Tracker IDs and Commit SHAs in Generated Output

Linear ticket references in generated PR bodies and review output are now rendered as clickable links. Review replies cite the fixing commit as a linked SHA rather than a bare hash. This applies to all output that previously emitted unlinked identifiers in violation of RFC-0001.

<details><summary>Related issues</summary>

- [#387: PR bodies and review replies still emit unlinked references violating RFC-0001](https://github.com/awinogradov/code-assistants/issues/387)
</details>

### File and Doc References Linked in AI Review Comments

AI review comments now link every file, doc, and standard reference to a permalink at the reviewed commit. Previously these were rendered as backticked dead text, making it tedious to navigate to the referenced location directly from a review thread.

<details><summary>Related issues</summary>

- [#279: Apply RFC-0001 formatting to generated PR descriptions and release notes](https://github.com/awinogradov/code-assistants/issues/279)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #410 | [#411](https://github.com/awinogradov/code-assistants/pull/411) | @awinogradov |
| #386 | [#407](https://github.com/awinogradov/code-assistants/pull/407) | @awinogradov |
| #279 | [#406](https://github.com/awinogradov/code-assistants/pull/406) | @awinogradov |
| #403 | [#404](https://github.com/awinogradov/code-assistants/pull/404) | @awinogradov |
| #401 | [#402](https://github.com/awinogradov/code-assistants/pull/402) | @awinogradov |
| #397 | [#398](https://github.com/awinogradov/code-assistants/pull/398) | @awinogradov |
| #390 | [#391](https://github.com/awinogradov/code-assistants/pull/391) | @awinogradov |
| #387 | [#388](https://github.com/awinogradov/code-assistants/pull/388) | @awinogradov |

### Features

* **autopilot:** enforce repo rfc and docs standards in review ([1348297](https://github.com/awinogradov/code-assistants/commit/13482974363e8355dc488a23b1cfb61f51c8b6a1))
* **autopilot:** link file and external refs in issue bodies ([1fc148d](https://github.com/awinogradov/code-assistants/commit/1fc148d247ad6a33563f401a43f8d29218af6210))
* **autopilot:** post drafted replies without approval prompt ([8cf91b1](https://github.com/awinogradov/code-assistants/commit/8cf91b1513ec48e231a1ce450564159a60e5465a))
* **autopilot:** put current linear user first in assignee list ([16d6779](https://github.com/awinogradov/code-assistants/commit/16d6779ad95c35a020f2d1b08e9057db5cdd5a37))

### Bug Fixes

* **autopilot:** enforce linear ticket prefix on pr titles ([248bfb5](https://github.com/awinogradov/code-assistants/commit/248bfb5df02f69f254edaee3fda0294639e5ffe3))
* **autopilot:** link file and doc refs in review output ([d32d15c](https://github.com/awinogradov/code-assistants/commit/d32d15c03a7dc4ac4a287040951178fcb38bab1f))
* **autopilot:** match linear mcp tools by name in skills ([7694baf](https://github.com/awinogradov/code-assistants/commit/7694baf5ea9193a95c3456d67d34deb585327826))
* link tracker ids and shas in generated output ([56e8668](https://github.com/awinogradov/code-assistants/commit/56e8668bfe800373f2cdaa0da4615924c8f87c67))
## [1.6.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.5.0...autopilot@v1.6.0) (2026-06-29)

## Release Notes

Linear tickets now move to **In Progress** automatically when autopilot begins work on them, keeping your issue tracker in sync without any manual status updates.

## ✨ What's New

### Automatic Linear Issue Progress Tracking

When autopilot starts work on a Linear issue, the linked ticket now automatically moves to **In Progress** — the same behavior already in place for GitHub issues. This means your Linear board reflects real work state without anyone having to manually drag tickets across columns. Teams using Linear for sprint tracking will see accurate status without extra coordination overhead.

<details><summary>Related issues</summary>

- [#383: Move Linear issue to In Progress when a plan is accepted in autopilot](https://github.com/awinogradov/code-assistants/issues/383)
- [#384: Move Linear issues to In Progress when autopilot starts work](https://github.com/awinogradov/code-assistants/pull/384)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #383 | [#384](https://github.com/awinogradov/code-assistants/pull/384) | @awinogradov |

### Features

* **autopilot:** pass --start for linear branch creation ([537394c](https://github.com/awinogradov/code-assistants/commit/537394ce78279833b7ecf526ce4e043e9b5e6efb))
## [1.5.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.4.0...autopilot@v1.5.0) (2026-06-29)

## Release Notes

The headline change in v1.5.0 is multi-team Linear support, letting a single repository route issues across multiple Linear teams without manual workarounds.

## ✨ What's New

### Multi-Team Linear Support

Repositories that span more than one Linear team can now configure all of them in `agents.trackers`. Issues are automatically routed to the correct team based on their key prefix (e.g. `ARCH-`, `ENG-`), so there's no longer a need to maintain separate configurations or manually specify the team on every operation. When you create or list issues and more than one Linear tracker is configured, the agent will prompt you to pick the target team. The `agents.trackers` array is also validated on startup — configuration that references a missing team, has colliding key prefixes, or includes a duplicate GitHub entry will be rejected with a clear error rather than failing silently at runtime.

<details><summary>Related issues</summary>

- [#377: Support multiple Linear teams in agents.trackers](https://github.com/awinogradov/code-assistants/issues/377)
- [#378: Support multiple Linear teams in one repository](https://github.com/awinogradov/code-assistants/pull/378)
</details>

## 🐛 Bug Fixes

### `/autopilot:run` No Longer Pauses for Plan Approval

Running `/autopilot:run` used to stop and wait for you to approve the plan before proceeding. That gate has been removed — invoking the command now authorizes the full plan → implement → commit → PR → monitor flow to run end-to-end without further prompts. If you need to review the plan before execution, use the separate plan step rather than `/autopilot:run`.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #377 | [#378](https://github.com/awinogradov/code-assistants/pull/378) | @awinogradov |

### Features

* **autopilot:** support multiple linear teams ([283c890](https://github.com/awinogradov/code-assistants/commit/283c890f13480091c3c5521160cc8d829ff09301))

### Bug Fixes

* **autopilot:** drop plan-approval gate from run flow ([6bd8352](https://github.com/awinogradov/code-assistants/commit/6bd83520f6e0aaa84e6ab9e3f75a752673dcaa62))
## [1.4.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.3.1...autopilot@v1.4.0) (2026-06-26)

## Release Notes

Linear issue tracker support lands as a first-class provider alongside GitHub, letting teams route autopilot skills to Linear or GitHub based on issue origin.

## ✨ What's New

### Linear Issue Tracker Support
Autopilot now supports Linear as an opt-in issue tracker alongside GitHub. Teams can configure one or more trackers per project — for example, Linear for internal work and GitHub for external user feedback. The plugin routes automatically: `linear.app` URLs and `KEY-N` identifiers go to Linear; `#N` numbers and `github.com` URLs go to GitHub. GitHub remains the zero-config default; no change is required for projects not using Linear.

This covers the full write path: `branch:create` now produces `<team>-N-slug` branches and `TEAM-123:` pull-request titles, moves tickets to In Progress with `--start`, and adds `Closes TEAM-123` links. A new `/autopilot:linear-create` command files tickets through a guided wizard (status, label, assignee), and `/autopilot:issue-run` browses Linear tickets on Linear-tracked projects. The `todo-cleanup` skill recognizes Linear ticket references in TODO/FIXME comments and files new tickets in Linear when running on a Linear-tracked project.

<details><summary>Related issues</summary>

- [#339: Support Linear as an issue tracker across the autopilot skills](https://github.com/awinogradov/code-assistants/issues/339)
- [#340: Add opt-in Linear provider foundation: config, MCP, and issue-context read path](https://github.com/awinogradov/code-assistants/issues/340)
- [#341: Add Linear branch and pull request conventions to the autopilot write path](https://github.com/awinogradov/code-assistants/issues/341)
- [#342: Add Linear issue creation, listing, and assignee resolution to autopilot](https://github.com/awinogradov/code-assistants/issues/342)
- [#343: Add Linear support to TODO cleanup, issue state transitions, and docs](https://github.com/awinogradov/code-assistants/issues/343)
</details>

### PDF Generation Skill
A new `/autopilot:pdf-create` skill generates polished, multi-page PDFs (reports, research docs, six-pagers, playbooks) from structured content. Optionally, a Google `design.md` file can supply brand theming. The skill is self-contained — it can be copied into `~/.claude/skills/` for standalone use outside the plugin, provided a local Node runtime is available.

<details><summary>Related issues</summary>

- [#336: Add pdf:create autopilot skill for beautiful, brand-themed PDFs](https://github.com/awinogradov/code-assistants/issues/336)
</details>

### Resolvable Cross-Document References
All cross-document references in generated reviews, replies, plan files, and issue bodies are now real markdown links that resolve to their targets. Review thread replies now link rule codes and doc/section references the same way the main review does. A new `linkResolution` check runs automatically to verify every local link and heading anchor resolves.

<details><summary>Related issues</summary>

- [#334: Make every reference in skills, agents, and docs a real link (RFC-0001 v3)](https://github.com/awinogradov/code-assistants/issues/334)
</details>

### Inline Plan Diagrams
The `plan` skill's draft template previously collected all ASCII diagrams into a standalone `## Diagrams` section, requiring cross-referencing against the steps they illustrated. Diagrams now embed inline next to the step, file, or data-flow they explain, keeping context local and readable.

<details><summary>Related issues</summary>

- [#325: Embed plan diagrams inline instead of a dedicated section](https://github.com/awinogradov/code-assistants/issues/325)
</details>

## 🐛 Bug Fixes

### Rule Code Links in Review Replies
Autopilot review-thread replies now render `CHECK-` rule codes as clickable links to their rule definitions. Previously they appeared as bare text, requiring manual lookup.

<details><summary>Related issues</summary>

- [#347: Autopilot review replies show CHECK rule codes as bare text instead of links](https://github.com/awinogradov/code-assistants/issues/347)
</details>

### Commit Length Limits Now Match Commitlint
The commit skills previously enforced a single 72-character title limit. They now correctly apply commitlint's separate limits: 50 characters for the subject and 100 characters for the full header, matching what commitlint actually validates.

### PR Review No Longer Drops Bot Comments or Ignores Thread Resolution
PR review automation was silently discarding comments from review bots and treating resolved review threads the same as open ones. Both are fixed — the skill now filters by thread resolution state and preserves comments from all sources.

### Python Projects Supported in TODO Cleanup
The `todo-cleanup` skill now handles Python projects correctly, including `ruff`/`mypy` verification steps and the `#` comment prefix for TODO entries.

### `resolve-alert-context` Reports Precise Failures
The `resolve-alert-context` agent previously returned a generic empty result on any failure. It now reports specific error conditions — auth failure, missing scope, or not-found — so the calling skill can respond appropriately.

### `run` Progress Tracking Covers All Phases
The `run` skill's progress tracker now records the commit, PR, and monitor phases alongside the planning phase. Previously only the planning phase was tracked, making it harder to follow long-running tasks.

## ⚙️ Configuration Required

### Linear Tracker Setup
To enable Linear as an issue tracker, add a `trackers` entry to the `agents` section of your project's `package.json`. The `LINEAR_API_KEY` environment variable must be set — used by the bundled GraphQL fallback when the Linear MCP server is unavailable (e.g., in CI or headless environments).

```json
{
  "agents": {
    "trackers": [
      { "provider": "linear", "team": "TEAM" },
      { "provider": "github" }
    ]
  }
}
```

`LINEAR_API_KEY` is required for Linear-tracked projects. The Linear MCP server is bundled in the plugin's `.mcp.json` and activates automatically once the key is present. GitHub-only projects require no configuration changes.


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #347 | [#351](https://github.com/awinogradov/code-assistants/pull/351) | @awinogradov |
| #339 | [#348](https://github.com/awinogradov/code-assistants/pull/348) | @awinogradov |
| #340 | [#348](https://github.com/awinogradov/code-assistants/pull/348) | @awinogradov |
| #341 | [#348](https://github.com/awinogradov/code-assistants/pull/348) | @awinogradov |
| #342 | [#348](https://github.com/awinogradov/code-assistants/pull/348) | @awinogradov |
| #343 | [#348](https://github.com/awinogradov/code-assistants/pull/348) | @awinogradov |
| #336 | [#337](https://github.com/awinogradov/code-assistants/pull/337) | @awinogradov |
| #334 | [#335](https://github.com/awinogradov/code-assistants/pull/335) | @awinogradov |
| #325 | [#330](https://github.com/awinogradov/code-assistants/pull/330) | @awinogradov |

### Features

* **autopilot:** add linear branch and pr conventions ([537c74f](https://github.com/awinogradov/code-assistants/commit/537c74f8739269852bb95474de9cddb566a978c3))
* **autopilot:** add linear issue creation and listing ([7f9c2a6](https://github.com/awinogradov/code-assistants/commit/7f9c2a6a7c1d63fc65b54fbc9f4479007da82dc8))
* **autopilot:** add opt-in linear issue tracker provider ([a9973cb](https://github.com/awinogradov/code-assistants/commit/a9973cbec9077da1fccaa647fd81d3d457088355))
* **autopilot:** add pdf:create skill ([29d8ae4](https://github.com/awinogradov/code-assistants/commit/29d8ae4fb88d99a128d1b5c88014a41f78906198))
* **autopilot:** make search-codebase-todos provider-aware ([8f53370](https://github.com/awinogradov/code-assistants/commit/8f533703330bdb0a3d5242fccba664b9c78c5722))
* **autopilot:** recognize linear refs in todo cleanup ([deaea5b](https://github.com/awinogradov/code-assistants/commit/deaea5ba31adbf3a0b01f6959ef5c48138e676e1))
* **autopilot:** support multiple issue trackers ([6dd0f50](https://github.com/awinogradov/code-assistants/commit/6dd0f5073df2d4d5c43d9c694d6aa79edc862f88))
* **rfc:** link cross-document references ([46e5d6f](https://github.com/awinogradov/code-assistants/commit/46e5d6f7b5d6c7e62453f751c71faf6145499851))

### Bug Fixes

* **autopilot:** add python language rows to todo-cleanup ([e7b2cb8](https://github.com/awinogradov/code-assistants/commit/e7b2cb8df421ca4f1e50572d7543be6492e81a47))
* **autopilot:** check commit subject and header length separately ([7faf736](https://github.com/awinogradov/code-assistants/commit/7faf7363373efa3911224ef28d441fb0d2aabe60))
* **autopilot:** compute resolve-alert-context error branches ([b3749a8](https://github.com/awinogradov/code-assistants/commit/b3749a83431e1de3be11a29da96a506354f1f010))
* **autopilot:** drop pr:monitor duplicate approval handler ([9077b1d](https://github.com/awinogradov/code-assistants/commit/9077b1d06b3b2cb54aa7a907a8c0b5777faf94f1))
* **autopilot:** filter pr comments by review-thread state ([522e0f9](https://github.com/awinogradov/code-assistants/commit/522e0f90e96994855a59692458a2ca883ad71155))
* **autopilot:** guard commits:restructure working tree ([30897de](https://github.com/awinogradov/code-assistants/commit/30897decb01d2c449bc8d60c34b3e285a51ad4b2))
* **autopilot:** link rule codes in review replies ([657d8e0](https://github.com/awinogradov/code-assistants/commit/657d8e03f606d853b2fd4f1c46ba18aba09a7d70))
* **autopilot:** mirror empty-state handling on issue:run linear ([6cc91fe](https://github.com/awinogradov/code-assistants/commit/6cc91fe0bac10a391b43a95c8ccf9bb41baa0a11))
* **autopilot:** order linear fallback comments by created date ([17725e1](https://github.com/awinogradov/code-assistants/commit/17725e16a97881e29ca883dc8276b377e4d205da))
* **autopilot:** repoint pr:review example to a real rule code ([160a444](https://github.com/awinogradov/code-assistants/commit/160a4446b1f052646fd94728157b40bd8a005c66))
* **autopilot:** score expert-review plan as written ([2ed885d](https://github.com/awinogradov/code-assistants/commit/2ed885d62e4c82bd97d7e7c8a9bab7f6ab7aa753))
* **autopilot:** track run commit, pr, and monitor phases as tasks ([4f6788c](https://github.com/awinogradov/code-assistants/commit/4f6788ce1a17638913967bdab91e9f736ad6d1d2))

### Performance

* **autopilot:** drop unused grep grant from two agents ([5394c28](https://github.com/awinogradov/code-assistants/commit/5394c2878f6de51438ad3523b4585b37b5ea8b01))
* **autopilot:** scale run documentation lookup to task size ([7b00700](https://github.com/awinogradov/code-assistants/commit/7b00700a32dd82ed9b23834a9762aae3333bd94f))
* **autopilot:** skip branch:create assignee re-read on edit error ([919e6f8](https://github.com/awinogradov/code-assistants/commit/919e6f82b0928a4e803d3331a8a8637e4e2e1135))
* **autopilot:** trim self-describing pr:review rule examples ([92cfe53](https://github.com/awinogradov/code-assistants/commit/92cfe53eacf083684dfd97a176fab52ab7f7e26b))

### Documentation

* **autopilot:** align analyze-pr-commits output flag name ([e309ddd](https://github.com/awinogradov/code-assistants/commit/e309ddd7897af87bc6219f0ac375b138741ff25a))
* **autopilot:** defer pr:monitor bg-mode detection to phase 0 ([6e80820](https://github.com/awinogradov/code-assistants/commit/6e808207f01a3aef03c115dff2e185da6ebf83c9))
* **autopilot:** document linear tracker config and access paths ([4c3ce3f](https://github.com/awinogradov/code-assistants/commit/4c3ce3fe9d7289048938c790d24dbc01f27a973f))
* **autopilot:** document multiple issue trackers config ([c70aff6](https://github.com/awinogradov/code-assistants/commit/c70aff69ecbe194663065c6ed7bc71a6286bf18d))
* **autopilot:** document pdf:create skill ([7d5c6b1](https://github.com/awinogradov/code-assistants/commit/7d5c6b1c29caebdaa46a36f10ea2aa5f3a6e590c))
* **autopilot:** document run linear and alert input forms ([fc6933e](https://github.com/awinogradov/code-assistants/commit/fc6933e3f4c638c0a4a7e9feb4cfbd18c814eb7f))
* **autopilot:** drop duplicate sentence in detection note ([0c614a4](https://github.com/awinogradov/code-assistants/commit/0c614a41a3ba5ec5cea6e2a274bec998b346a6e0))
* **autopilot:** link linear:create body to canonical issue:create ([ff9da0f](https://github.com/awinogradov/code-assistants/commit/ff9da0fb8b263a6b05933db732b6a0c5059a9610))
* **autopilot:** link the branch:create self-assign canonical ([1a76c82](https://github.com/awinogradov/code-assistants/commit/1a76c82b7ece75491638b251503c3841fa084262))
* **autopilot:** list all nine helper sub-agents in readme ([8903e8c](https://github.com/awinogradov/code-assistants/commit/8903e8cb3c8177e32663a6e717ffd0cfc3c5add9))
* **autopilot:** mark canonical dedup owners in pr skills ([0264359](https://github.com/awinogradov/code-assistants/commit/026435937a5afd00d13f390d6a19343cfacbb7de))
* **autopilot:** note ask:gemini shares peer-eval with ask:codex ([33da05b](https://github.com/awinogradov/code-assistants/commit/33da05bc4e731dab0efc18b2b8c913e846943ce8))
* **autopilot:** note linear:create omits related-issue detection ([fd0c69f](https://github.com/awinogradov/code-assistants/commit/fd0c69ff9e71e839434b08e2e2abeed7d5e1f6e5))
* **autopilot:** note pr:review input gh fallbacks in hint ([f176bab](https://github.com/awinogradov/code-assistants/commit/f176babac68a458467c686b5c53810904a98e462))
* **autopilot:** remove dead quiz mode section from run ([826ddef](https://github.com/awinogradov/code-assistants/commit/826ddef3ac9aa5d2cffebe0981c584d7b80b4d1c))
* **autopilot:** rename scan-and-analyze phase 3 heading ([2598ca9](https://github.com/awinogradov/code-assistants/commit/2598ca9b72fda80ee6c0c5449d1b86abf31ec8cd))
* **autopilot:** renumber todo-cleanup phase 4 subsections ([ad0718d](https://github.com/awinogradov/code-assistants/commit/ad0718d9dd75981ca455ab3a94d2c20a13788258))
* **autopilot:** single-source pr grammar and fix stale refs ([3b0ff33](https://github.com/awinogradov/code-assistants/commit/3b0ff3342c9dbdf5779566ece1db96dd00849b01))
* **autopilot:** standardize agent json output-contract sentence ([4a3dbf8](https://github.com/awinogradov/code-assistants/commit/4a3dbf84c68e5c29ce3c61558e586ba22ec201dc))
* **autopilot:** standardize gh --jq long flag across skills ([7eb4957](https://github.com/awinogradov/code-assistants/commit/7eb4957977f20d61aaaa1bbc803f9682e005532c))
* **autopilot:** use portable repo-blob-url in pr:validate comment ([c1aae73](https://github.com/awinogradov/code-assistants/commit/c1aae73be92ca9aa7a3da8c79aa464631621a3b8))
* **plan:** embed diagrams inline instead of a section ([de13823](https://github.com/awinogradov/code-assistants/commit/de13823fc083d33f82dc62f51e27fdc5e63c1059))

### Refactoring

* **autopilot:** collapse preflight no-op branch dispatch ([2235772](https://github.com/awinogradov/code-assistants/commit/2235772854ca0434941e84912497898a64fe523d))
* **autopilot:** collapse repeated branch:create dialogs ([7ffc768](https://github.com/awinogradov/code-assistants/commit/7ffc7686d0d4365fac57b1a6b42697a607847564))
* **autopilot:** point pr:review output format at verdict rules ([02a53f8](https://github.com/awinogradov/code-assistants/commit/02a53f8133eee8b5ec77ae02632306d5ad25a8ac))
* **autopilot:** renumber pr:resolve phases contiguously ([0f8113c](https://github.com/awinogradov/code-assistants/commit/0f8113ceaaeb170e79789b860b0340dc41ec4ab7))
* **autopilot:** reuse recorded stack in pr:review section 2.1 ([ae40e23](https://github.com/awinogradov/code-assistants/commit/ae40e23411a412c14f770516e122d5596823c02f))
* **autopilot:** split chart drawing helpers ([bd68327](https://github.com/awinogradov/code-assistants/commit/bd68327bd6499488e6c925e06c445d31279f5e84))
* **autopilot:** trim linear graphql query and errors ([dcdcd33](https://github.com/awinogradov/code-assistants/commit/dcdcd3347b01dc2f19ab6e3bdec6fc29ec56dcc9))

### Tests

* **autopilot:** add pdf:create renderer tests ([cbc50de](https://github.com/awinogradov/code-assistants/commit/cbc50de5c02e9adf37323fb303eebded08998737))
## [1.3.1](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.3.0...autopilot@v1.3.1) (2026-06-13)

## Release Notes

Documentation references updated to new chapter-based structure

## ✨ What's New

### Improved Documentation Links
All documentation references throughout the plugin now point to the newly restructured chapter-based documentation system. This means clearer navigation when you're referenced to setup guides, migration instructions, or troubleshooting docs.

<details><summary>Related issues</summary>

- [#295: MAINTENANCE: Restructure docs into numbered book chapters](https://github.com/awinogradov/code-assistants/pull/295)
</details>

## 📚 Documentation & Settings Updates

### Chapter-Based Documentation Structure
The repository documentation has been reorganized into numbered book chapters with a clear five-part table of contents. This makes it easier to find the specific information you need when configuring or troubleshooting the plugin.


### Documentation

* update doc links in readmes and jsdoc ([8e468d2](https://github.com/awinogradov/code-assistants/commit/8e468d230fa333803a85665f0d26757c13e1350d))
## [1.3.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.2.0...autopilot@v1.3.0) (2026-06-08)

## Release Notes

The Autopilot plugin now generates cleaner PR descriptions and release notes that follow proper reference formatting standards, making your documentation more professional and easier to navigate.

## ✨ What's New

### Smarter issue picker shows available work
The issue picker now focuses on unassigned issues by default, helping you quickly find work that's actually available to pick up. No more scrolling past issues your teammates are already handling. Need to see everything? Just use the `--all` flag.

<details><summary>Related issues</summary>

- [#272: Hide assigned issues from the issue:run picker by default, with an --all flag](https://github.com/awinogradov/code-assistants/issues/272)
</details>

## 🐛 Bug Fixes

### PR review bot now properly approves resolved blockers
When you address a blocking review comment and the bot agrees it's fixed, it will now actually approve your PR instead of leaving the block in place. No more asking for "re-review" when the bot already agrees everything looks good.

<details><summary>Related issues</summary>

- [#275: Approve a blocked PR when the reviewer bot agrees its blockers are resolved](https://github.com/awinogradov/code-assistants/issues/275)
</details>

### Better link formatting in PR comments and reviews
PR descriptions, release notes, and review comments now properly link to commits, issues, and RFCs. Commit SHAs are clickable, references follow consistent formatting rules, and cross-references won't break when files move around.

<details><summary>Related issues</summary>

- [#279: Apply RFC-0001 formatting to generated PR descriptions and release notes](https://github.com/awinogradov/code-assistants/issues/279)
- [#259: Apply RFC-0001 reference formatting to PR review replies and comments](https://github.com/awinogradov/code-assistants/issues/259)
</details>

## 📚 Documentation & Settings Updates

### Reference formatting standard updates
The reference formatting guidelines now allow linking to sections within the same document using anchors, while cross-document references should include an inline summary to avoid broken links when documents get restructured.

<details><summary>Related issues</summary>

- [#259: Apply RFC-0001 reference formatting to PR review replies and comments](https://github.com/awinogradov/code-assistants/issues/259)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #279 | [#282](https://github.com/awinogradov/code-assistants/pull/282) | @awinogradov |
| #275 | [#278](https://github.com/awinogradov/code-assistants/pull/278) | @awinogradov |
| #259 | [#268](https://github.com/awinogradov/code-assistants/pull/268) | @awinogradov |
| #272 | [#274](https://github.com/awinogradov/code-assistants/pull/274) | @awinogradov |

### Features

* **issue-run:** hide assigned issues from picker ([c611582](https://github.com/awinogradov/code-assistants/commit/c611582e5d6ec3075055e94056d1540a0a76e206))

### Bug Fixes

* **autopilot:** link commit shas in pr replies ([ed2ba1c](https://github.com/awinogradov/code-assistants/commit/ed2ba1c2f8d6a58d9c92e864e9a810d724b849bb))
* **pr-answer:** bind resolution language to approve verdict ([6707eb1](https://github.com/awinogradov/code-assistants/commit/6707eb1a235bdefff64d0b9fe2eba76a95c84f30))
* **pr:** wire reference formatting into pr bodies ([9213e15](https://github.com/awinogradov/code-assistants/commit/9213e1598de14772104df8ee18f6093e51147c89))

### Documentation

* **issue-run:** remove parenthetical from --all description ([506c434](https://github.com/awinogradov/code-assistants/commit/506c4345d14f26f936f4c0de562d793f48fbb704))
* **rfc:** allow same-document section anchors ([0cebbb6](https://github.com/awinogradov/code-assistants/commit/0cebbb6092e4a09a8412d485644bf99d9c683562))
## [1.2.0](https://github.com/awinogradov/code-assistants/compare/autopilot@v1.1.0...autopilot@v1.2.0) (2026-06-04)

## Release Notes

Autopilot plugin now picks recent issues to run, supports GitHub security alerts, and delivers smarter code reviews with full project context.

## ✨ What's New

### Quick issue execution
The new issue:run skill lets your team browse recent open issues and instantly start autopilot on any of them. Simply pick from the list or type any issue number to get started — no more manual copying of issue URLs.

<details><summary>Related issues</summary>

- [#248: Add an issue:run skill to pick a recent issue and run autopilot on it](https://github.com/awinogradov/code-assistants/issues/248)
</details>

### Security alert integration
Autopilot now understands GitHub code-scanning alerts as inputs. Your team can run `plan` or `run` with an alert URL or shorthand like `alert#123` to automatically resolve security issues. Security fixes create appropriately named branches (`security-*`) and PRs tagged with `SECURITY:` for easy tracking.

<details><summary>Related issues</summary>

- [#251: Support GitHub code-scanning alerts as an input type for plan and run skills](https://github.com/awinogradov/code-assistants/issues/251)
</details>

### Context-aware code reviews
Code reviews now see the full picture before evaluating changes. Reviews load the same project context that developers use (CLAUDE.md, README, docs, related TODOs) and check prior inline comments to provide accurate follow-ups. The system validates 14 new aspects including task alignment, dead code detection, and platform standards compliance.

<details><summary>Related issues</summary>

- [#233: Improve the code review skill: context parity, inline history, and rule checks](https://github.com/awinogradov/code-assistants/issues/233)
</details>

### Stable reference formatting
All generated output now follows a versioned formatting standard ([RFC-0001](https://github.com/awinogradov/code-assistants/blob/main/rfc/0001-reference-formatting.md)) that ensures references render as clickable links instead of plain text. File names appear in backticks, commits link to their SHA, and documentation references include inline summaries rather than fragile section links.

<details><summary>Related issues</summary>

- [#246: Version the reference-formatting standard as a stable RFC](https://github.com/awinogradov/code-assistants/issues/246)
- [#236: Standardize reference formatting and readability in generated output](https://github.com/awinogradov/code-assistants/issues/236)
</details>


## GitHub Issues

| Issue | PR | Author |
| --- | --- | --- |
| #248 | [#255](https://github.com/awinogradov/code-assistants/pull/255) | @awinogradov |
| #251 | [#256](https://github.com/awinogradov/code-assistants/pull/256) | @awinogradov |
| #246 | [#249](https://github.com/awinogradov/code-assistants/pull/249) | @awinogradov |
| #236 | [#237](https://github.com/awinogradov/code-assistants/pull/237) | @awinogradov |
| #233 | [#234](https://github.com/awinogradov/code-assistants/pull/234) | @awinogradov |

### Features

* **autopilot:** add issue:run skill ([2dcdda1](https://github.com/awinogradov/code-assistants/commit/2dcdda1a634c208f60ead3a19a891b5347227ebe))
* **autopilot:** inline format rules into skills ([ebc8a89](https://github.com/awinogradov/code-assistants/commit/ebc8a89cc06d62b355e23821b38887fc57094963))
* **pr-review:** add logging, docs, service checks ([faf2b41](https://github.com/awinogradov/code-assistants/commit/faf2b41036f1b134c6f805e1cb1da0e223dfff5e))
* **pr-review:** load inline history, add checks ([79daac4](https://github.com/awinogradov/code-assistants/commit/79daac485a20ea33d8ada4355204fc00a1ec49ee))
* **pr-review:** load related todos for context ([68015b8](https://github.com/awinogradov/code-assistants/commit/68015b8cda6becd3395a43ebcc89c0607daea460))
* **rfc:** version the reference-formatting standard ([cdd6c04](https://github.com/awinogradov/code-assistants/commit/cdd6c042605c3f28cd4b3299fa61bcec6a4f8c64))
* support code-scanning-alert input type ([8262a80](https://github.com/awinogradov/code-assistants/commit/8262a80987d4a274b733c31ed387ccb9f97cfaa6))

### Documentation

* correct alert url source and skip list ([3312d8b](https://github.com/awinogradov/code-assistants/commit/3312d8bb550b886d93f5b1a4cb6f00fe4b674f15))
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
