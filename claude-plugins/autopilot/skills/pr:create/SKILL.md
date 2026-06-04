---
name: pr:create
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
- `--release-notes` — include a release notes section in the body (auto-enabled on breaking changes)
- `--closes #N,#M` — additional issue numbers to close on merge (comma-separated, GitHub issue numbers)
- `--related #X,#Y` — related issues to link without closing (comma-separated, GitHub issue numbers)
- `--autopilot` — non-interactive mode used by `/autopilot:run`. Skips the Phase 5 confirmation prompt and creates the PR directly with the generated title and body. When meaningful changes are detected (Phase 2), release notes are auto-added.

## Input resolution

Arguments are optional. Resolve each field in this order:

- **`--draft`** — `$ARGUMENTS` → default `false`. Do NOT prompt.
- **`--release-notes`** — `$ARGUMENTS` → auto-enable when Phase 2 detects breaking changes → default `false`. Do NOT prompt (user gets an "Add release notes" option in Phase 5 preview).
- **`--closes`** — `$ARGUMENTS` → branch-name-derived issue number is already added automatically in Phase 4. No prompt; treat absence as intentional.
- **`--related`** — `$ARGUMENTS` → no inference. No prompt; treat absence as intentional.
- **`--autopilot`** — `$ARGUMENTS` only. Never inferred. Default: `false` (interactive mode).
- **Branch + base + issue number** — from `git branch --show-current` and the branch-name pattern `^issue-([0-9]+)-`. Special prefix branches (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`) have no issue number. No prompt.
- **Repository conventions** — read `CONTRIBUTING.md` directly from the repository root.

## Completion Requirement

This workflow is not complete until Phase 6 executes `gh pr create` and outputs the PR URL. Generating a title, generating a description, or running validation does not constitute completion. Execute all six phases in sequence.

Do not call any skill not listed in `allowed-tools` above. The title and description rules in Phases 3-4 are the validation — there is no separate validation step.

## AskUserQuestion Contract (MANDATORY)

**Autopilot bypass:** When `autopilotMode` is true (from Phase 1), this contract is moot — the Phase 5 confirmation prompt is skipped. Generate the title and body, then proceed directly to Phase 6.

Every AskUserQuestion call that presents content for review (PR previews in Phase 5) MUST follow these exact rules. Simple choice dialogs (Phase 1 uncommitted changes) are exempt from the preview requirement.

1. **`question` is FIXED TEXT** — use the EXACT string specified in each phase. NEVER add PR titles, bodies, metadata, file lists, diffs, or any other content to the question field.
2. **`header` is FIXED TEXT** — use the EXACT string specified in each phase.
3. **`preview` is MANDATORY** — every option MUST include a `preview` field. The PR content (title + body with separators) goes ONLY in `preview`. NEVER put content in `question`, `label`, or `description`.
4. **`label` values are EXACT** — use the exact text specified (e.g., "Create PR", "Edit content", "Cancel"). No abbreviations, no paraphrasing, no creative alternatives.
5. **`description` values are EXACT** — use the exact text specified. No rewording.
6. **ALL options are REQUIRED** — include every option listed in the phase. NEVER omit "Cancel".
7. **Same `preview` on all options** — the user chooses an action, not content. All options show identical preview text.
8. **NO shorthand in `preview`** — never pass `"..."`, `"<same content>"`, `"<full PR content>"`, or any other placeholder string as a preview value. Copy the full preview string literally into every option. Shorthand is illustrative only; it must never appear in an actual AskUserQuestion tool call.

### WRONG — PR content in question field

```
AskUserQuestion({
  question: "Title: Add CI check monitoring\nBase: main\nBranch: issue-284-pr-monitor\n1 commit, 3 files changed\n\nBody:\nThe pr:monitor skill now monitors CI checks.\n\n- Added CI check detection\n- Added automated fix workflow\n\nRelease notes:\n- Added CI check monitoring\n\nCloses #284",
  header: "Create PR",
  options: [
    { label: "Create PR", description: "Create this pull request" },
    { label: "Edit", description: "Let me adjust the PR content" }
  ]
})
```

### WRONG — abbreviated labels, no preview, missing Cancel

```
AskUserQuestion({
  question: "Review the pull request details and choose an action.",
  header: "Create PR",
  options: [
    { label: "Create", description: "Add CI check monitoring - Added CI check detection..." },
    { label: "Edit", description: "Modify the PR" }
  ]
})
```

### CORRECT

```
AskUserQuestion({
  question: "Review the pull request details and choose an action.",
  header: "Create PR",
  options: [
    { label: "Create PR", description: "Create pull request ready for review", preview: "Add CI check monitoring\n\nThe pr:monitor skill now monitors CI checks.\n\n- Added CI check detection\n- Added automated fix workflow\n\n---\n\n**Release notes:**\n\n- Added CI check monitoring\n\n---\n\n**Issues:**\n\nCloses #284" },
    { label: "Edit content", description: "Modify title or description", preview: "Add CI check monitoring\n\nThe pr:monitor skill now monitors CI checks.\n\n- Added CI check detection\n- Added automated fix workflow\n\n---\n\n**Release notes:**\n\n- Added CI check monitoring\n\n---\n\n**Issues:**\n\nCloses #284" },
    { label: "Cancel", description: "Abort PR creation", preview: "Add CI check monitoring\n\nThe pr:monitor skill now monitors CI checks.\n\n- Added CI check detection\n- Added automated fix workflow\n\n---\n\n**Release notes:**\n\n- Added CI check monitoring\n\n---\n\n**Issues:**\n\nCloses #284" }
  ]
})
```

## Phase 0: Preflight Check

Invoke `Skill(autopilot:preflight-check)` with `mode: pr` from this conversation context. The skill verifies the current branch is appropriate for opening a PR and warns if you are on `main`. If it outputs a "cancelled" message, stop immediately — do not proceed to Phase 1.

## Phase 1: Validate Current State

Uncommitted-change handling is done in Phase 0 by `preflight-check` — do not repeat it here.

0. Parse `$ARGUMENTS`: if it contains `--autopilot`, set `autopilotMode = true` and remove the flag before further parsing. Otherwise `autopilotMode = false`.
1. Get current branch name with `git branch --show-current`
2. Validate branch name follows convention:
   - Standard: `issue-<number>-<short-description>` (e.g., `issue-123-add-feature`)
   - Special prefix: `<hotfix|trivial|maintenance|proposal|security>-<short-description>` (e.g., `hotfix-memory-leak-editor`, `security-tainted-format-string`)
3. Extract the issue number from the branch (e.g., `123` from `issue-123-add-feature`) for use in the `**Issues:**` section as `Closes #123`. OR detect the special prefix (`hotfix`, `trivial`, `maintenance`, `proposal`, `security`) and uppercase it for the PR title prefix (e.g., `HOTFIX:`, `SECURITY:`). For a `security-` branch, emit NO `Closes #` — record the code-scanning alert reference instead (see Phase 4).
4. If branch name is invalid, warn user and ask how to proceed

## Phase 2: Gather Context

Invoke the `analyze-pr-commits` sub-agent to gather commit history, diff summary, issue context, and change significance:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:analyze-pr-commits"
- `prompt`: "Analyze commits for PR. Base: main. Branch: [branch name]. Issue number: [number or none]. Repository: [owner/repo]. Fetch GitHub issue: [true if standard branch, false if special prefix]."
- `description`: "Analyze PR commits"
```

After the agent completes, store the structured results (commit log, diff summary, issue context, breaking/meaningful flags).

If the agent reports breaking changes, treat `--release-notes` as mandatory — add it automatically regardless of whether the flag was passed. Inform the user: "Breaking changes detected — release notes will be included automatically."

## Phase 3: Generate PR Title

**Standard format:** `<Business-valuable description>`
**Special prefix format:** `<PREFIX>: <Business-valuable description>` where `<PREFIX>` is one of `HOTFIX`, `TRIVIAL`, `MAINTENANCE`, `PROPOSAL`, `SECURITY`

**Rules:**

- Standard title is the business description only — do NOT include the issue number in the title (it goes in the `**Issues:**` section via `Closes #<n>`)
- Special prefixes are uppercase, followed by a colon and a space
- Description is capitalized, business-focused, no period
- Under 120 characters total
- NOT Conventional Commits format
- Must be understandable without reading the code

**Generate a title that:**

- Describes the business value or user impact
- Is understandable by someone on their first day
- Avoids implementation details
- Avoids technical jargon without context

## Phase 4: Generate PR Description

The PR body uses `---` separators to divide three sections: description, release notes (optional), and issue links.

**CRITICAL — Section ordering is MANDATORY and MUST NOT be rearranged:**

1. Description (FIRST — always at the top, no heading)
2. Release notes (MIDDLE — only when applicable, headed `**Release notes:**`)
3. Issue links (LAST — always at the bottom, headed `**Issues:**`)

Each section is separated by `---`. The `**Issues:**` section is ALWAYS last. Placing it before the description or release notes is a format violation.

**Section 1: Description**

- Brief description of what and why (1-2 sentences)
- Bullet list for important implementation details

**Formatting rule (no hard-wrapping):**

- Do NOT hard-wrap or line-break text within paragraphs or bullet items at any column width
- Each paragraph must be a single continuous line (let GitHub handle word wrapping)
- Each bullet item must be a single continuous line
- GitHub renders single newlines as visible line breaks — hard-wrapping creates ugly broken text

**Section 2: Release Notes (conditional)**

Include this section (titled `**Release notes:**`) with a `---` separator when:

- `--release-notes` flag is present, OR
- Breaking changes were detected (Phase 2 step 8 — mandatory)

Content rules:

- Short, user-facing descriptions of changes (not implementation details)
- Written for someone reading a project changelog
- Focus on what changed from the user/API consumer perspective
- Use bullet points, one per distinct user-facing change
- Keep each bullet to 1 sentence
- For breaking changes, prefix with "BREAKING:" and describe the impact

**Format rules (exact heading required):**

- The heading MUST be exactly `**Release notes:**` — bold, lowercase "n" in "notes", with colon
- DO NOT use `## Release Notes` (H2 heading) — that format is for `.release_notes/*.md` files only
- DO NOT use `**Release Notes:**` (capital "N") — use lowercase `**Release notes:**`
- The section MUST be placed between the description and the `**Issues:**` section
- The section MUST be separated from adjacent sections by `---` on both sides

**Section 3: Issue Links (titled `**Issues:**`)**

**Format rules (exact section required):**

- The heading MUST be exactly `**Issues:**` — bold, with colon
- The section MUST be separated from the previous section by `---`
- There MUST be a blank line between the `---` separator and the `**Issues:**` heading
- The section MUST be present when any issue-linking magic words exist
- DO NOT place magic words (e.g., `Closes #N`, `Related to #N`) as bare text in the description — they MUST be inside the `**Issues:**` section
- Issue links MUST use magic words — NEVER use markdown links like `[#N](url)`
- The section is omitted ONLY for special prefix branches (HOTFIX / TRIVIAL / MAINTENANCE / PROPOSAL / SECURITY) when no issue numbers are provided
- For a `security-` branch (code-scanning alert fix), the `**Issues:**` section is omitted and replaced by an `**Alert:**` section recording the alert reference — a `---` separator, then `**Alert:**` on its own line, then the alert URL. The URL is the `htmlUrl` from the run skill's Phase 0 `resolve-alert-context` output, carried in conversation context; when `pr:create` runs standalone (no parent context), resolve it via `gh api repos/{owner}/{repo}/code-scanning/alerts/{n}` if the alert number is known, otherwise ask the user for the alert URL. Emit NO `Closes #`: code-scanning alerts close on the next scan, not via PR magic words. The `**Alert:**` section is last, in the same slot `**Issues:**` would occupy.

**Magic Words:**

- `Closes #N` — Links and closes the issue on merge
- `Fixes #N` — Links and closes the issue on merge
- `Resolves #N` — Links and closes the issue on merge
- `Part of #N` — Plain reference (auto-linked, no close)
- `Related to #N` — Plain reference (auto-linked, no close)

**Issue linking rules:**

1. Always include `Closes #<N>` for the issue number derived from the branch name (skip for special prefix branches — no GitHub issue exists)
2. If `--closes` provided, add `Closes #<n>` for each additional issue
3. If `--related` provided, add `Related to #<n>` for each related issue
4. Each magic word on its own line

**Example format (with release notes):**

```
<Brief description of what this PR does and why it's needed.>

- <Important implementation detail 1>
- <Important implementation detail 2>

---

**Release notes:**

- <User-facing change 1>
- <User-facing change 2>

---

**Issues:**

Closes #<issue-from-branch>
Closes #<issue-from-closes-arg>
Related to #<issue-from-related-arg>
```

**Example format (without release notes):**

```
<Brief description of what this PR does and why it's needed.>

- <Important implementation detail 1>
- <Important implementation detail 2>

---

**Issues:**

Closes #<issue-from-branch>
```

## Phase 5: Verify with User

**Autopilot bypass:** If `autopilotMode` is true, skip the AskUserQuestion confirmation below. Before proceeding to Phase 6:

- If meaningful changes are detected (Phase 2 step 7) AND neither `--release-notes` nor breaking changes triggered the release notes section, auto-generate the `**Release notes:**` section using the rules in Phase 4 and insert it between the description and the `**Issues:**` section (with `---` separators).
- Then proceed directly to Phase 6 with the resulting title and body.

Present PR details using **AskUserQuestion tool** with preview.

1. Compose the full PR content (title + description with separators) as a single string.

2. Confirm using AskUserQuestion tool:

   **Tool call structure: See AskUserQuestion Contract above. All rules are mandatory.**

   Tool parameters:
   - `question`: "Review the pull request details and choose an action."
   - `header`: "Create PR"
   - `options`:

     **If `--release-notes` was NOT used AND no breaking changes AND meaningful changes detected (Phase 2 step 7):**
     [
     { label: "Create PR", description: "Create pull request ready for review", preview: "<full PR content>" },
     { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "<full PR content>" },
     { label: "Edit content", description: "Modify title or description", preview: "<full PR content>" },
     { label: "Cancel", description: "Abort PR creation", preview: "<full PR content>" }
     ]

     **Otherwise (flag used, breaking changes auto-added, or no meaningful changes):**
     [
     { label: "Create PR", description: "Create pull request ready for review", preview: "<full PR content>" },
     { label: "Edit content", description: "Modify title or description", preview: "<full PR content>" },
     { label: "Cancel", description: "Abort PR creation", preview: "<full PR content>" }
     ]

   - `multiSelect`: false

   All options use the same `preview` content (full PR title + body) since the user is choosing an action, not content. The preview enables a side-by-side layout in the UI.

3. If user selects "Add release notes":
   - Generate the **Release notes:** section (same rules as Phase 4)
   - Insert it into the PR body between the description and issue links sections (with `---` separators)
   - Re-present the full PR content using AskUserQuestion with preview (without the "Add release notes" option)

4. If user selects "Edit content": ask what to change, regenerate, re-present

5. If user selects "Cancel": abort with "PR creation cancelled."

6. Only proceed after user selects "Create PR"
7. Once "Create PR" is selected, immediately continue to Phase 6 below to execute `gh pr create`. Do not stop here.

## Phase 6: Create Pull Request

This phase is mandatory. Do not end the workflow before executing these steps.

1. Check if branch is pushed to remote: `git ls-remote --heads origin <branch>`
2. If not pushed, push with: `git push -u origin <branch>`
3. Create PR using gh CLI:
   - If `--draft` flag was passed: `gh pr create --draft --title "<title>" --body "<body>"`
   - Otherwise: `gh pr create --title "<title>" --body "<body>"`
4. Output the PR URL
5. This is the final step of the workflow. The skill is complete only after outputting the PR URL.

## Examples

### Basic PR (closes branch issue only)

**Command:** `/create-pr`

**Branch:** `issue-749-editor-theme-selection`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Edit content", description: "Modify title or description", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Cancel", description: "Abort PR creation", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Issues:**\n\nCloses #749" }
  ]

