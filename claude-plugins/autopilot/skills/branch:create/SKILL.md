---
name: branch:create
description: Create and checkout a git branch following repository naming conventions with GitHub issue integration. Use when creating branches, or when invoked from other skills.
argument-hint: <ISSUE-NUMBER> [description] [--trivial | --hotfix | --maintenance | --proposal] [--autopilot]
allowed-tools:
  - Bash(git *)
  - Read
  - Bash(gh *)
  - AskUserQuestion
  - Skill(autopilot:preflight-check)
---

# Create Branch

Create a git branch following the repository's naming conventions with GitHub issue integration. Supports standard issue branches (`issue-<number>-<slug>`) and special prefix branches (hotfix, trivial, maintenance, proposal).

## When to Use

- When creating a new branch from a GitHub issue
- When creating hotfix, trivial, maintenance, or proposal branches
- When invoked from `/autopilot:plan` for automatic branch creation
- When invoked from other skills

## Input

Arguments: `$ARGUMENTS`

Expected forms:

- `<ISSUE-NUMBER>` — GitHub issue number (e.g., `123` or `#123`). Used to fetch the issue and to build the branch name `issue-<number>-<slug>`.
- `<ISSUE-NUMBER> "<description>"` — issue number plus custom branch slug description
- `--hotfix "<description>"` / `--trivial "<description>"` / `--maintenance "<description>"` / `--proposal "<description>"` — special prefix branches without a GitHub issue
- `--autopilot` — non-interactive mode used by `/autopilot:run`. Skips the Phase 5 confirmation prompt and creates the branch directly with the auto-generated name. Conflict resolution (Phase 4) and validation errors still surface.

## Input resolution

Arguments are optional. When `$ARGUMENTS` is empty OR a field is missing, resolve from context in this order:

- **Issue number** — `$ARGUMENTS` → parse current branch name for `^issue-([0-9]+)` → prompt user only if none found and no special prefix flag is present.
- **Description** — `$ARGUMENTS` → generate from GitHub issue title via Phase 3 rules → no user prompt (auto-generate always succeeds).
- **Special prefix flags** (`--hotfix` / `--trivial` / `--maintenance` / `--proposal`) — `$ARGUMENTS` only. Never inferred. Default: none.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false` (interactive mode).
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.

## Phase 0: Preflight Check

Invoke `Skill(autopilot:preflight-check)` with `mode: branch` from this conversation context. The skill validates current branch state, detects stale merged branches, and ensures main is up to date before a new branch is created. If it outputs a "cancelled" message, stop immediately — do not proceed to Phase 1.

## Phase 1: Input Validation

1. **Parse `$ARGUMENTS`** (shell-quoted positional tokens):
   - Check for `--autopilot`: if present, strip it from the arguments and set `autopilotMode = true`. Otherwise `autopilotMode = false`.
   - Check for special prefix flags: `--trivial`, `--hotfix`, `--maintenance`, `--proposal`
   - If flag found: extract description from remaining arguments
   - If no flag: extract first argument as issue number, optional description
   - If `$ARGUMENTS` is empty, fall back to Input resolution (see above).

2. **If special prefix flag detected:**
   - Try to extract description from the conversation history
   - Description is REQUIRED — error if missing: `Description is required for special prefix branches (e.g., /autopilot:branch-create --trivial "fix typo")`
   - Multiple prefix flags not allowed — error: `Only one special prefix flag allowed`
   - Skip Phase 2 (no GitHub issue to fetch)

3. **If no flag, validate as issue number:**
   - Accept patterns: `^#?[0-9]+$` (strip a leading `#` if present)
   - If invalid: `Invalid issue number. Expected: a positive integer (e.g., 123 or #123) or use --trivial, --hotfix, --maintenance, --proposal`

## Phase 2: Fetch GitHub Issue

