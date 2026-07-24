---
name: run
description: Plan, implement, commit, create PR, and monitor until approved
argument-hint: "<task, GitHub/Linear issue (123, #123, ENG-123, or URL), or code-scanning alert (alert#N or URL)>"
allowed-tools:
  - TaskCreate
  - TaskUpdate
  - Read
  - Grep
  - Glob
  - Agent
  - Edit
  - Write
  - Bash(git *)
  - Bash(gh *)
  - Bash(sleep *)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
  - MCP(repomix:*)
  - AskUserQuestion
  - Skill(autopilot:gather-context)
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:branch-create)
  - Skill(autopilot:pr-monitor)
  - Skill(autopilot:pr-update)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

Plan, implement, commit, create a PR, and monitor until approved. Extended version of `/autopilot:plan` that automates the post-implementation steps.

**Difference from `/autopilot:plan`:** invoking `/autopilot:run` authorizes the entire flow up front — there is **no plan-approval gate**. Autopilot plans, implements, commits, creates a PR, and monitors for review approval without pausing for confirmation. (`/autopilot:plan` has two gates: it stops to get the plan approved, then asks again before creating a PR.)

## Input

Arguments: `$ARGUMENTS`

Expected forms (same as `plan`, minus the create-issue flags):

- `<task description>` — free-form description
- `<GitHub-issue-number>` / `<GitHub-issue-URL>`
- `<Linear-issue-id>` (e.g. `ENG-123`) or a Linear issue URL — when a `linear` tracker is configured
- `<code-scanning-alert>` — `alert#<n>` or a code-scanning alert URL

`--issue` / `--linear-issue` are plan-exclusive by design: `run` implements immediately, so filing a tracking issue first belongs to the deliberate path.

## Input resolution