Meaningful changes detected (feat: commits). "Add release notes" option shown.

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/123
```

---

### PR with additional issues to close

**Command:** `/create-pr --closes #750,#751`

**Branch:** `issue-749-editor-theme-selection`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme per-workspace setting\n- Fixed related caching issues\n\n---\n\n**Issues:**\n\nCloses #749\nCloses #750\nCloses #751" },
  { label: "Edit content", description: "Modify title or description", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme per-workspace setting\n- Fixed related caching issues\n\n---\n\n**Issues:**\n\nCloses #749\nCloses #750\nCloses #751" },
  { label: "Cancel", description: "Abort PR creation", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme per-workspace setting\n- Fixed related caching issues\n\n---\n\n**Issues:**\n\nCloses #749\nCloses #750\nCloses #751" }
  ]

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/124
```

---

### PR with related issues

**Command:** `/create-pr --related #600`

**Branch:** `issue-605-annotation-streaming`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Refactor annotation codec for streaming support\n\nPart of the wire-format migration. Annotation codec is now streaming-capable.\n\n- No functional changes\n- All existing tests pass\n\n---\n\n**Issues:**\n\nCloses #605\nRelated to #600" },
  { label: "Edit content", description: "Modify title or description", preview: "Refactor annotation codec for streaming support\n\nPart of the wire-format migration. Annotation codec is now streaming-capable.\n\n- No functional changes\n- All existing tests pass\n\n---\n\n**Issues:**\n\nCloses #605\nRelated to #600" },
  { label: "Cancel", description: "Abort PR creation", preview: "Refactor annotation codec for streaming support\n\nPart of the wire-format migration. Annotation codec is now streaming-capable.\n\n- No functional changes\n- All existing tests pass\n\n---\n\n**Issues:**\n\nCloses #605\nRelated to #600" }
  ]

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/125
```

---

### Draft PR with multiple issue links

**Command:** `/create-pr --draft --closes #21 --related #20`

