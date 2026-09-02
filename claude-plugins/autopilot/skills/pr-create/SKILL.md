---
name: pr-create
description: Create a pull request with validated title and description following repository conventions. Use when creating PRs, or when invoked from other skills.
argument-hint: "[--draft] [--release-notes] [--closes #N,#M] [--related #X,#Y] [--autopilot]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Read
  - AskUserQuestion
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:commits-create)
---

# Create PR

Create a pull request with properly formatted title and description following repository conventions. Supports issue linking, release notes, and draft PRs.

## When to Use

- When creating a new pull request for the current branch
- When invoked from other skills that need to create PRs

## Input

Arguments: `$ARGUMENTS`

Expected flags (all optional, any order):

- `--draft` — create as a draft PR
- `--release-notes` — force a release notes section into the body; [Phase 4](#phase-4-generate-pr-description) already adds one for breaking or meaningful changes
- `--closes #N,#M` — additional issue numbers to close on merge (comma-separated, GitHub issue numbers)
- `--related #X,#Y` — related issues to link without closing (comma-separated, GitHub issue numbers)
- `--autopilot` — non-interactive mode used by `/autopilot:run`. The PR is created from the generated title and body without confirmation for every caller, so the flag changes two things: [Phase 0](#phase-0-preflight-check) replaces the preflight the calling chain already ran with a bare `git status --porcelain` guard, and the [Phase 1](#phase-1-validate-current-state) invalid-branch path aborts loudly instead of asking how to proceed.

## Input resolution

Arguments are optional. Resolve each field in this order:

- **`--draft`** — `$ARGUMENTS` → default `false`. Do NOT prompt.
- **`--release-notes`** — `$ARGUMENTS` → otherwise decided by the [Phase 4](#phase-4-generate-pr-description) release-notes rule from the [Phase 2](#phase-2-gather-context) significance. Never prompt.
- **`--closes`** — `$ARGUMENTS` → branch-name-derived issue number is already added automatically in [Phase 4](#phase-4-generate-pr-description). No prompt; treat absence as intentional.
- **`--related`** — `$ARGUMENTS` → no inference. No prompt; treat absence as intentional.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false`, which differs only in how an invalid branch name is handled.
- **Branch + base + issue number** — from `git branch --show-current` and the branch-name pattern `^issue-([0-9]+)-`. Special prefix branches (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`) have no issue number. No prompt.
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.

## Completion Requirement

This workflow is not complete until [Phase 5](#phase-5-create-pull-request) executes `gh pr create` and outputs the PR URL. Generating a title, generating a description, or running validation does not constitute completion. Execute all five phases in sequence.

Do not call any skill not listed in `allowed-tools` above. The title and description rules in Phases 3-4 are the validation — there is no separate validation step.

## Phase 0: Preflight Check

**Autopilot bypass:** parse `$ARGUMENTS` for `--autopilot` before anything else — the same parse [Phase 1](#phase-1-validate-current-state) step 0 performs, moved here so this phase can read it. When the flag is present, skip the skill invocation and run the one check that still carries information the caller does not already have:

```bash
git status --porcelain
```

Non-empty output means the chain's commit step left changes behind. Abort with the file list rather than opening a PR that omits them — `--autopilot` has no user to prompt, so there is no "continue anyway" to offer. Everything else `pr`-mode preflight would do is settled by then: the history-policy gate is installed, the branch came from [`branch-create`](../branch-create/SKILL.md), and [Phase 1](#phase-1-validate-current-state) validates the branch name itself.

Otherwise invoke `Skill(autopilot:preflight-check)` with `mode: pr` from this conversation context. The skill verifies the current branch is appropriate for opening a PR and warns if you are on `main`. If it outputs a "cancelled" message, stop immediately — do not proceed to [Phase 1](#phase-1-validate-current-state).

## Phase 1: Validate Current State

Uncommitted-change handling is done in [Phase 0](#phase-0-preflight-check) — by `preflight-check` interactively, or by the autopilot bypass's own `git status --porcelain`. Do not repeat it here.

0. Parse `$ARGUMENTS`: if it contains `--autopilot`, set `autopilotMode = true` and remove the flag before further parsing. Otherwise `autopilotMode = false`.
1. Get current branch name with `git branch --show-current`
2. Validate the branch name against the branch grammar in [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md)
3. Determine the provider and issue reference from the branch, checking **in this order** (so `issue-` and the special prefixes are matched before the generic Linear pattern):
   - **GitHub** — matches `^issue-([0-9]+)-`: extract the number (e.g., `123`); `provider = github`; link as `Closes #123`.
   - **Special prefix** — starts with `hotfix-`/`trivial-`/`maintenance-`/`proposal-`/`security-`: uppercase it for the PR title prefix (e.g., `HOTFIX:`). For a `security-` branch, emit NO `Closes #` — record the code-scanning alert reference instead (see [Phase 4](#phase-4-generate-pr-description)).
   - **Linear** — matches `^([a-z][a-z0-9]*)-([0-9]+)-`: uppercase team + number to the Linear id (e.g., `eng-123-…` → `ENG-123`); `provider = linear`; the title gets the `ENG-123:` prefix and `**Issues:**` carries the magic word with the plain Linear issue URL — `Closes <linear-issue-url>` from the [Phase 2](#phase-2-gather-context) issue context (bare-id fallback, see [Phase 4](#phase-4-generate-pr-description)).
4. If the branch name matches none of the conventions above, ask how to proceed. This is the only dialog the skill owns — a plain two-option choice, presenting nothing for review.

   **Interactive mode only.** When `autopilotMode` is true, do not open it: abort loudly, naming the branch and the convention it violates, and create no PR.

   Tool parameters:
   - `question`: "The branch name does not follow the repository convention. Choose an action."
   - `header`: "Invalid branch"
   - `options`: [
     { label: "Create PR anyway", description: "Open the pull request from this branch with no issue link" },
     { label: "Cancel", description: "Stop so I can rename the branch first" }
     ]
   - `multiSelect`: false

   **Formatting Note:** Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

## Phase 2: Gather Context

Invoke the `analyze-pr-commits` sub-agent to gather commit history, diff summary, issue context, and change significance:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:analyze-pr-commits"
- `prompt`: "Analyze commits for PR. Base: main. Branch: [branch name]. Provider: [github or linear]. Issue number: [GitHub number, Linear id, or none]. Repository: [owner/repo]. Fetch issue: [true if a GitHub or Linear issue branch, false if special prefix]."
- `description`: "Analyze PR commits"
```

After the agent completes, store the structured results (commit log, diff summary, issue context, breaking/meaningful flags).

If the agent reports breaking changes, tell the user: "Breaking changes detected — release notes will be included automatically." The [Phase 4](#phase-4-generate-pr-description) release-notes rule is what acts on the flags.

## Phase 3: Generate PR Title

Read [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md) and generate a title that conforms to it. Beyond the grammar, the title must describe business value or user impact, be understandable by someone on their first day, and avoid implementation details and unexplained jargon.

**Title self-check (MANDATORY):** immediately before [Phase 5](#phase-5-create-pull-request), run the Title self-check from [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md) against the [Phase 1](#phase-1-validate-current-state) provider.

## Phase 4: Generate PR Description

Read [`pr-body-grammar.md`](../shared-rules/references/pr-body-grammar.md) and compose the body to it — section set, ordering, `---` separators, release-notes heading, and the `**Issues:**` magic-word rules.

**Release notes:** include the `**Release notes:**` section — between the description and `**Issues:**`, with `---` separators — whenever `--release-notes` was passed, [Phase 2](#phase-2-gather-context) reported breaking changes, or [`analyze-pr-commits`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/analyze-pr-commits.md#phase-3-analyze-change-significance) reported meaningful significance. This widens the old behaviour rather than preserving it: a meaningful but non-breaking change used to get the section only if the user asked for it at the confirmation prompt, and now always gets it. Dropping an unwanted section is a `pr-update` away and rewrites nothing, which is why there is no opt-out flag to decide.

**Reference formatting (MANDATORY):** the generated body — both the description and the release-notes section — MUST follow the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) — read it first. The rule that keeps regressing: render every mention of a standard consistently as a link to its versioned RFC by stable ID (e.g., `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`), never a mix of bare text and links in the same body. Before finalizing, self-check the drafted body: a bare 7–40-char hex token or a bare tracker id (`[A-Z][A-Z0-9]*-[0-9]+`) outside the `**Issues:**` section is a violation — link it per the block.

## Phase 5: Create Pull Request

This phase is mandatory. Do not end the workflow before executing these steps.

1. Check if branch is pushed to remote: `git ls-remote --heads origin <branch>`
2. If not pushed, push with: `git push -u origin <branch>`
3. Create PR using gh CLI:
   - If `--draft` flag was passed: `gh pr create --draft --title "<title>" --body "<body>"`
   - Otherwise: `gh pr create --title "<title>" --body "<body>"`
4. Output the PR URL
5. This is the final step of the workflow. The skill is complete only after outputting the PR URL.

## Examples

No confirmation dialog — the PR is created directly from the generated title and body. Each example below shows the command, the branch it runs on, and the section of the resulting PR that distinguishes it.

### Basic PR (closes branch issue only)

**Command:** `/autopilot:pr-create` · **Branch:** `issue-749-editor-theme-selection`

Meaningful changes detected (`feat:` commits), so release notes are added automatically.

```
Allow editor theme selection per workspace

Users can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.

- Added editor_theme per-workspace setting
- Falls back to the system theme if no preference is set

---

**Release notes:**

- Added per-workspace editor theme selection

---

**Issues:**

Closes #749
```

```
✓ Created PR: https://github.com/org/repo/pull/123
```

---

### PR with additional issues to close

**Command:** `/autopilot:pr-create --closes #750,#751` · **Branch:** `issue-749-editor-theme-selection`

```
**Issues:**

Closes #749
Closes #750
Closes #751
```

```
✓ Created PR: https://github.com/org/repo/pull/124
```

---

### PR with related issues

**Command:** `/autopilot:pr-create --related #600` · **Branch:** `issue-605-annotation-streaming`

```
**Issues:**

Closes #605
Related to #600
```

```
✓ Created PR: https://github.com/org/repo/pull/125
```

---

### Draft PR with multiple issue links

**Command:** `/autopilot:pr-create --draft --closes #21 --related #20` · **Branch:** `issue-21-annotation-playback-events`

`--draft` is decided up front, on the command line — there is no prompt at which to change your mind.

```
**Issues:**

Closes #21
Related to #20
```

```
✓ Created draft PR: https://github.com/org/repo/pull/126
```

---

### Special prefix PR (HOTFIX)

**Command:** `/autopilot:pr-create` · **Branch:** `hotfix-memory-leak-editor`

A special-prefix branch carries no issue number, so the body has no `**Issues:**` section.

```
HOTFIX: Fix memory leak in editor

Fixed a memory leak in the editor caused by unreleased document buffers.

- Properly dispose document buffers after editor close
```

```
✓ Created PR: https://github.com/org/repo/pull/127
```

---

### Special prefix PR (PROPOSAL)

**Command:** `/autopilot:pr-create` · **Branch:** `proposal-add-vim-keybindings`

```
PROPOSAL: Add Vim keybindings

Proposes Vim-style modal keybindings as an opt-in editor mode. Discussion on this PR will decide if we adopt it.

- Sketch of normal/insert/visual mode bindings
- Opt-in via editor.mode setting
```

```
✓ Created PR: https://github.com/org/repo/pull/131
```

---

### PR with forced release notes

**Command:** `/autopilot:pr-create --release-notes` · **Branch:** `issue-749-editor-theme-selection`

The flag forces the section even when the significance check would not have.

```
**Release notes:**

- Added per-workspace editor theme selection
- Default theme fallback when no workspace preference is set
```

```
✓ Created PR: https://github.com/org/repo/pull/128
```

---

### PR with breaking changes

**Command:** `/autopilot:pr-create` · **Branch:** `issue-400-remove-legacy-plan-import`

Breaking changes detected (`feat!:` commit), so release notes are mandatory regardless of the flag.

```
**Release notes:**

- BREAKING: Removed legacy plan-import v1 endpoints — migrate to /api/v2
```

```
✓ Created PR: https://github.com/org/repo/pull/129
```

---

### PR with automatic release notes

**Command:** `/autopilot:pr-create` · **Branch:** `issue-801-add-billing-export`

Meaningful changes detected (`feat:` commits). The section is added without asking — it is behaviour now, not an offer.

```
**Release notes:**

- Added monthly billing export as CSV
```

```
✓ Created PR: https://github.com/org/repo/pull/130
```

---
