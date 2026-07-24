---
name: commits:create
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
- `--autopilot` — non-interactive mode used by `/autopilot:run`. Skips the commit-strategy prompt and the [Phase 5](#phase-5-update-pr) PR update, and commits directly using the auto-generated messages.

## Input resolution

Arguments are optional. When `$ARGUMENTS` is empty:

- **Commit context** — skip; rely on the diff itself (`git diff --staged`) plus recent conversation history (skill analyses, user instructions) to generate the message. Do NOT prompt.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false` (interactive mode). Strip from `$ARGUMENTS` before parsing the remainder as commit context.
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.
- **Existing PR** — detect via `gh pr view --json number,url 2>/dev/null` at [Phase 5](#phase-5-update-pr). No user prompt needed.

## AskUserQuestion Contract (MANDATORY)

**Autopilot bypass:** When `autopilotMode` is true (from [Phase 1](#phase-1-check-for-changes)), this contract is moot — the strategy prompt is skipped and a validation failure aborts instead of prompting. Generate the commit message(s), commit directly, and exit without prompting.

The rules below govern two dialogs, and both MUST follow them:

- the [Phase 3](#phase-3-choose-commit-strategy) commit-strategy prompt — a plain choice, no `preview`;
- the [validation failure dialog](#validation-failure-dialog) — reached only when three attempts fail to compose a valid message, and the one place a commit message is ever shown for review.

[Phase 1](#phase-1-check-for-changes) may also ask which files to stage when the working tree has unstaged changes. That is a file-selection question rather than content presented for review, so this contract does not govern it.

A generated commit message is never presented for approval on the success path; [Commit Message Validation](#commit-message-validation) is what gates it.

1. **`question` is FIXED TEXT** — use the EXACT string specified. NEVER add commit messages, file names, diffs, metadata, or any other content to the question field.
2. **`header` is FIXED TEXT** — use the EXACT string specified.
3. **`label` values are EXACT** — use the exact text specified (e.g., "Reword", "Cancel"). No abbreviations, no paraphrasing, no creative alternatives.
4. **`description` values are EXACT** — use the exact text specified. No rewording.
5. **ALL options are REQUIRED** — include every option listed. NEVER omit "Cancel".
6. **`preview` belongs to the failure dialog only** — the failing commit message goes ONLY in `preview`, and NEVER in `question`, `label`, or `description`. All of that dialog's options carry identical preview text, since the user is choosing an action, not content. The strategy prompt takes no `preview`.
7. **SUBSTITUTE every placeholder in `preview`** — the template uses `<commit message>` as a placeholder. Before invoking AskUserQuestion, replace it with the full failing message (title + body, literal `\n` escape sequences for line breaks). NEVER pass the literal string `<commit message>`, nor the shorthand `"..."`, `"<same>"`, or any placeholder.

### WRONG — message in the question field, no preview, missing Cancel

```
AskUserQuestion({
  question: "feat(auth): add JWT refresh endpoint\n\nsubject-case failed. Reword it?",
  header: "Fix message",
  options: [
    { label: "Yes", description: "Type a new one" }
  ]
})
```

### CORRECT

```
AskUserQuestion({
  question: "The generated commit message still fails validation. Choose an action.",
  header: "Invalid message",
  options: [
    { label: "Reword", description: "Provide a corrected commit message", preview: "feat(auth): add JWT refresh endpoint\n\n- Added /auth/refresh endpoint\n\nFails: subject-case — the subject must be all lowercase" },
    { label: "Cancel", description: "Abort commit creation", preview: "feat(auth): add JWT refresh endpoint\n\n- Added /auth/refresh endpoint\n\nFails: subject-case — the subject must be all lowercase" }
  ]
})
```

## Phase 0: Preflight Check

Invoke `Skill(autopilot:preflight-check)` with `mode: commits` from this conversation context. The skill verifies the current branch is appropriate for committing and warns if you are on `main`. If it outputs a "cancelled" message, stop immediately — do not proceed to [Phase 1](#phase-1-check-for-changes).

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
- **If agent recommends `singleCommitRecommended: false`:** the changeset is large enough to consider splitting. Evaluate whether the changes represent genuinely distinct areas. If a single coherent commit message can describe all changes, use single commit flow. Otherwise, ask the user:

  **Formatting Note:** Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

  Tool parameters:
  - `question`: "How would you like to commit these changes?"
  - `header`: "Commit strategy"
  - `options`: [
    { label: "Single commit (Recommended)", description: "One commit with a comprehensive message" },
    { label: "Separate commits", description: "Create N atomic commits by category" }
    ]
  - `multiSelect`: false

- **If user chooses "Separate commits":** Continue to [Phase 4](#phase-4-execute-commits) with grouped flow
- **If user chooses "Single commit":** Continue to [Phase 4](#phase-4-execute-commits) with single commit flow

## Phase 4: Execute Commits

### Single Commit Flow

1. Run `git diff --staged` to see what will be committed
2. Read the diff carefully and identify:
   - The specific technical change (what was added, removed, or replaced)
   - The concrete modifications made (what files, functions, values, or behaviors changed)
3. Generate commit message following the format below — the title must name the specific thing that changed, and the body must list the concrete modifications
4. **WHAT-not-WHY validation**: Check the generated title against the WHY signal words and vague signal words listed in the WHAT-not-WHY Rule section below. If the title contains any of those words followed by abstract goals (not technical specifics), or contains the words "review", "feedback", "comments", or "suggestions", regenerate the title using only concrete technical details from the diff. Repeat up to 3 times. If the title still fails, hand it to the [validation failure dialog](#validation-failure-dialog) with the failing check named — do not commit it.
5. Validate the composed candidate message with [Commit Message Validation](#commit-message-validation) — the full inline floor (length, `subject-case`, and the other checkable commitlint rules) plus commitlint when installed. On any violation, regenerate and re-validate (≤3 attempts); do not commit a message that still fails.
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
5. Validate this category's composed candidate message with [Commit Message Validation](#commit-message-validation) — the full inline floor plus commitlint when installed. On any violation, regenerate and re-validate (≤3 attempts) before moving to the next category; a message that still fails must not be committed.

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

- Title: lowercase, no period, imperative mood. The subject (text after `type(scope): `) MUST be all lowercase — camelCase identifiers are not allowed (`subject-case`) — MUST NOT exceed 50 characters, and the whole header line (`type(scope): subject`) MUST NOT exceed 100 characters. Enforced by commitlint (`subject-case` / `subject-max-length` / `header-max-length`) and CI, and by the skill itself via [Commit Message Validation](#commit-message-validation) before every commit
- Title must name the specific thing that changed, not just the action
- Body required for `feat`, `fix`, and `refactor`. Body bullet points list concrete modifications
- Never use GitHub issue numbers or PR references in commit messages (issue linking happens on the PR via magic words)
- Never include AI agent `Co-authored-by` trailers (Claude, ChatGPT, Copilot, Codex). Disable co-authorship in your AI tool settings.
- Every commit must leave the branch in a stable state — CI passes, lint passes, tests pass for the code present at that point

### WHAT-not-WHY Rule (MANDATORY)

Both the title and body MUST describe WHAT changed, NEVER WHY it changed. Context from calling skills (e.g., "fixes for PR review comments") must NOT influence the title — the title must describe what changed in the code.

**Title:** Name the specific technical change. Do NOT state the motivation, goal, or intent behind the change.

| WHY-focused (WRONG)                       | WHAT-focused (CORRECT)                                |
| ----------------------------------------- | ----------------------------------------------------- |
| `fix: close coverage gaps`                | `fix(auth): add null-check and expiry validation`     |
| `fix: address review feedback`            | `fix(parser): replace bcrypt with argon2 for hashing` |
| `refactor: ensure compliance with rules`  | `refactor(lint): change nesting depth threshold to 2` |
| `feat: improve error handling`            | `feat(api): add retry with exponential backoff`       |
| `fix: cover edge cases`                   | `fix(validator): handle null and empty-string inputs` |
| `refactor: address code quality concerns` | `refactor(db): extract connection pool into module`   |

**Body:** List the concrete modifications. Do NOT explain reasoning or reference rules.

| WHY-focused body bullet (WRONG)                | WHAT-focused body bullet (CORRECT)                   |
| ---------------------------------------------- | ---------------------------------------------------- |
| `- CLAUDE.md enforces max-depth of 2`          | `- Change nesting depth threshold from >5 to >2`     |
| `- Tests were missing for auth edge cases`     | `- Add tests for expired token and null user inputs` |
| `- Review requested switching to argon2`       | `- Replace bcrypt with argon2 in hashPassword()`     |
| `- Needed to close coverage gap in validation` | `- Add boundary checks for negative and zero values` |

**WHY signal words to avoid in titles:** "close", "address", "ensure", "improve", "cover", "resolve", "satisfy", "comply", "meet" (when followed by abstract goals rather than technical specifics — e.g., "handle edge cases" is WHY, "handle null input in parseToken" is WHAT)

### Anti-patterns

The title must "contain the answer" — a reader should understand what changed without opening the diff.

| Bad (vague)                  | Good (specific)                                          | Why                                 |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------- |
| `fix: review updates`        | `fix(auth): replace bcrypt with argon2 for hashing`      | Names the actual replacement        |
| `fix: resolve issue`         | `fix(api): return 404 instead of 500 for missing users`  | States the concrete behavior change |
| `feat: add new feature`      | `feat(billing): add monthly invoice PDF export`          | Names the specific feature          |
| `refactor: clean up code`    | `refactor(db): extract query builder from repository`    | Names what was extracted            |
| `chore: update dependencies` | `chore(deps): upgrade zod from 3.21 to 3.23`             | Names the package and versions      |
| `fix: close coverage gaps`   | `fix(auth): add null-check and expiry validation`        | Names what was actually added       |
| `refactor: address feedback` | `refactor(parser): extract tokenizer into separate file` | Names the structural change         |

**Vague signal words to avoid in titles:** "update", "fix stuff", "changes", "improvements", "tweaks", "adjustments", "various", "some", "misc", "review updates", "address feedback", "resolve issue", "close gaps", "cover edge cases", "ensure compliance", "improve handling", "address concerns", "satisfy requirements"

### Commit Message Validation

Run this on every fully-composed candidate message (title + optional body) BEFORE `git commit` — in both the Single and Grouped flows and in autopilot mode. It is the gate that guarantees a valid commit even when the husky `commit-msg` hook is absent (a fresh worktree that has not run `bun install` has no active hook, so nothing else catches a bad message). It mirrors the rules in [commitlint.config.mjs](../../../../commitlint.config.mjs) — that file is the source of truth; keep this list in sync with it. Run the shell snippets under `LC_ALL=C.UTF-8` so length and case folding are stable.

Extract `type`, `subject` (the text after `type(scope): `), and `body` from the candidate message.

**Inline floor (ALWAYS runs — no dependencies; the real gate in fresh worktrees).** Each check maps to a commitlint rule; the first miss is a violation:

- `subject-max-length` / `header-max-length` — subject ≤ 50 (`printf '%s' "<subject>" | wc -m`), full header ≤ 100 (`printf '%s' "<title>" | wc -m`).
- `subject-case` (lower-case) — the subject must equal its lowercased form: `printf '%s' "<subject>" | tr '[:upper:]' '[:lower:]'` must be byte-identical to `<subject>`. Any difference means an uppercase letter is present (e.g. a camelCase identifier like `localeForEmail`). This is an ASCII approximation; when commitlint runs below it is authoritative for non-ASCII.
- `subject-full-stop` — the subject must not end with `.`.
- `no-issue-id-in-subject` — the subject must not match `[A-Za-z]+-[0-9]+`.
- `body-required-for-types` — if `type` is `feat`, `fix`, or `refactor`, `body` must be non-empty.
- `no-ai-coauthored-by` — the raw message must not contain a `Co-authored-by:` trailer naming Claude, ChatGPT, Copilot, Codex, Devin, or Cursor.
- `type-enum` / `type-case` — `type` must be one of the lowercase types listed under [Types](#types).

**Full commitlint (best-effort — only when installed).** If the binary is present (`[ -x node_modules/.bin/commitlint ]`), also run the same command the husky hook uses:

```bash
printf '%s\n' "<full message>" | bunx --no -- commitlint
```

Treat any reported problem as a violation. Gating on the binary's existence avoids an accidental network install in a bare worktree. If it is absent, skip this step silently — the inline floor already ran and is the gate.

**On any violation** — regenerate the message to fix the specific rule, then re-run the whole validation. Do NOT string-lowercase a subject to satisfy `subject-case` (that mangles identifiers, e.g. `localeForEmail` → `localeforemail`); instead rephrase the subject to avoid the mixed-case token (hyphenate or use plain words), or name the exact identifier in the backticked body — then re-confirm the subject still describes the change. Shorten to fix length. Retry up to 3 times.

**Success = the whole inline floor passes** (plus commitlint when it ran), not just one rule. NEVER `git commit` a message that still fails. After 3 failed attempts:

- Interactive mode — open the [validation failure dialog](#validation-failure-dialog) below.
- Autopilot mode — abort loudly with the failing rule(s); leave the index/staged state untouched and create no partial commit.

#### Validation failure dialog

The single interactive escape hatch in this skill, shared by the [Phase 4](#phase-4-execute-commits) WHAT-not-WHY check and the 3-attempt validation failure above. Because the success path no longer shows the user a message, this dialog is the only place one is ever presented — so use it verbatim rather than improvising a prompt, and obey the [AskUserQuestion Contract](#askuserquestion-contract-mandatory).

**Interactive mode only.** When `autopilotMode` is true, neither caller opens it: abort loudly with the failing rule(s), leave the index untouched, and create no partial commit.

Substitute `<commit message>` with the failing message followed by a blank line and a `Fails: <rule> — <what is wrong>` line, identically on both options.

Tool parameters:

- `question`: "The generated commit message still fails validation. Choose an action."
- `header`: "Invalid message"
- `options`: [
  { label: "Reword", description: "Provide a corrected commit message", preview: "<commit message>" },
  { label: "Cancel", description: "Abort commit creation", preview: "<commit message>" }
  ]
- `multiSelect`: false

If "Reword" is selected, take the user's message and re-run the whole of [Commit Message Validation](#commit-message-validation) on it — a hand-typed subject is validated too, never committed unchecked — reopening this dialog while it fails. If "Cancel" is selected, abort with "Commit cancelled." and create no commit; in the grouped flow, abort every remaining commit with "Commits cancelled."

## Phase 5: Update PR

**Caller bypass:** Skip this entire phase when either holds — another skill owns the PR step and running it here would update the PR twice:

- `autopilotMode` is true — `/autopilot:run` creates or updates the PR itself in its next step.
- This skill was invoked from `Skill(autopilot:commits-restructure)` — that skill runs its own PR update after its force push, which is the correct moment. Updating here would push a description built from commits the remote has not received yet.

After all commits are created successfully:

1. Check if a PR exists for the current branch: `gh pr view --json number,url 2>/dev/null`
2. If the command fails (no PR), skip silently — do not show any message
3. If a PR exists, invoke `Skill(autopilot:pr-update)` directly. Do not ask first: the PR already exists and the commits are already made, so refreshing its title and description to match them is bookkeeping, not a decision.

## Examples

### Single Commit

```
feat(auth): add jwt token refresh endpoint

- Added /auth/refresh endpoint that issues new access token from refresh token
- Added 7-day expiry validation for refresh tokens
- Returns 401 with "refresh_expired" code when token is past expiry
```

```
fix(api): return 404 instead of 500 for missing user lookup

- Changed UserService.findById to return null instead of throwing
- Added explicit 404 response in GET /users/:id handler
```

```
docs: add environment variables reference to readme
```

### Grouped Commits

```
Analyzing staged changes...

Detected 3 categories:
- impl: 3 files (auth.ts, auth.types.ts, index.ts)
- test: 1 file (auth.test.ts)
- docs: 2 files (docs/auth.md, docs/api-reference.md)

How would you like to commit these changes?
```

User selects "Separate commits" via AskUserQuestion tool — the one prompt in this flow, because the analyzer recommends a strategy but does not decide it.

Every category's message is then generated and validated upfront, and the commits are created in category order with no further prompting:

```
✓ Created commit: feat(auth): implement jwt validation
✓ Created commit: test(auth): add jwt validation tests
✓ Created commit: docs: update authentication documentation

All 3 commits created successfully.
```

### Single Category (No Grouping Offered)

```
Analyzing staged changes...

All changes are in 1 category (impl).
```

No strategy prompt and no message confirmation — the message is generated, validated, and committed:

```
✓ Created commit: feat(auth): implement jwt validation
```

### With an existing PR

After committing on a branch that already has a PR, [Phase 5](#phase-5-update-pr) refreshes it without asking:

```
✓ Created commit: feat(auth): add password reset flow
✓ Updated PR #15: https://github.com/org/repo/pull/15
```

On a branch with no PR, the skill finishes at the commit and says nothing about pull requests.

### Validation failure

When three attempts still produce an invalid message, the [validation failure dialog](#validation-failure-dialog) is the one place a message is shown for review:

AskUserQuestion with:

- `question`: "The generated commit message still fails validation. Choose an action."
- `header`: "Invalid message"
- `options`: [
  { label: "Reword", description: "Provide a corrected commit message", preview: "feat(auth): add JWT refresh endpoint\n\n- Added /auth/refresh endpoint\n\nFails: subject-case — the subject must be all lowercase" },
  { label: "Cancel", description: "Abort commit creation", preview: "feat(auth): add JWT refresh endpoint\n\n- Added /auth/refresh endpoint\n\nFails: subject-case — the subject must be all lowercase" }
  ]

User selects "Reword" and supplies `feat(auth): add jwt refresh endpoint`. It is re-validated, passes, and is committed.

In autopilot mode the same failure aborts loudly instead, leaving the staged state untouched.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

**Reference self-check (MANDATORY):** after composing the output, re-read it against [`reference-formatting.md`](../shared-rules/references/reference-formatting.md). A bare commit SHA, a bare tracker id outside a magic-word line, or an unlinked mention of a file that exists in the repo is a violation — fix it before emitting.