**Branch:** `issue-21-annotation-playback-events`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Add annotation events for playback duration reporting\n\nThe viewer needs to report how much of a plan was actually read before the user resolved it. This data is required for accurate review analytics.\n\n- AnnotationOpenedEvent\n- AnnotationResolvedEvent\n\n---\n\n**Issues:**\n\nCloses #21\nRelated to #20" },
  { label: "Edit content", description: "Modify title or description", preview: "Add annotation events for playback duration reporting\n\nThe viewer needs to report how much of a plan was actually read before the user resolved it. This data is required for accurate review analytics.\n\n- AnnotationOpenedEvent\n- AnnotationResolvedEvent\n\n---\n\n**Issues:**\n\nCloses #21\nRelated to #20" },
  { label: "Cancel", description: "Abort PR creation", preview: "Add annotation events for playback duration reporting\n\nThe viewer needs to report how much of a plan was actually read before the user resolved it. This data is required for accurate review analytics.\n\n- AnnotationOpenedEvent\n- AnnotationResolvedEvent\n\n---\n\n**Issues:**\n\nCloses #21\nRelated to #20" }
  ]

User selects "Create PR".

```
✓ Created draft PR: https://github.com/org/repo/pull/126
```

---

### Special prefix PR (HOTFIX)

**Command:** `/create-pr`

