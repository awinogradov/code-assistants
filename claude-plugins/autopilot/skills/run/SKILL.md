---
name: run
description: Plan and implement, then either report verified no repository change or deliver a PR; a Linear-issue input also gets the finalized plan stored on its ticket before implementation
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
  - Bash(command -v graphify)
  - Bash(graphify query *)
  - Bash(graphify path *)
  - Bash(graphify explain *)
  - Bash(graphify affected *)
  - Bash(graphify --help)
  - Bash(command -v entire)
  - Bash(entire *)
  - MCP(repomix:*)
  - MCP(linear:*)
  - ToolSearch
  - AskUserQuestion
  - Skill(autopilot:gather-context)
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:branch-create)
  - Skill(autopilot:pr-monitor)
  - Skill(autopilot:pr-update)
  - Skill(autopilot:commits-create)
  - Skill(autopilot:pr-create)
---

Plan and implement a task, then finish through one of two terminal paths: report a verified no-repository-change outcome, or commit, create a PR, and monitor until approved. Extended version of `/autopilot:plan` that automates the post-implementation steps.

**Difference from `/autopilot:plan`:** invoking `/autopilot:run` authorizes the entire flow up front — there is **no plan-approval gate**. Autopilot plans and implements without pausing, then either proves that the completed task required no repository change or delivers the repository change through a monitored PR. (`/autopilot:plan` has two gates: it stops to get the plan approved, then asks again before creating a PR.)

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