Identical to the `plan` skill — see [its Input resolution section](../plan/SKILL.md#input-resolution).

## Task Progress Protocol

Create all 8 tasks with TaskCreate, in order, before any work. Set each to `in_progress` at the start of its phase and `completed` at the end.

| #   | Subject          | ActiveForm            |
| --- | ---------------- | --------------------- |
| 1   | Resolve input    | Resolving input       |
| 2   | Gather context   | Gathering context     |
| 3   | Draft plan       | Drafting plan         |
| 4   | Review and score | Reviewing and scoring |
| 5   | Finalize plan    | Finalizing plan       |
| 6   | Commit changes   | Committing changes    |
| 7   | Create PR        | Creating PR           |
| 8   | Monitor PR       | Monitoring PR         |

## Task

$ARGUMENTS

## Phase 0: Resolve input

Create the 8 tasks, then set task 1 to `in_progress`.

Detect the input type and id per [input-detection.md](../plan/references/input-detection.md) — the detection table and its tracker gating. Skip that file's create-issue flags section; it is plan-only. Detection is pure string matching and performs **no I/O**; do not fetch anything here.

Set task 1 to `completed`.

## Phase 1: Gather context

Set task 2 to `in_progress`. Invoke:

```
Skill(autopilot:gather-context)
```

Pass the detected input type, issue id, repository, repository root, Linear team (when applicable), and the raw task text as the task summary. The skill runs one parallel fan-out and returns the **Context Map**, which is this command's entire view of the repository.

Set task 2 to `completed`.

## Phase 2: Preflight verdict

The Context Map carries branch, worktree, `isStaleMerged`, and `baseAhead`. Compare the issue id against the current branch name for a mismatch. For anything ambiguous, or a state the map does not cover, invoke `Skill(autopilot:preflight-check)`. If it outputs "Planning cancelled", stop immediately.

`run` never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Common Instructions

The [Common Instructions in `plan/SKILL.md`](../plan/SKILL.md#common-instructions) apply here unchanged — documentation lookup scaled to the task, repository standards from the Context Map, the plan file header rule, CLAUDE.md compliance, and ASCII schemas.

## Phase 3: Draft, review, and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — draft (task 3), review and score (task 4), finalize (task 5) — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md).

## Phase 4: Embed branch creation and the autopilot chain

Embed both blocks into the plan file, then implement it. **Do NOT pause for plan approval** — invoking `/autopilot:run` is the approval. Never tell the user "after you approve I'll implement"; that is `/autopilot:plan` behavior.

### Pre-Implementation (branch creation)

Pick the body by input type from [branch-blocks.md](../plan/references/branch-blocks.md), using the **run variant** noted for each — it appends `--autopilot` so branch-create skips its confirmation. That file also defines when the block is emitted at all.

### Post-Implementation (REPLACES the pipeline's default)

**REPLACE** the `## Post-Implementation` section the pipeline template produced with this autopilot chain:

```
## Post-Implementation (Autopilot)

After all implementation steps and verification are complete, execute the following automatically. Do NOT present a "What's next?" AskUserQuestion — proceed through all steps without pausing.

### Step 1: Auto-Commit

Set task 6 ("Commit changes") to `in_progress`. Invoke `Skill(autopilot:commits-create)` with `--autopilot`. The flag suppresses the commit-strategy prompt, the commit-message confirmation, and the PR-update offer. Follow the skill's full workflow — do NOT run `git commit` directly.

If the commit fails due to a pre-commit hook, check `git status` for modified files (the hook may have auto-formatted), re-stage with `git add -u`, and retry once. If it still fails, report the error and stop.

After committing, push: `git push -u origin <branch>`. Set task 6 to `completed`.

### Step 2: Auto-Create PR

Set task 7 ("Create PR") to `in_progress`.

**CRITICAL — direct `gh pr create` and `gh pr edit` are FORBIDDEN in autopilot.** ALL PR creation and updates MUST go through `Skill(autopilot:pr-create)` and `Skill(autopilot:pr-update)`. Direct CLI calls produce PRs in the incorrect format. If a skill call fails or times out, report the error and stop — do NOT fall back to direct CLI commands.

1. Check whether a PR exists: `gh pr view --json number,url`
   - Exit code 0 (PR exists): invoke `Skill(autopilot:pr-update)` — NEVER `gh pr edit`. Proceed to the format check.
   - Exit code 1 (no PR): proceed with creation.
   - Other error (network/auth): report and stop.

2. Invoke `Skill(autopilot:pr-create)` with `--autopilot` (append `--release-notes` when the branch's commits include `feat:` or `fix:`). Release notes are added automatically for breaking changes regardless. NEVER run `gh pr create` directly — even if the skill fails.

Output the PR URL. Set task 7 to `completed`.

3. **Format check** — after creating or updating, run `gh pr view --json title,body` and verify:
   - The body contains `**Issues:**` as a section heading (skip for hotfix/trivial/maintenance/proposal/security branches). For a `security-*` branch, instead verify an `**Alert:**` reference and NO `Closes #` — alerts close on re-scan, not via PR magic words.
   - At least one `---` separator on its own line.
   - `**Issues:**` appears AFTER the last `---` separator (it must be the final section).
   - If `**Release notes:**` is present, it appears BEFORE `**Issues:**` and AFTER the description text.
   - The `**Issues:**` section uses magic words (`Closes`/`Related to`), not markdown links.

   If any check fails: output "PR format violation detected — skill may have been bypassed. Running pr:update to fix...", invoke `Skill(autopilot:pr-update)`, and re-validate once. If it still fails, output "PR format could not be auto-fixed. Manual review required." and continue.

### Step 3: Monitor PR

Set task 8 ("Monitor PR") to `in_progress`. Invoke `Skill(autopilot:pr-monitor)` in foreground mode (do NOT use the Agent tool with run_in_background). It polls for review status, invokes pr:resolve interactively if changes are requested, and waits for approval or merge.

**Autopilot override for pr:resolve:** when pr:monitor invokes pr:resolve and it presents the review-action gate via AskUserQuestion, auto-select "Address all". Replies post without prompting.

### Completion

Set task 8 to `completed`. Output:

Autopilot complete.
PR: <pr-url>
Status: <approved/merged>
```

## Phase 5: Implement and proceed

Once the plan file carries `## Pre-Implementation` and `## Post-Implementation (Autopilot)`, proceed straight through with no approval gate:

1. Run the `## Pre-Implementation` branch creation.
2. Implement every step in the plan, verifying each as you go.
3. Execute the autopilot chain — commit → push → PR → monitor — without prompting.

The only user prompts in the entire run are the branch-type pick for plain-description inputs and review-feedback handling during PR monitoring. There is no plan-approval step.

When you write the plan file, apply the reference-formatting rules inlined at the end of this skill (the **Reference formatting & readability** block below, RFC-0001) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as `[title](url)` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