**Branch:** `hotfix-memory-leak-editor`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "HOTFIX: Fix memory leak in editor\n\nFixed a memory leak in the editor caused by unreleased document buffers.\n\n- Properly dispose document buffers after editor close" },
  { label: "Edit content", description: "Modify title or description", preview: "HOTFIX: Fix memory leak in editor\n\nFixed a memory leak in the editor caused by unreleased document buffers.\n\n- Properly dispose document buffers after editor close" },
  { label: "Cancel", description: "Abort PR creation", preview: "HOTFIX: Fix memory leak in editor\n\nFixed a memory leak in the editor caused by unreleased document buffers.\n\n- Properly dispose document buffers after editor close" }
  ]

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/127
```

---

### Special prefix PR (PROPOSAL)

**Command:** `/create-pr`

**Branch:** `proposal-add-vim-keybindings`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "PROPOSAL: Add Vim keybindings\n\nProposes Vim-style modal keybindings as an opt-in editor mode. Discussion on this PR will decide if we adopt it.\n\n- Sketch of normal/insert/visual mode bindings\n- Opt-in via editor.mode setting" },
  { label: "Edit content", description: "Modify title or description", preview: "PROPOSAL: Add Vim keybindings\n\nProposes Vim-style modal keybindings as an opt-in editor mode. Discussion on this PR will decide if we adopt it.\n\n- Sketch of normal/insert/visual mode bindings\n- Opt-in via editor.mode setting" },
  { label: "Cancel", description: "Abort PR creation", preview: "PROPOSAL: Add Vim keybindings\n\nProposes Vim-style modal keybindings as an opt-in editor mode. Discussion on this PR will decide if we adopt it.\n\n- Sketch of normal/insert/visual mode bindings\n- Opt-in via editor.mode setting" }
  ]

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/131
```