Invoke `Skill(autopilot:preflight-check)` with `mode: plan`, **unconditionally**. This is the session's single preflight, and the one place [`preflight-check`](../preflight-check/SKILL.md)'s [history-policy gate](../preflight-check/SKILL.md#phase-0-history-policy-gate) installs — a gate that then applies for the rest of the session. A conditional invocation is what made that gate skippable: on a branch the Context Map fully described, the chain installed it never, while `branch-create`, `commits-create` and `pr-create` each re-installed it later.

Pass the Context Map's branch, worktree, `isStaleMerged`, and `baseAhead`, plus the issue-id-versus-branch-name comparison, so the skill prompts only where the map leaves a real decision. If it outputs "Planning cancelled", stop immediately.

Because this step ran, every later step in this chain skips its own Phase 0 preflight under `--autopilot`.

`run` never enters plan mode — do NOT call `EnterPlanMode` or `ExitPlanMode`.

## Common Instructions

The [Common Instructions in `plan/SKILL.md`](../plan/SKILL.md#common-instructions) apply here unchanged — documentation lookup scaled to the task, repository standards from the Context Map, the plan file header rule, CLAUDE.md compliance, and ASCII schemas.

## Phase 3: Draft, review, and finalize

Execute the shared pipeline in [pipeline.md](../plan/references/pipeline.md) — draft (task 3), review and score (task 4), finalize (task 5) — resolving your stack's deltas from [stack-deltas.md](../plan/references/stack-deltas.md).

## Phase 4: Embed branch creation and the autopilot chain

Choose the plan's terminal path, embed the matching blocks, then implement it. **Do NOT pause for plan approval** — invoking `/autopilot:run` is the approval. Never tell the user "after you approve I'll implement"; that is `/autopilot:plan` behavior.

A plan is a no-repository-change candidate only when its finalized implementation steps explicitly require no repository file changes and instead close the task through an external action, verification, or a proven no-action-needed result. An empty or missing `## Files` section is not that declaration. For every other plan, use the repository-delivery path.

### Pre-Implementation (branch creation)

For a repository-delivery plan, pick the body by input type from [branch-blocks.md](../plan/references/branch-blocks.md), using the **run variant** where one is noted — it appends `--autopilot` so branch-create skips its confirmation. Issue and Linear inputs have no run variant: their names are derived from the tracked issue and are never confirmed, so both callers emit the same body. That file also defines when the block is emitted at all.

For a no-repository-change candidate, omit `## Pre-Implementation` and defer branch creation. Implementation may still discover that repository changes are required; [Phase 5](#phase-5-implement-and-proceed) routes that case back to repository delivery before anything is committed.

### Post-Implementation (REPLACES the pipeline's default)

For a repository-delivery plan, **REPLACE** the `## Post-Implementation` section the pipeline template produced with this body, which tells the reader the tail is automated:

```
## Post-Implementation (Autopilot)

Once every step above is done and verified, the rest runs automatically, with no approval prompt:

1. Update any `README.md`, `docs/*`, and `rfc/*` this change affects. Editing the content of an Accepted RFC also means bumping its `version` frontmatter and adding a Changelog entry.
2. Commit the change and push the branch.
3. Open a pull request, or update the existing one.
4. Monitor the pull request until the review approves it or it merges, addressing review feedback as it arrives.
```

For a no-repository-change candidate, replace it with this body instead:

```
## Post-Implementation (Autopilot)

Once every step above is done and verified, confirm that the repository remains unchanged and report the completed external action or verified result. Do not create a branch, commit, push, or pull request unless implementation discovers that repository files must change.
```

The steps below are how those bodies are carried out. They are instructions for you, not text for the plan file — the plan file is what the reader sees, so it stays prose (see the **Plan file is output, not instructions** rule in [`plan/SKILL.md`](../plan/SKILL.md#plan-file-is-output-not-instructions)). Execute them in [Phase 5](#phase-5-implement-and-proceed) without pausing, and never present a "What's next?" AskUserQuestion.

#### No-repository-change exit

Take this exit only when all of the following are true:

1. The finalized plan explicitly requires no repository file changes.
2. Confirm that every implementation step and its `verify:` line passed. An empty diff alone is never evidence of completion. If any action or verification failed, stop and report the failed verification.
3. `git status --porcelain` produces no output.
4. `git diff --quiet origin/main...HEAD` exits successfully.
5. `git log --oneline origin/main..HEAD` produces no output.

If the plan expected repository changes but the diff is empty, the task is incomplete: report that mismatch and stop. If implementation discovered repository changes or topic commits, do not take this exit; create the deferred branch when needed and continue through Auto-Commit.

When every condition passes, do not invoke `branch-create`, `commits-create`, `git push`, `pr-create`, `pr-update`, or `pr-monitor`. Set tasks 6–8 to `completed` as not applicable, then output:

```
Autopilot complete.
Outcome: no_repository_change
Summary: <what resolved the task>
Evidence:
- <verification or external-action receipt>
```

Otherwise continue with the repository-delivery steps below.

#### Step 1: Auto-Commit

Set task 6 ("Commit changes") to `in_progress`. Invoke `Skill(autopilot:commits-create)` with `--autopilot`. The flag suppresses the commit-strategy prompt and the skill's own PR update (this chain creates or updates the PR itself in Step 2), and turns a validation failure into a loud abort instead of a prompt. Follow the skill's full workflow — do NOT run `git commit` directly.

If the commit fails due to a pre-commit hook, check `git status` for modified files (the hook may have auto-formatted), re-stage with `git add -u`, and retry once. If it still fails, report the error and stop.

After committing, push: `git push -u origin <branch>`. Set task 6 to `completed`.

#### Step 2: Auto-Create PR

Set task 7 ("Create PR") to `in_progress`.

PR creation and updates go through `Skill(autopilot:pr-create)` and `Skill(autopilot:pr-update)`, which own the PR title and body grammar. Never fall back to raw `gh pr create` or `gh pr edit`, even when a skill call fails or times out — surface the failure and stop instead.

1. Check whether a PR exists: `gh pr view --json number,url`
   - Exit code 0 (PR exists): invoke `Skill(autopilot:pr-update)` with `--autopilot`. Proceed to the format check.
   - Exit code 1 (no PR): proceed with creation.
   - Other error (network/auth): report and stop.

2. Invoke `Skill(autopilot:pr-create)` with `--autopilot` (append `--release-notes` when the branch's commits include `feat:` or `fix:`). Release notes are added automatically for breaking changes regardless.

Output the PR URL. Set task 7 to `completed`.

3. **Format check** — after creating or updating, run `gh pr view --json title,body`. If the body does not match [`pr-body-grammar.md`](../shared-rules/references/pr-body-grammar.md), invoke `Skill(autopilot:pr-update)` with `--autopilot` once more and re-check; if it still does not match, report it and continue.

#### Step 3: Monitor PR

Set task 8 ("Monitor PR") to `in_progress`. Invoke `Skill(autopilot:pr-monitor)` in foreground mode (do NOT use the Agent tool with run_in_background). It polls for review status, invokes pr-resolve interactively if changes are requested, and waits for approval or merge.

**Autopilot override for pr-resolve:** when pr-monitor invokes pr-resolve and it presents the review-action gate via AskUserQuestion, auto-select "Address all". Replies post without prompting.

#### Completion

Set task 8 to `completed`. Output:

```
Autopilot complete.
PR: <pr-url>
Status: <approved/merged>
```

### Persist the plan to Linear

Runs only when the detected input type is `linear-issue` (the type named by [input-detection.md](../plan/references/input-detection.md)'s detection table); every other input type skips this subsection and keeps its current behavior. It executes once both blocks above are embedded and before any step of [Phase 5](#phase-5-implement-and-proceed) runs, so the source ticket carries the finalized plan before implementation starts. This is chain work between tasks 5 and 6 — the task table stays as it is.

The store is [`linear-plan`](../linear-plan/SKILL.md)'s, executed by reference rather than restated: fill [the emission template](../linear-plan/SKILL.md#the-emission-template) from the finalized plan file under [the stored plan format](../linear-plan/SKILL.md#the-stored-plan-format) and [Linear-safe markdown](../linear-plan/SKILL.md#linear-safe-markdown) rules, then perform [the write](../linear-plan/SKILL.md#the-write)'s read, anchor, preserved-prefix, write, and recovery steps. Resolve `get_issue` and `save_issue` per [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md). Three deltas, and only these:

- The header's `Stored by` field reads `/autopilot:run`, so the ticket records which skill wrote the plan.
- The header's `Score:` field carries this run's panel verdicts — the review is always-on for the `run` family, so it is never the literal `skipped`.
- The write's title-refresh and board-transition steps do not run: this same session immediately executes the ticket, so the planned-and-ready hand-off signal belongs to the deliberate `linear-plan` path, and [`branch-create`](../branch-create/SKILL.md) moves the ticket to "In Progress" moments later via `--start`.

When the plan is a no-repository-change candidate with no `## Pre-Implementation` section, the stored `### Pre-Implementation` states in one line that no branch is created because the plan requires no repository change.

Re-running against the same ticket replaces the stored plan and never stacks a second wrapper — that idempotence is the write's anchor rule, inherited by reference. A failed, refused, or unavailable write — the preserved-prefix abort and an unresolvable Linear MCP included — is reported loudly with the full plan text emitted into the transcript, so the store is recoverable by hand; then the run continues. The store is an audit write and never gates delivery. No `Skill(...)` dispatch is involved: the update happens in place, in this session.

## Phase 5: Implement and proceed

Once the plan file carries the applicable blocks — and, for a `linear-issue` input, the plan is stored on the ticket or its failure loudly reported — proceed straight through with no approval gate:

1. For a repository-delivery plan, create the branch per the **Mechanics** paragraph beside the matching block in [branch-blocks.md](../plan/references/branch-blocks.md), using the run variant where one is noted. The plan file's `## Pre-Implementation` states the outcome; that paragraph carries the invocation. For a no-repository-change candidate, defer this step.
2. Implement every step in the plan, verifying each as you go.
3. Evaluate the [no-repository-change exit](#no-repository-change-exit). If it passes, report that outcome and stop. If it does not apply and branch creation was deferred, create the branch before repository files change; if files already changed, preserve them while invoking `branch-create` and confirm the worktree afterward.
4. Execute the autopilot chain — commit → push → PR → monitor — per [Phase 4](#phase-4-embed-branch-creation-and-the-autopilot-chain)'s Step 1 through Completion, without prompting.

Repository questions that come up while implementing step 2 are served from the plan's `## Context source` section — on the graph tier its shortlist first, since each entry already carries the relationship that put it there, and a further `graphify` query only when the shortlist does not cover the question. Reads outside it carry the `context-fallback:` line from the [shared block's taxonomy](../shared-rules/references/repomix-snapshot.md). The section exists because implementation frequently happens in a session that never ran the query, and a source name alone leaves that session re-collecting a repository someone already mapped. A plan with no such section is an unrecorded source: fall back to the taxonomy and carry on.

The only user prompts in the entire run are the branch-type pick for plain-description inputs and review-feedback handling during PR monitoring. There is no plan-approval step.

When you write the plan file, apply the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001, read it first) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
