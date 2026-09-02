---
name: commits-create
description: Analyze staged changes and create conventional commits with intelligent grouping. Use when creating commits, or when invoked from other skills.
argument-hint: "[optional commit context] [--autopilot]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Read
  - AskUserQuestion
  - Skill(autopilot:preflight-check)
  - Skill(autopilot:pr-update)
---

# Create Commit

Analyze changes and create git commits with conventional commit messages. Supports intelligent grouping of changes into multiple atomic commits for better review and changelog.

## When to Use

- When changes need to be committed
- When invoked from `/autopilot:commits-restructure` after soft reset
- When invoked from other skills that need to create commits

## Input

Arguments: `$ARGUMENTS`

Expected form:

- (no arguments) — auto-analyze staged changes
- `"<context>"` — free-form context that helps generate a better commit message (e.g., `"add auth feature"`)
- `--autopilot` — non-interactive mode used by `/autopilot:run`. Skips the [Phase 0](#phase-0-preflight-check) preflight (the calling chain already ran it), the commit-strategy prompt and the [Phase 5](#phase-5-update-pr) PR update, and commits directly using the auto-generated messages.

## Input resolution

Arguments are optional. When `$ARGUMENTS` is empty:

- **Commit context** — skip; rely on the diff itself (`git diff --staged`) plus recent conversation history (skill analyses, user instructions) to generate the message. Do NOT prompt.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false` (interactive mode). Strip from `$ARGUMENTS` before parsing the remainder as commit context.
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.
- **Existing PR** — detect via `gh pr view --json number,url 2>/dev/null` at [Phase 5](#phase-5-update-pr). No user prompt needed.

## Interactive dialogs

Three dialogs exist, and all three run only when `autopilotMode` is false: the [Phase 1](#phase-1-check-for-changes) file-selection question, the [Phase 3](#phase-3-choose-commit-strategy) commit-strategy prompt, and the validation-failure dialog that [Commit Message Validation](#commit-message-validation) escalates to after three failed attempts. A generated commit message is never presented for approval on the success path — the validation gate stands in for reading it.

When `autopilotMode` is true, none of them runs: generate the message(s), commit, and exit without prompting; a validation failure aborts loudly instead. When it is false and you reach the strategy prompt or the validation-failure dialog, read [`references/interactive-dialogs.md`](./references/interactive-dialogs.md) — it carries both dialogs' exact parameters and the AskUserQuestion contract governing them.

## Phase 0: Preflight Check

**Autopilot bypass:** parse `$ARGUMENTS` for `--autopilot` before anything else — the same parse [Phase 1](#phase-1-check-for-changes) step 0 performs, moved here so this phase can read it. When the flag is present, skip this phase entirely. The calling chain ran its own preflight before any git mutation, so the history-policy gate is already installed; the branch came from [`branch-create`](../branch-create/SKILL.md), which validated the name against the same regex the `commits`-mode check uses; and uncommitted changes are this skill's input rather than a hazard.

Otherwise invoke `Skill(autopilot:preflight-check)` with `mode: commits` from this conversation context. The skill verifies the current branch is appropriate for committing and warns if you are on `main`. If it outputs a "cancelled" message, stop immediately — do not proceed to [Phase 1](#phase-1-check-for-changes).

## Phase 1: Check for Changes

0. Parse `$ARGUMENTS`: if it contains `--autopilot`, strip the flag and set `autopilotMode = true`. Otherwise `autopilotMode = false`. The remainder (if any) is the commit context.
1. Run `git status` to see current state
2. If there are unstaged changes:
   - Show the list of modified/untracked files
   - Ask user which files to stage (specific files or all)
   - Stage the selected files with `git add`
3. If no staged changes after this step, abort with message

## Phase 2: Analyze and Categorize Changes

Invoke the `analyze-staged-changes` sub-agent to categorize staged files, assess changeset size, and recommend a commit strategy:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:analyze-staged-changes"
- `prompt`: "Analyze staged changes in the current repository."
- `description`: "Analyze staged changes"
```

After the agent completes, store the structured results (categories, file lists, strategy recommendation, recent commit style).

## Phase 3: Choose Commit Strategy

**Autopilot bypass:** If `autopilotMode` is true, do NOT call AskUserQuestion. Use single commit flow when `singleCommitRecommended: true`; otherwise use grouped commit flow. Proceed to [Phase 4](#phase-4-execute-commits).

Use the agent's analysis to decide the commit flow:

- **If agent recommends `singleCommitRecommended: true`:** single commit flow ([Phase 4](#phase-4-execute-commits))
- **If agent recommends `singleCommitRecommended: false`:** the changeset is large enough to consider splitting. Evaluate whether the changes represent genuinely distinct areas. If a single coherent commit message can describe all changes, use single commit flow. Otherwise ask the user, using the prompt in [`references/interactive-dialogs.md`](./references/interactive-dialogs.md#phase-3-commit-strategy-prompt) — read it now. "Separate commits" continues to [Phase 4](#phase-4-execute-commits) with the grouped flow, "Single commit" with the single-commit flow.

## Phase 4: Execute Commits

### Single Commit Flow

1. Run `git diff --staged` to see what will be committed
2. Read the diff carefully and identify:
   - The specific technical change (what was added, removed, or replaced)
   - The concrete modifications made (what files, functions, values, or behaviors changed)
3. Generate commit message following the format below — the title must name the specific thing that changed, and the body must list the concrete modifications
4. **WHAT-not-WHY validation**: Answer the rubric in the [WHAT-not-WHY Rule](#what-not-why-rule-mandatory) section for the generated title. If any rubric question fails, regenerate the title using only concrete technical details from the diff. Repeat up to 3 times. If the title still fails, hand it to the [validation failure dialog](./references/interactive-dialogs.md#validation-failure-dialog) with the failing check named — do not commit it.
5. Validate the composed candidate message with [Commit Message Validation](#commit-message-validation) — every checkable rule from the config plus commitlint when installed. On any violation, regenerate and re-validate (≤3 attempts); do not commit a message that still fails.
6. Run `git commit -m "<message>"`. There is no confirmation step: the message is derived from a diff the user just produced, and steps 4–5 are the gate that stands in for reading it. Continue to [Phase 5](#phase-5-update-pr).

### Grouped Commit Flow

#### Commit Ordering Principle

Every commit in a PR must leave the branch in a stable state — CI passes, lint rules are satisfied, tests pass for the code present at that point. Undocumented or untested code is acceptable; broken CI/lint is not.

**Default order:** `ci` → `chore`/`build` → `feat`/`fix`/`refactor` → `test` → `docs`

- `ci` first — CI/CD pipeline changes establish the rules
- `chore`/`build` — configuration and dependencies
- `feat`/`fix`/`refactor` — main implementation satisfies those rules
- `test` — tests verify implementation
- `docs` last — informational, never breaks stability

This is the default for the common case. Reason about the specific changes and deviate when needed. For example, if implementation changes are prerequisites for CI changes to pass, use `feat → ci → ...` instead. The goal is stability at every checkout, not rigid adherence to a fixed sequence.

Process categories in this order: `ci` → `chore`/`build` → `feat`/`fix`/`refactor` → `test` → `docs`

#### Step 1: Analyze all categories upfront

For each category that has files:

1. `git reset HEAD` (unstage all)
2. `git add <category files>`
3. `git diff --staged` — read the diff and identify what specifically changed (files, functions, values, behaviors)
4. Generate commit message for this category
5. Validate this category's composed candidate message with [Commit Message Validation](#commit-message-validation) — every checkable rule from the config plus commitlint when installed. On any violation, regenerate and re-validate (≤3 attempts) before moving to the next category; a message that still fails must not be committed.

After analyzing all categories, `git reset HEAD` to unstage everything.

#### Step 2: Execute commits

Every message was validated in Step 1, so there is nothing left to confirm. Execute all commits sequentially in category order:

- `git add <category files>`
- `git commit -m "<message>"`

After all commits:

```
✓ All N commits created successfully.
```

## Commit Message Format

```
<type>[optional scope]: <description>

- <what specifically changed>
- <what specifically changed>
```

The body is required for `feat`, `fix`, and `refactor` commits. It may be omitted for `docs`, `test`, `style`, `chore`, `ci`, `build`, `perf`, and `revert` commits where the title alone is fully descriptive.

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style (formatting, semicolons)
- `refactor` - Code restructure (no behavior change)
- `perf` - Performance improvements
- `test` - Tests
- `build` - Build system or dependencies
- `ci` - CI/CD configuration
- `chore` - Maintenance (tooling, deps)
- `revert` - Reverting a previous commit

### Rules

- Title: lowercase, no period, imperative mood, subject ≤ 50 characters — camelCase identifiers are not allowed in the subject. Enforced by commitlint and CI, and by the skill itself via [Commit Message Validation](#commit-message-validation) before every commit
- Title must name the specific thing that changed, not just the action
- Body required for `feat`, `fix`, and `refactor`. Body bullet points list concrete modifications
- Never use GitHub issue numbers or PR references in commit messages (issue linking happens on the PR via magic words)
- Never include AI agent `Co-authored-by` trailers (Claude, ChatGPT, Copilot, Codex). Disable co-authorship in your AI tool settings.
- Every commit must leave the branch in a stable state — CI passes, lint passes, tests pass for the code present at that point

### WHAT-not-WHY Rule (MANDATORY)

The title and body describe WHAT changed, never WHY. The title names the specific technical change so a reader knows what changed without opening the diff — motivation, review references, and rule citations belong nowhere in the message. Context from calling skills (e.g., "fixes for PR review comments") must NOT influence the title.

| WRONG (goal or vague)                       | CORRECT (names the change)                             |
| ------------------------------------------- | ------------------------------------------------------ |
| `fix: address review feedback`              | `fix(parser): replace bcrypt with argon2 for hashing`  |
| `feat: improve error handling`              | `feat(api): add retry with exponential backoff`        |
| body: `- CLAUDE.md enforces max-depth of 2` | body: `- Change nesting depth threshold from >5 to >2` |

**Rubric** — answer for the drafted title (and each body bullet):

1. Does it name the concrete thing that changed (file, function, value, or behavior)?
2. Would it still be true read against only the diff, with no conversation context?
3. Does any part state a goal, motivation, or reference (review, rule, coverage) instead of a change?

Pass = yes, yes, no. The binding conventions and examples are in [CONTRIBUTING.md § Commits](../../../../CONTRIBUTING.md#commits).

### Commit Message Validation

Run this on every fully-composed candidate message (title + optional body) BEFORE `git commit` — in both the Single and Grouped flows and in autopilot mode. It is the gate that guarantees a valid commit even when the husky `commit-msg` hook is absent (a fresh worktree that has not run `bun install` has no active hook, so nothing else catches a bad message).

**Read the config (ALWAYS runs — no dependencies; the real gate in fresh worktrees).** Read [commitlint.config.ts](../../../../commitlint.config.ts) — that file is the contract. Extract `type`, `subject` (the text after `type(scope): `), and `body` from the candidate message, then check them against every rule the config declares that is checkable by inspection (lengths, case, forbidden patterns, required bodies, allowed types). The first miss is a violation. Run any shell checks under `LC_ALL=C.UTF-8` so length and case folding are stable.

**Full commitlint (best-effort — only when installed).** If the binary is present (`[ -x node_modules/.bin/commitlint ]`), also run the same command the husky hook uses:

```bash
printf '%s\n' "<full message>" | bunx --no -- commitlint
```

Treat any reported problem as a violation. Gating on the binary's existence avoids an accidental network install in a bare worktree. If it is absent, skip this step silently — the read-and-check step already ran and is the gate.

**On any violation** — regenerate the message to fix the specific rule, then re-run the whole validation. Do NOT string-lowercase a subject to satisfy `subject-case` (that mangles identifiers, e.g. `localeForEmail` → `localeforemail`); instead rephrase the subject to avoid the mixed-case token (hyphenate or use plain words), or name the exact identifier in the backticked body — then re-confirm the subject still describes the change. Shorten to fix length. Retry up to 3 times.

**Success = every checkable declared rule passes** (plus commitlint when it ran), not just one rule. NEVER `git commit` a message that still fails. After 3 failed attempts:

- Interactive mode — open the [validation failure dialog](./references/interactive-dialogs.md#validation-failure-dialog) below.
- Autopilot mode — abort loudly with the failing rule(s); leave the index/staged state untouched and create no partial commit.

## Phase 5: Update PR

**Caller bypass:** Skip this entire phase when either holds — another skill owns the PR step and running it here would update the PR twice:

- `autopilotMode` is true — `/autopilot:run` creates or updates the PR itself in its next step.
- This skill was invoked from `Skill(autopilot:commits-restructure)` — that skill runs its own PR update after its force push, which is the correct moment. Updating here would push a description built from commits the remote has not received yet.

After all commits are created successfully:

1. Check if a PR exists for the current branch: `gh pr view --json number,url 2>/dev/null`
2. If the command fails (no PR), skip silently — do not show any message
3. If a PR exists, invoke `Skill(autopilot:pr-update)` with `--autopilot`: the PR already exists and the commits are already made, so refreshing its title and description to match them is bookkeeping, not a decision — the flag is what makes the callee skip its own dialogs.

## Examples

Worked call sites for the single, grouped, and failure paths live in [`references/examples.md`](./references/examples.md) — read it when a call site is ambiguous. The message shape itself is in [Commit Message Format](#commit-message-format) above.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