---

### PR with release notes

**Command:** `/create-pr --release-notes`

**Branch:** `issue-749-editor-theme-selection`

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Release notes:**\n\n- Added per-workspace editor theme selection\n- Default theme fallback when no workspace preference is set\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Edit content", description: "Modify title or description", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Release notes:**\n\n- Added per-workspace editor theme selection\n- Default theme fallback when no workspace preference is set\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Cancel", description: "Abort PR creation", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n\n---\n\n**Release notes:**\n\n- Added per-workspace editor theme selection\n- Default theme fallback when no workspace preference is set\n\n---\n\n**Issues:**\n\nCloses #749" }
  ]

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/128
```

---

### PR with breaking changes (release notes auto-added)

**Command:** `/create-pr`

**Branch:** `issue-400-remove-legacy-plan-import`

Breaking changes detected (`feat!:` commit). Release notes added automatically.

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Remove legacy plan-import endpoints\n\nRemoved deprecated v1 plan-import endpoints. All consumers must migrate to v2.\n\n- Removed /api/v1/plans/* routes\n- Updated API documentation\n\n---\n\n**Release notes:**\n\n- BREAKING: Removed legacy plan-import v1 endpoints — migrate to /api/v2\n\n---\n\n**Issues:**\n\nCloses #400" },
  { label: "Edit content", description: "Modify title or description", preview: "Remove legacy plan-import endpoints\n\nRemoved deprecated v1 plan-import endpoints. All consumers must migrate to v2.\n\n- Removed /api/v1/plans/* routes\n- Updated API documentation\n\n---\n\n**Release notes:**\n\n- BREAKING: Removed legacy plan-import v1 endpoints — migrate to /api/v2\n\n---\n\n**Issues:**\n\nCloses #400" },
  { label: "Cancel", description: "Abort PR creation", preview: "Remove legacy plan-import endpoints\n\nRemoved deprecated v1 plan-import endpoints. All consumers must migrate to v2.\n\n- Removed /api/v1/plans/* routes\n- Updated API documentation\n\n---\n\n**Release notes:**\n\n- BREAKING: Removed legacy plan-import v1 endpoints — migrate to /api/v2\n\n---\n\n**Issues:**\n\nCloses #400" }
  ]

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/129
```