**Skip this phase entirely for special prefix flag branches (--hotfix, --trivial, --maintenance, --proposal).**

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

   <!-- Mirrors resolve-issue-context.md Phase 2 (canonical). Keep in sync. -->

   Assigning the issue the moment work starts keeps "who is working on what" accurate. This runs on every issue branch (special-prefix branches skip Phase 2, so they never assign). On ANY failure, emit the status line and continue to Phase 3 — the branch is the deliverable; assignment is a side effect.

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

      If `LOGIN` is empty → `unassigned — gh not authenticated`; continue to Phase 3.

   2. If the issue `state` from step 2 is `CLOSED` → `unassigned — issue closed`; continue to Phase 3.

   3. Check whether `LOGIN` is already assigned. GitHub logins are `[A-Za-z0-9-]`, so the login is safe to interpolate into a single `gh --jq` expression (gh's `--jq` cannot take `--arg`); `.assignees[]?` tolerates a null or absent array:

      ```bash
      ALREADY=$(gh issue view <ISSUE-NUMBER> -R "$REPO" --json assignees --jq "any(.assignees[]?; .login==\"$LOGIN\")" 2>/dev/null)
      ```

      If `ALREADY == "true"` → `@<LOGIN> (already assigned)`; continue to Phase 3.

   4. Otherwise attempt the assignment, capturing stderr and exit code (keep this order; read `$?` on the very next line):

      ```bash
      STDERR=$(gh issue edit <ISSUE-NUMBER> -R "$REPO" --add-assignee "$LOGIN" 2>&1 >/dev/null)
      EDIT_EXIT=$?
      ```

   5. Post-verify with a fresh read, because `gh issue edit --add-assignee` returns exit 0 even when GitHub silently drops the addition (caller lacks `triage`/`write` permission, or the issue is at the 10-assignee limit):

      ```bash
      VERIFIED=$(gh issue view <ISSUE-NUMBER> -R "$REPO" --json assignees --jq "any(.assignees[]?; .login==\"$LOGIN\")" 2>/dev/null)
      ```

      - `EDIT_EXIT == 0` AND `VERIFIED == "true"` → `@<LOGIN> (just assigned)`
      - `EDIT_EXIT == 0` AND `VERIFIED != "true"` → `unassigned — permission denied or assignee limit reached`
      - `EDIT_EXIT != 0` → `unassigned — gh edit error: <first line of $STDERR>`

   In all cases, continue to Phase 3.

## Phase 3: Generate Branch Slug

**If special prefix branch:**

1. Normalize description to lowercase kebab-case
2. Remove special characters (keep only `a-z0-9-`)
3. Construct branch name: `<prefix>-<slug>` (prefix lowercased)
4. Example: `--hotfix` + `"memory leak in editor"` → `hotfix-memory-leak-editor`
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

- Format: `issue-<number>-<slug>`
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

**Autopilot bypass:** If `autopilotMode` is true (from Phase 1), skip this entire phase and proceed directly to Phase 6 with the resolved branch name. Do NOT call AskUserQuestion.

Present branch details and confirm using **AskUserQuestion tool**.

**Preview substitution rules (MANDATORY):** The `<number>`, `<slug>`, `<issue title>`, `<prefix>`, and `<PREFIX>` tokens in the templates below are PLACEHOLDERS. Before invoking AskUserQuestion, substitute each placeholder with the concrete value you resolved in earlier phases (e.g., `<number>` → `123`, `<slug>` → `jwt-refresh`, `<issue title>` → `Add JWT token refresh endpoint`). NEVER pass the literal `issue-<number>-<slug>\n\nIssue: <issue title>...` string — every option's `preview` must contain the fully resolved branch preview string. No shorthand (`"..."`, `"<same>"`, empty string) is permitted; always write out the full resolved preview for every option.

**For standard branches (with GitHub issue):**

Tool parameters:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "issue-<number>-<slug>\n\nIssue: <issue title>\nFrom: origin/main" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "issue-<number>-<slug>\n\nIssue: <issue title>\nFrom: origin/main" }
  ]
- `multiSelect`: false

Both options use the same `preview` content since the user is choosing an action, not content. The preview enables a side-by-side layout in the UI.

**For special prefix branches:**

Tool parameters:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "<prefix>-<slug>\n\nType: <PREFIX>\nFrom: origin/main" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "<prefix>-<slug>\n\nType: <PREFIX>\nFrom: origin/main" }
  ]
- `multiSelect`: false

Both options use the same `preview` content since the user is choosing an action, not content.

Only proceed to Phase 6 after user selects "Create branch". If "Edit slug" selected, ask for new slug and regenerate branch name.

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

3. **Output result:**

   ```
   ✓ Branch created: <branch-name>
   ✓ Pushed to origin with tracking

   Next steps:
   - Make your changes
   - Use /autopilot:commits-create to create commits
   - Use /autopilot:pr-create when ready
   ```

## Examples

### Basic usage (auto-generated slug)

```
/autopilot:branch-create 123

Fetching GitHub issue #123...
Title: "Add JWT token refresh endpoint for authentication service"
```

AskUserQuestion with:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "issue-123-jwt-refresh\n\nIssue: Add JWT token refresh endpoint\nFrom: origin/main" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "issue-123-jwt-refresh\n\nIssue: Add JWT token refresh endpoint\nFrom: origin/main" }
  ]

User selects "Create branch".

```
✓ Branch created: issue-123-jwt-refresh
✓ Pushed to origin with tracking
```

### With custom description

```
/autopilot:branch-create 123 "api endpoint only"
```

AskUserQuestion with:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "issue-123-api-endpoint-only\n\nFrom: origin/main" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "issue-123-api-endpoint-only\n\nFrom: origin/main" }
  ]

User selects "Create branch".

```
✓ Branch created: issue-123-api-endpoint-only
✓ Pushed to origin with tracking
```

### Special prefix (--hotfix)

```
/autopilot:branch-create --hotfix "memory leak in editor"
```

AskUserQuestion with:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "hotfix-memory-leak-editor\n\nType: HOTFIX\nFrom: origin/main" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "hotfix-memory-leak-editor\n\nType: HOTFIX\nFrom: origin/main" }
  ]

User selects "Create branch".

```
✓ Branch created: hotfix-memory-leak-editor
✓ Pushed to origin with tracking
```

### Special prefix (--proposal)

```
/autopilot:branch-create --proposal "add vim keybindings"
```

AskUserQuestion with:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "proposal-add-vim-keybindings\n\nType: PROPOSAL\nFrom: origin/main" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "proposal-add-vim-keybindings\n\nType: PROPOSAL\nFrom: origin/main" }
  ]

User selects "Create branch".

```
✓ Branch created: proposal-add-vim-keybindings
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
