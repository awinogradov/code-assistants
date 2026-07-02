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
- `--autopilot` — non-interactive mode used by `/autopilot:run`. Skips commit-strategy, commit-message, and PR-update prompts and commits directly using the auto-generated messages.

## Input resolution

Arguments are optional. When `$ARGUMENTS` is empty:

- **Commit context** — skip; rely on the diff itself (`git diff --staged`) plus recent conversation history (skill analyses, user instructions) to generate the message. Do NOT prompt.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false` (interactive mode). Strip from `$ARGUMENTS` before parsing the remainder as commit context.
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.
- **Existing PR** — detect via `gh pr view --json number,url 2>/dev/null` at [Phase 5](#phase-5-offer-pr-update). No user prompt needed.

## AskUserQuestion Contract (MANDATORY)

**Autopilot bypass:** When `autopilotMode` is true (from [Phase 1](#phase-1-check-for-changes)), this entire contract is moot — every AskUserQuestion call in Phases 3, 4, and 5 is skipped. Generate the commit message(s), commit directly, and exit without prompting.

Every AskUserQuestion call that presents content for review (commit messages) MUST follow these exact rules. Simple choice dialogs ([Phase 3](#phase-3-choose-commit-strategy) commit strategy, [Phase 5](#phase-5-offer-pr-update) PR update offer) are exempt from the preview requirement.

1. **`question` is FIXED TEXT** — use the EXACT string specified in each phase. NEVER add commit messages, file names, diffs, metadata, or any other content to the question field.
2. **`header` is FIXED TEXT** — use the EXACT string specified in each phase.
3. **`preview` is MANDATORY** — every option MUST include a `preview` field. The commit message goes ONLY in `preview`. NEVER put content in `question`, `label`, or `description`.
4. **`label` values are EXACT** — use the exact text specified (e.g., "Commit", "Edit", "Cancel"). No abbreviations, no paraphrasing, no creative alternatives.
5. **`description` values are EXACT** — use the exact text specified. No rewording.
6. **ALL options are REQUIRED** — include every option listed in the phase. NEVER omit "Cancel".
7. **Same `preview` on all options** — the user chooses an action, not content. All options show identical preview text.
8. **SUBSTITUTE every placeholder in `preview`** — templates below use `<commit message>` as a placeholder. Before invoking AskUserQuestion, replace `<commit message>` with the full commit message string (title + body, literal `\n` escape sequences for line breaks). NEVER pass the literal string `<commit message>`, nor the shorthand `"..."`, `"<same>"`, or any placeholder. Every option's `preview` must contain the fully resolved commit message string.

### WRONG — content in question field

```
AskUserQuestion({
  question: "feat(auth): add jwt refresh endpoint\n\n- Added /auth/refresh endpoint\n- Added 7-day expiry\n\nProceed?",
  header: "Commit",
  options: [
    { label: "Yes", description: "Commit" },
    { label: "Edit", description: "Change message" }
  ]
})
```

### WRONG — content in label

```
AskUserQuestion({
  question: "Review the commit message and choose an action.",
  header: "Commit",
  options: [
    { label: "feat(auth): add jwt refresh endpoint", description: "Proceed with this commit" },
    { label: "Edit message", description: "Modify" }
  ]
})
```

### WRONG — no preview, missing Cancel, content in description

```
AskUserQuestion({
  question: "Review the commit message and choose an action.",
  header: "Commit",
  options: [
    { label: "Commit", description: "feat(auth): add jwt refresh endpoint - Added /auth/refresh" },
    { label: "Edit", description: "Modify the commit message" }
  ]
})
```

### CORRECT

```
AskUserQuestion({
  question: "Review the commit message and choose an action.",
  header: "Commit",
  options: [
    { label: "Commit", description: "Proceed with this commit message", preview: "feat(auth): add jwt refresh endpoint\n\n- Added /auth/refresh endpoint\n- Added 7-day expiry" },
    { label: "Edit", description: "Modify the commit message", preview: "feat(auth): add jwt refresh endpoint\n\n- Added /auth/refresh endpoint\n- Added 7-day expiry" },
    { label: "Cancel", description: "Abort commit creation", preview: "feat(auth): add jwt refresh endpoint\n\n- Added /auth/refresh endpoint\n- Added 7-day expiry" }
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

  **Formatting Note:** Do not use markdown formatting (bold, italic, headers) in the `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

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
4. **WHAT-not-WHY validation**: Check the generated title against the WHY signal words and vague signal words listed in the WHAT-not-WHY Rule section below. If the title contains any of those words followed by abstract goals (not technical specifics), or contains the words "review", "feedback", "comments", or "suggestions", regenerate the title using only concrete technical details from the diff. Repeat up to 3 times. If the title still fails, present it to the user with a note that it may need manual rewording.
5. Verify two commitlint length limits (`subject-max-length` = 50, `header-max-length` = 100 in `commitlint.config.mjs`): the subject — the text after `type(scope): ` — at most 50 characters (`printf '%s' "<subject>" | wc -m`), and the whole header (`type(scope): subject`) at most 100 (`printf '%s' "<title>" | wc -m`). If either exceeds its limit, regenerate a shorter title and re-run both checks. Do not present a title to the user that exceeds these limits.

**Autopilot bypass:** If `autopilotMode` is true, skip steps 6–9 below. Run `git commit -m "<message>"` directly with the generated message and continue to [Phase 5](#phase-5-offer-pr-update).

6. Present using **AskUserQuestion tool** with preview:

   **Preview content rules:**
   - The `preview` MUST contain ONLY the commit message (title + body). DO NOT include file lists, diff content, or any other metadata in the preview

   **Tool call structure: See AskUserQuestion Contract above. All rules are mandatory.**

   Tool parameters:
   - `question`: "Review the commit message and choose an action."
   - `header`: "Commit"
   - `options`: [
     { label: "Commit", description: "Proceed with this commit message", preview: "<commit message>" },
     { label: "Edit", description: "Modify the commit message", preview: "<commit message>" },
     { label: "Cancel", description: "Abort commit creation", preview: "<commit message>" }
     ]
   - `multiSelect`: false

7. If "Edit" selected, ask for changes and regenerate
8. If "Cancel" selected, abort with "Commit cancelled."
9. Only proceed with `git commit` after "Commit" selected
10. When executing `git commit`, run `git commit -m "<message>"`

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
5. Verify both commitlint length limits (`subject-max-length` = 50, `header-max-length` = 100): subject (text after `type(scope): `) at most 50 — `printf '%s' "<subject>" | wc -m`; full header (`type(scope): subject`) at most 100 — `printf '%s' "<title>" | wc -m`. If either exceeds, regenerate a shorter title and re-run.

After analyzing all categories, `git reset HEAD` to unstage everything.

#### Step 2: Present all commits in one dialog

**Autopilot bypass:** If `autopilotMode` is true, skip this step entirely. Skip to Step 3 and execute each commit directly with its generated message.

Use a **single AskUserQuestion** with multiple questions (one per commit), each with preview.

**Tool call structure: See AskUserQuestion Contract above. All rules are mandatory.**

Tool parameters:

- `questions`: [
  {
  question: "Commit 1/N: <category>\nReview the commit message and choose an action.",
  header: "Commit 1/N",
  options: [
  { label: "Commit", description: "Proceed with this commit message", preview: "<commit message>" },
  { label: "Edit", description: "Modify the commit message", preview: "<commit message>" },
  { label: "Cancel", description: "Abort all commits", preview: "<commit message>" }
  ],
  multiSelect: false
  },
  {
  question: "Commit 2/N: <category>\nReview the commit message and choose an action.",
  header: "Commit 2/N",
  options: [...same structure with preview...],
  multiSelect: false
  },
  ...one question per category
  ]

All options in each question use the same `preview` content (commit message only for that category). DO NOT include file lists in the preview.

If "Cancel" is selected for any commit, abort the entire grouped commit operation with "Commits cancelled." — do not execute any of the commits.

If there are **5 categories** (exceeds the 4-question limit): present the first 4 in one dialog, then present the 5th in a follow-up single-question dialog.

#### Step 3: Process responses and execute commits

1. For each commit where "Edit" was selected: ask a follow-up single AskUserQuestion for that commit's new message (question with the original message, header "Edit N/M", same options). Repeat until "Commit" is selected. If "Cancel" is selected, abort all commits with "Commits cancelled."

2. Execute all commits sequentially in category order:
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

- Title: lowercase, no period, imperative mood. The subject (text after `type(scope): `) MUST NOT exceed 50 characters and the whole header line (`type(scope): subject`) MUST NOT exceed 100 characters — enforced by commitlint (`subject-max-length` / `header-max-length`) and CI
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

## Phase 5: Offer PR Update

**Autopilot bypass:** If `autopilotMode` is true, skip this entire phase — the calling skill (`/autopilot:run`) creates or updates the PR itself in its next step.

After all commits are created successfully:

1. Check if a PR exists for the current branch: `gh pr view --json number,url 2>/dev/null`
2. If the command fails (no PR), skip silently — do not show any message
3. If a PR exists, ask using **AskUserQuestion tool**:

   **Formatting Note:** Do not use markdown formatting (bold, italic, headers) in the `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

   Tool parameters:
   - `question`: "A pull request exists for this branch: #<N>. Would you like to update it to reflect the new commits?"
   - `header`: "Update PR"
   - `options`: [
     { label: "Update PR", description: "Refresh PR title and description from all commits" },
     { label: "Skip", description: "Keep the PR as-is" }
     ]
   - `multiSelect`: false

   - If "Update PR" selected: invoke `Skill(autopilot:pr-update)`
   - If "Skip" selected: finish normally

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

### Grouped Commits (Quiz Mode)

```
Analyzing staged changes...

Detected 3 categories:
- impl: 3 files (auth.ts, auth.types.ts, index.ts)
- test: 1 file (auth.test.ts)
- docs: 2 files (docs/auth.md, docs/api-reference.md)

How would you like to commit these changes?
```

User selects "Separate commits" via AskUserQuestion tool.

All commits are analyzed upfront, then presented in a single dialog with previews:

AskUserQuestion with:

- `questions`: [
  {
  question: "Commit 1/3: impl\nReview the commit message and choose an action.",
  header: "Commit 1/3",
  options: [
  { label: "Commit", description: "Proceed with this commit message", preview: "feat(auth): implement jwt validation\n\n- Added token validation logic\n- Added refresh token support" },
  { label: "Edit", description: "Modify the commit message", preview: "feat(auth): implement jwt validation\n\n- Added token validation logic\n- Added refresh token support" },
  { label: "Cancel", description: "Abort all commits", preview: "feat(auth): implement jwt validation\n\n- Added token validation logic\n- Added refresh token support" }
  ],
  multiSelect: false
  },
  {
  question: "Commit 2/3: test\nReview the commit message and choose an action.",
  header: "Commit 2/3",
  options: [
  { label: "Commit", description: "Proceed with this commit message", preview: "test(auth): add jwt validation tests\n\n- Added token expiry edge case tests\n- Added refresh flow integration test" },
  { label: "Edit", description: "Modify the commit message", preview: "test(auth): add jwt validation tests\n\n- Added token expiry edge case tests\n- Added refresh flow integration test" },
  { label: "Cancel", description: "Abort all commits", preview: "test(auth): add jwt validation tests\n\n- Added token expiry edge case tests\n- Added refresh flow integration test" }
  ],
  multiSelect: false
  },
  {
  question: "Commit 3/3: docs\nReview the commit message and choose an action.",
  header: "Commit 3/3",
  options: [
  { label: "Commit", description: "Proceed with this commit message", preview: "docs: update authentication documentation" },
  { label: "Edit", description: "Modify the commit message", preview: "docs: update authentication documentation" },
  { label: "Cancel", description: "Abort all commits", preview: "docs: update authentication documentation" }
  ],
  multiSelect: false
  }
  ]

User selects "Commit" for all three.

```
✓ Created commit: feat(auth): implement jwt validation
✓ Created commit: test(auth): add jwt validation tests
✓ Created commit: docs: update authentication documentation

All 3 commits created successfully.
```

If user selects "Edit" for commit 2/3, a follow-up dialog appears only for that commit:

AskUserQuestion with:

- `question`: "Review the updated commit message and choose an action."
- `header`: "Edit 2/3"
- `options`: [
  { label: "Commit", description: "Proceed with this commit message", preview: "test(auth): add jwt validation tests\n\n- Added token expiry edge case tests\n- Added refresh flow integration test" },
  { label: "Edit", description: "Modify the commit message", preview: "test(auth): add jwt validation tests\n\n- Added token expiry edge case tests\n- Added refresh flow integration test" },
  { label: "Cancel", description: "Abort all commits", preview: "test(auth): add jwt validation tests\n\n- Added token expiry edge case tests\n- Added refresh flow integration test" }
  ]

### Single Category (No Grouping Offered)

```
Analyzing staged changes...

All changes are in 1 category (impl).
```

AskUserQuestion with:

- `question`: "Review the commit message and choose an action."
- `header`: "Commit"
- `options`: [
  { label: "Commit", description: "Proceed with this commit message", preview: "feat(auth): implement jwt validation\n\n- Added token validation logic\n- Added refresh token support" },
  { label: "Edit", description: "Modify the commit message", preview: "feat(auth): implement jwt validation\n\n- Added token validation logic\n- Added refresh token support" },
  { label: "Cancel", description: "Abort commit creation", preview: "feat(auth): implement jwt validation\n\n- Added token validation logic\n- Added refresh token support" }
  ]

User selects "Commit".

```
✓ Created commit: feat(auth): implement jwt validation
```

### With PR Update Prompt

After committing on a branch with an existing PR:

```
✓ Created commit: feat(auth): add password reset flow
```

AskUserQuestion with:

- `question`: "A pull request exists for this branch: #15. Would you like to update it to reflect the new commits?"
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Refresh PR title and description from all commits" },
  { label: "Skip", description: "Keep the PR as-is" }
  ]

User selects "Update PR". Invokes `Skill(autopilot:pr-update)`.

```
✓ Updated PR #15: https://github.com/org/repo/pull/15
```

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