---

### PR with auto-suggested release notes

**Command:** `/create-pr`

**Branch:** `issue-801-add-billing-export`

Meaningful changes detected (`feat:` commits). "Add release notes" option shown.

AskUserQuestion with:

- `question`: "Review the pull request details and choose an action."
- `header`: "Create PR"
- `options`: [
  { label: "Create PR", description: "Create pull request ready for review", preview: "Add monthly billing export\n\nAdded ability to export monthly billing data as CSV.\n\n- New /api/v2/billing/export endpoint\n- Supports date range filtering\n\n---\n\n**Issues:**\n\nCloses #801" },
  { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "Add monthly billing export\n\nAdded ability to export monthly billing data as CSV.\n\n- New /api/v2/billing/export endpoint\n- Supports date range filtering\n\n---\n\n**Issues:**\n\nCloses #801" },
  { label: "Edit content", description: "Modify title or description", preview: "Add monthly billing export\n\nAdded ability to export monthly billing data as CSV.\n\n- New /api/v2/billing/export endpoint\n- Supports date range filtering\n\n---\n\n**Issues:**\n\nCloses #801" },
  { label: "Cancel", description: "Abort PR creation", preview: "Add monthly billing export\n\nAdded ability to export monthly billing data as CSV.\n\n- New /api/v2/billing/export endpoint\n- Supports date range filtering\n\n---\n\n**Issues:**\n\nCloses #801" }
  ]

User selects "Add release notes". Notes generated and inserted. Re-presented with preview for confirmation.

User selects "Create PR".

```
✓ Created PR: https://github.com/org/repo/pull/130
```

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Prefer stable references that never rot; render the same kind of reference the same way everywhere:

- Code identifiers and file names — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked specimen names the thing without a link that breaks when a file moves or a doc is restructured.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Other docs and sections — do NOT link a doc name or a section anchor; those rot the moment the doc is restructured. Inline a short gist of the point you need instead.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
