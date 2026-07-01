---
name: branch:create
description: Create and checkout a git branch following repository naming conventions with GitHub issue integration. Use when creating branches, or when invoked from other skills.
argument-hint: <ISSUE-ID> [description] [--start] [--trivial | --hotfix | --maintenance | --proposal | --security] [--autopilot]
allowed-tools:
  - Bash(git *)
  - Read
  - Bash(gh *)
  - MCP(linear:*)
  - AskUserQuestion
  - Skill(autopilot:preflight-check)
---

# Create Branch

Create a git branch following the repository's naming conventions with GitHub or Linear issue integration. Supports GitHub issue branches (`issue-<number>-<slug>`), Linear ticket branches (`<team>-<number>-<slug>`), and special prefix branches (hotfix, trivial, maintenance, proposal, security).

## When to Use

- When creating a new branch from a GitHub issue
- When creating hotfix, trivial, maintenance, proposal, or security branches
- When invoked from `/autopilot:plan` for automatic branch creation
- When invoked from other skills

## Input

Arguments: `$ARGUMENTS`

Expected forms:

- `<ISSUE-NUMBER>` — GitHub issue number (e.g., `123` or `#123`). Used to fetch the issue and to build the branch name `issue-<number>-<slug>`.
- `<LINEAR-ID>` — Linear identifier (e.g., `ENG-123`, matching `^[A-Z]+-[0-9]+$`) when the project lists a `linear` tracker in `package.json` `agents.trackers`. Builds `<team>-<number>-<slug>` (the id lowercased).
- `<ISSUE-NUMBER|LINEAR-ID> "<description>"` — issue identifier plus custom branch slug description
- `--start` — Linear only: also move the Linear ticket to "In Progress" after the branch is created (best-effort). Ignored for GitHub and special-prefix branches.
- `--hotfix "<description>"` / `--trivial "<description>"` / `--maintenance "<description>"` / `--proposal "<description>"` / `--security "<description>"` — special prefix branches without a GitHub issue (use `--security` for code-scanning alert fixes → `security-<slug>`)
- `--autopilot` — non-interactive mode used by `/autopilot:run`. Skips the [Phase 5](#phase-5-verify-with-user) confirmation prompt and creates the branch directly with the auto-generated name. Conflict resolution ([Phase 4](#phase-4-check-for-conflicts)) and validation errors still surface.

## Input resolution

Arguments are optional. When `$ARGUMENTS` is empty OR a field is missing, resolve from context in this order:

- **Issue number** — `$ARGUMENTS` → parse current branch name for `^issue-([0-9]+)` → prompt user only if none found and no special prefix flag is present.
- **Description** — `$ARGUMENTS` → generate from GitHub issue title via [Phase 3](#phase-3-generate-branch-slug) rules → no user prompt (auto-generate always succeeds).
- **Special prefix flags** (`--hotfix` / `--trivial` / `--maintenance` / `--proposal` / `--security`) — `$ARGUMENTS` only. Never inferred. Default: none.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false` (interactive mode).
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.

## Phase 0: Preflight Check

Invoke `Skill(autopilot:preflight-check)` with `mode: branch` from this conversation context. The skill validates current branch state, detects stale merged branches, and ensures main is up to date before a new branch is created. If it outputs a "cancelled" message, stop immediately — do not proceed to [Phase 1](#phase-1-input-validation).

## Phase 1: Input Validation

1. **Parse `$ARGUMENTS`** (shell-quoted positional tokens):
   - Check for `--autopilot`: if present, strip it from the arguments and set `autopilotMode = true`. Otherwise `autopilotMode = false`.
   - Check for `--start`: if present, strip it and set `startIssue = true` (Linear only; see [Phase 6](#phase-6-execute)). Otherwise `startIssue = false`.
   - Check for special prefix flags: `--trivial`, `--hotfix`, `--maintenance`, `--proposal`, `--security`
   - If flag found: extract description from remaining arguments
   - If no flag: extract the first argument as the issue identifier (GitHub number or Linear id), optional description
   - If `$ARGUMENTS` is empty, fall back to Input resolution (see above).

2. **If special prefix flag detected:**
   - Try to extract description from the conversation history
   - Description is REQUIRED — error if missing: `Description is required for special prefix branches (e.g., /autopilot:branch-create --trivial "fix typo")`
   - Multiple prefix flags not allowed — error: `Only one special prefix flag allowed`
   - Skip [Phase 2](#phase-2-fetch-github-issue) (no GitHub issue to fetch)

3. **If no flag, validate the issue identifier and resolve the provider** (read `package.json` `agents.trackers` with the Read tool):
   - **Linear** — the identifier matches `^[A-Z]+-[0-9]+$` (e.g., `ENG-123`) AND a `linear` tracker is configured: set `provider = linear`.
   - **GitHub** — the identifier matches `^#?[0-9]+$` (strip a leading `#`): set `provider = github`.
   - If invalid: `Invalid issue identifier. Expected a GitHub number (e.g., 123 or #123), a Linear id (e.g., ENG-123) for a linear-tracked project, or a --trivial/--hotfix/--maintenance/--proposal/--security flag`

## Phase 2: Fetch GitHub Issue

**Skip this phase entirely for special prefix flag branches (--hotfix, --trivial, --maintenance, --proposal, --security).**

**If `provider` is `linear`:** fetch the ticket via `mcp__plugin_autopilot_linear__get_issue` with `{ "id": "<LINEAR-ID>" }` and read its `title` (for the slug) and `state.name`. Skip the GitHub `gh` steps below and do NOT self-assign — Linear assignment is deferred to a later phase; emit `unassigned — Linear assignment deferred`. Then continue to [Phase 3](#phase-3-generate-branch-slug). The steps below apply to **GitHub** issues only.

1. **Determine the repository** and bind it to `REPO` so every `gh` call in this phase targets the same repo (important in worktrees and multi-remote checkouts):

   ```bash
   REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
   ```

2. **Fetch the issue** (include `assignees` so the self-assign step needs no extra call):

   ```bash
   gh issue view <ISSUE-NUMBER> -R "$REPO" --json title,body,state,assignees
   ```

3. **Extract:**
   - Issue title (for slug generation)
   - Issue body (for context)
   - Current state (warn if already closed)

4. **If issue not found:**
   - Error: `Issue #<ISSUE-NUMBER> not found in <repo>`

5. **Self-assign the current user** — idempotent and best-effort; it must never block branch creation.

   <!-- Canonical: [resolve-issue-context.md Phase 2](../../agents/resolve-issue-context.md#phase-2-auto-assign-current-user-opt-in) — keep this self-assign algorithm (statuses + steps) in sync with it. -->

   Assigning the issue the moment work starts keeps "who is working on what" accurate. This runs on every issue branch (special-prefix branches skip [Phase 2](#phase-2-fetch-github-issue), so they never assign). On ANY failure, emit the status line and continue to [Phase 3](#phase-3-generate-branch-slug) — the branch is the deliverable; assignment is a side effect.

   Emit exactly one status (same vocabulary as the canonical agent):
   - `@<login> (just assigned)`
   - `@<login> (already assigned)`
   - `unassigned — gh not authenticated`
   - `unassigned — issue closed`
   - `unassigned — permission denied or assignee limit reached`
   - `unassigned — gh edit error: <first line of stderr>`

   Resolve it with these steps:
   1. Resolve the authenticated login (cached 5 minutes):

      ```bash
      LOGIN=$(gh api user --cache 5m --jq .login 2>/dev/null)
      ```

      If `LOGIN` is empty → `unassigned — gh not authenticated`; continue to [Phase 3](#phase-3-generate-branch-slug).

   2. If the issue `state` from step 2 is `CLOSED` → `unassigned — issue closed`; continue to [Phase 3](#phase-3-generate-branch-slug).

   3. Check whether `LOGIN` is already assigned. GitHub logins are `[A-Za-z0-9-]`, so the login is safe to interpolate into a single `gh --jq` expression (gh's `--jq` cannot take `--arg`); `.assignees[]?` tolerates a null or absent array:

      ```bash
      ALREADY=$(gh issue view <ISSUE-NUMBER> -R "$REPO" --json assignees --jq "any(.assignees[]?; .login==\"$LOGIN\")" 2>/dev/null)
      ```

      If `ALREADY == "true"` → `@<LOGIN> (already assigned)`; continue to [Phase 3](#phase-3-generate-branch-slug).

   4. Otherwise attempt the assignment, capturing stderr and exit code (keep this order; read `$?` on the very next line):

      ```bash
      STDERR=$(gh issue edit <ISSUE-NUMBER> -R "$REPO" --add-assignee "$LOGIN" 2>&1 >/dev/null)
      EDIT_EXIT=$?
      ```

   5. **Only when `EDIT_EXIT == 0`**, post-verify with a fresh read, because `gh issue edit --add-assignee` returns exit 0 even when GitHub silently drops the addition (caller lacks `triage`/`write` permission, or the issue is at the 10-assignee limit). When `EDIT_EXIT != 0` the edit never landed, so skip this read and emit `unassigned — gh edit error: <first line of $STDERR>` directly:

      ```bash
      VERIFIED=$(gh issue view <ISSUE-NUMBER> -R "$REPO" --json assignees --jq "any(.assignees[]?; .login==\"$LOGIN\")" 2>/dev/null)
      ```

      - `EDIT_EXIT == 0` AND `VERIFIED == "true"` → `@<LOGIN> (just assigned)`
      - `EDIT_EXIT == 0` AND `VERIFIED != "true"` → `unassigned — permission denied or assignee limit reached`
      - `EDIT_EXIT != 0` → `unassigned — gh edit error: <first line of $STDERR>`

   In all cases, continue to [Phase 3](#phase-3-generate-branch-slug).

## Phase 3: Generate Branch Slug

**If special prefix branch:**

1. Normalize description to lowercase kebab-case
2. Remove special characters (keep only `a-z0-9-`)
3. Construct branch name: `<prefix>-<slug>` (prefix lowercased)
4. Example: `--hotfix` + `"memory leak in editor"` → `hotfix-memory-leak-editor`; `--security` + `"tainted format string"` → `security-tainted-format-string`
5. Validate total length ≤ 100 characters — if over 60, suggest shorter description; if over 100, require it

**If custom description provided:**

1. Normalize to lowercase kebab-case
2. Remove special characters (keep only `a-z0-9-`)
3. Use as the slug

**If no description provided:**

1. Analyze issue title and body
2. Generate a short, meaningful business-focused slug
3. **Rules:**
   - Paraphrased/summarized, NOT mechanical title-to-slug conversion
   - Lowercase with hyphens only
   - 3-5 words maximum
   - Capture the essence of what's being done

**Examples:**

| Issue Title                                                           | Generated Slug       |
| --------------------------------------------------------------------- | -------------------- |
| "Add JWT token refresh endpoint for authentication service"           | `jwt-refresh`        |
| "Fix race condition in audio streaming when multiple clients connect" | `audio-race-fix`     |
| "Implement user preference settings page with dark mode toggle"       | `user-preferences`   |
| "Refactor database connection pooling for better performance"         | `db-pool-refactor`   |
| "Provide agent prompt to generate branch name"                        | `branch-name-prompt` |

**Construct full branch name:**

- **GitHub:** `issue-<number>-<slug>`
- **Linear:** `<team>-<number>-<slug>` — the Linear id lowercased, then the slug (e.g. `ENG-123` → `eng-123-<slug>`)
- Aim for under 60 characters; reject if over 100
- If too long: regenerate shorter slug

## Phase 4: Check for Conflicts

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in AskUserQuestion `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

1. **Check local branches:**

   ```bash
   git show-ref --verify --quiet refs/heads/<branch-name>
   ```

2. **Check remote branches:**

   ```bash
   git ls-remote --heads origin <branch-name>
   ```

3. **Handle conflicts using AskUserQuestion tool:**

   If branch exists locally or remotely, present options:

   Tool parameters:
   - `question`: "Branch <branch-name> already exists. How would you like to proceed?"
   - `header`: "Conflict"
   - `options`: [
     { label: "Checkout existing", description: "Switch to the existing branch" },
     { label: "Create with suffix", description: "Create <branch-name>-2" },
     { label: "Different description", description: "Enter a new description for the slug" }
     ]
   - `multiSelect`: false

## Phase 5: Verify with User

**Autopilot bypass:** If `autopilotMode` is true (from [Phase 1](#phase-1-input-validation)), skip this entire phase and proceed directly to [Phase 6](#phase-6-execute) with the resolved branch name. Do NOT call AskUserQuestion.

Present branch details and confirm using **AskUserQuestion tool**.

**Preview substitution rules (MANDATORY):** The `<number>`, `<slug>`, `<issue title>`, `<prefix>`, and `<PREFIX>` tokens in the templates below are PLACEHOLDERS. Before invoking AskUserQuestion, substitute each placeholder with the concrete value you resolved in earlier phases (e.g., `<number>` → `123`, `<slug>` → `jwt-refresh`, `<issue title>` → `Add JWT token refresh endpoint`). NEVER pass the literal `issue-<number>-<slug>\n\nIssue: <issue title>...` string — every option's `preview` must contain the fully resolved branch preview string. No shorthand (`"..."`, `"<same>"`, empty string) is permitted; always write out the full resolved preview for every option.

**One dialog template for every branch kind.** Tool parameters:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "<preview>" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "<preview>" }
  ]
- `multiSelect`: false

Both options carry the same `<preview>` content since the user is choosing an action, not content; the shared preview enables a side-by-side layout in the UI. Substitute `<preview>` with the body for the resolved branch kind:

| Branch kind    | `<preview>` body                                                   |
| -------------- | ------------------------------------------------------------------ |
| GitHub issue   | `issue-<number>-<slug>\n\nIssue: <issue title>\nFrom: origin/main` |
| Special prefix | `<prefix>-<slug>\n\nType: <PREFIX>\nFrom: origin/main`             |
| Linear ticket  | `<team>-<number>-<slug>\n\nTicket: <LINEAR-ID>\nFrom: origin/main` |

When a custom description was provided, drop the `Issue:` line (no issue title to show) — e.g. `issue-<number>-<slug>\n\nFrom: origin/main`.

Only proceed to [Phase 6](#phase-6-execute) after user selects "Create branch". If "Edit slug" selected, ask for new slug and regenerate branch name.

## Phase 6: Execute

1. **Fetch latest remote and create branch from origin/main:**

   ```bash
   git fetch origin
   git checkout -b <branch-name> origin/main
   ```

2. **Push with tracking:**

   ```bash
   git push -u origin <branch-name>
   ```

3. **If `provider` is `linear` AND `--start` was passed:** move the ticket to "In Progress" — best-effort, never blocks the branch. Resolve the target state id with `mcp__plugin_autopilot_linear__list_issue_statuses` for the ticket's team, then call `mcp__plugin_autopilot_linear__save_issue` with `{ "id": "<LINEAR-ID>", "state": "<In Progress state>" }`. On success, emit `✓ Ticket <LINEAR-ID> moved to In Progress`; on any failure, emit `issue not started — <reason>` and continue.

4. **Output result:**

   ```
   ✓ Branch created: <branch-name>
   ✓ Pushed to origin with tracking

   Next steps:
   - Make your changes
   - Use /autopilot:commits-create to create commits
   - Use /autopilot:pr-create when ready
   ```

   When `--start` moved a Linear ticket (step 3 success), add a `✓ Ticket <LINEAR-ID> moved to In Progress` line after the push confirmation.

## Examples

Every example uses the one [Phase 5](#phase-5-verify-with-user) dialog template — only the resolved `<preview>` body changes per branch kind (see the table there). Two worked cases below; Linear and the other special prefixes follow identically.

### GitHub issue (auto-generated slug)

```
/autopilot:branch-create 123

Fetching GitHub issue #123...
Title: "Add JWT token refresh endpoint for authentication service"
```

AskUserQuestion with the [Phase 5](#phase-5-verify-with-user) template, both options' `<preview>` resolved to `issue-123-jwt-refresh\n\nIssue: Add JWT token refresh endpoint\nFrom: origin/main`.

User selects "Create branch".

```
✓ Branch created: issue-123-jwt-refresh
✓ Pushed to origin with tracking
```

### Special prefix (--hotfix)

```
/autopilot:branch-create --hotfix "memory leak in editor"
```

AskUserQuestion with the [Phase 5](#phase-5-verify-with-user) template, both options' `<preview>` resolved to `hotfix-memory-leak-editor\n\nType: HOTFIX\nFrom: origin/main`.

User selects "Create branch".

```
✓ Branch created: hotfix-memory-leak-editor
✓ Pushed to origin with tracking
```

### Branch already exists

```
/autopilot:branch-create 123

Branch issue-123-jwt-refresh already exists locally.
```

AskUserQuestion with:

- `question`: "Branch issue-123-jwt-refresh already exists. How would you like to proceed?"
- `header`: "Conflict"
- `options`: Checkout existing / Create with suffix / Different description

User selects "Checkout existing".

```
✓ Switched to branch: issue-123-jwt-refresh
```

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
