---
name: pr:update
description: Update an existing pull request's title and description based on current branch commits. Use when PR needs to be refreshed after new commits or when asked to update PR.
argument-hint: "[--release-notes] [--closes #N,#M] [--related #X,#Y]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Read
  - AskUserQuestion
---

# Update PR

Update an existing pull request's title and description to reflect the current state of the branch. Regathers context from all commits and the diff, then regenerates the PR content following the same conventions as `pr:create`.

## When to Use

- After pushing new commits to a branch with an existing PR
- When the PR title or description no longer reflects the changes
- When invoked from `commits:create` or `commits:restructure` via the "Update PR" prompt
- When the user explicitly asks to update/refresh a PR

## Input

Arguments: `$ARGUMENTS`

Expected flags (all optional):

- `--release-notes` — add or refresh the release notes section (auto-enabled on breaking changes)
- `--closes #N,#M` — additional issue numbers to close on merge
- `--related #X,#Y` — related issues to link without closing

## Input resolution

Arguments are optional. Resolve each field:

- **`--release-notes`** — `$ARGUMENTS` → auto-enable on breaking changes detected in commit log → default `false`. Do NOT prompt.
- **`--closes`** / **`--related`** — `$ARGUMENTS` only. No inference, no prompt. Treat absence as intentional.
- **Existing PR** — detect via `gh pr view --json number,url,title,body,baseRefName,headRefName`. If no PR exists, abort with a clear message.
- **Branch + base + issue number** — from `git branch --show-current` and the `^issue-([0-9]+)-` pattern. Special prefix branches (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`) have no issue number.
- **Repository conventions** — read `CONTRIBUTING.md` directly.

## AskUserQuestion Contract (MANDATORY)

Every AskUserQuestion call that presents content for review (PR previews in Phase 6) MUST follow these exact rules. Simple choice dialogs (Phase 4 Auto-generate/Add context) are exempt from the preview requirement.

1. **`question` is FIXED TEXT** — use the EXACT string specified in each phase. NEVER add PR titles, bodies, metadata, file lists, diffs, or any other content to the question field.
2. **`header` is FIXED TEXT** — use the EXACT string specified in each phase.
3. **`preview` is MANDATORY** — every option MUST include a `preview` field. The PR content (title + body with separators) goes ONLY in `preview`. NEVER put content in `question`, `label`, or `description`.
4. **`label` values are EXACT** — use the exact text specified (e.g., "Update PR", "Edit content", "Cancel"). No abbreviations, no paraphrasing, no creative alternatives.
5. **`description` values are EXACT** — use the exact text specified. No rewording.
6. **ALL options are REQUIRED** — include every option listed in the phase. NEVER omit "Cancel".
7. **Same `preview` on all options** — the user chooses an action, not content. All options show identical preview text.
8. **NO shorthand in `preview`** — never pass `"..."`, `"<same content>"`, `"<full PR content>"`, or any other placeholder string as a preview value. Copy the full preview string literally into every option. Shorthand is illustrative only; it must never appear in an actual AskUserQuestion tool call.

### WRONG — PR content in question field

```
AskUserQuestion({
  question: "Title: Allow editor theme selection\nBase: main\nBranch: issue-749-editor-theme\n5 commits, 8 files changed\n\nBody:\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme setting\n- Falls back to system theme\n\nCloses #749",
  header: "Update PR",
  options: [
    { label: "Update PR", description: "Apply changes" },
    { label: "Edit", description: "Let me adjust" }
  ]
})
```

### WRONG — abbreviated labels, no preview, missing Cancel

```
AskUserQuestion({
  question: "Review the updated pull request and choose an action.",
  header: "Update PR",
  options: [
    { label: "Update", description: "Allow editor theme selection - Added editor_theme setting..." },
    { label: "Edit", description: "Modify" }
  ]
})
```

### CORRECT

```
AskUserQuestion({
  question: "Review the updated pull request and choose an action.",
  header: "Update PR",
  options: [
    { label: "Update PR", description: "Apply changes to PR #42", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme setting\n- Falls back to system theme\n\n---\n\n**Issues:**\n\nCloses #749" },
    { label: "Edit content", description: "Modify title or description", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme setting\n- Falls back to system theme\n\n---\n\n**Issues:**\n\nCloses #749" },
    { label: "Cancel", description: "Keep the PR unchanged", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace.\n\n- Added editor_theme setting\n- Falls back to system theme\n\n---\n\n**Issues:**\n\nCloses #749" }
  ]
})
```

## Phase 1: Detect PR

1. Run `gh pr view --json number,title,body,url,baseRefName` to get the current branch's PR
2. If no PR exists, abort: "No pull request found for the current branch."
3. Store the old title and body for comparison
4. Extract the base branch name from PR data

## Phase 2: Read Repository Conventions

1. Check if `CONTRIBUTING.md` exists in the repository root
2. If exists, read it to understand:
   - PR title format requirements
   - PR description requirements
   - Magic words for issue linking
   - Branch naming conventions

## Phase 3: Gather Context

1. Get current branch name with `git branch --show-current`
2. Validate branch name follows convention:
   - Standard: `issue-<number>-<short-description>` (e.g., `issue-123-add-feature`)
   - Special prefix: `<hotfix|trivial|maintenance|proposal|security>-<short-description>` (e.g., `hotfix-memory-leak-editor`, `security-tainted-format-string`)
3. Extract the issue number from `^issue-([0-9]+)-` for use in the `**Issues:**` section as `Closes #<n>`. For special prefix branches there is no issue number — the PR title uses the uppercased prefix (e.g., `HOTFIX:`, `SECURITY:`). For a `security-` branch, emit NO `Closes #` — keep the code-scanning alert reference (see the `**Alert:**` rule below).

Invoke the `analyze-pr-commits` sub-agent to gather commit history, diff summary, issue context, and change significance:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:analyze-pr-commits"
- `prompt`: "Analyze commits for PR. Base: [base branch from Phase 1]. Branch: [branch name]. Issue number: [number or none]. Repository: [owner/repo]. Fetch GitHub issue: [true if standard branch, false if special prefix]."
- `description`: "Analyze PR commits"
```

After the agent completes, store the structured results (commit log, diff summary, issue context, breaking/meaningful flags).

4. If the agent reports breaking changes, treat release notes as mandatory — inform: "Breaking changes detected — release notes will be included automatically."
5. If user provided additional context (from conversation history or command arguments), incorporate it into generation

## Phase 4: Ask User for Context (Optional)

Use **AskUserQuestion tool** to ask if user wants to highlight anything:

**Formatting Note:** Do not use markdown formatting (bold, italic, headers) in the `question` parameter — it renders as raw text. Use plain text with line breaks and simple labels instead.

Tool parameters:

- `question`: "Updating PR #<N>. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"
- `options`: [
  { label: "Auto-generate", description: "Generate title and description from commits and diff" },
  { label: "Add context", description: "Provide specific points to emphasize" }
  ]
- `multiSelect`: false

- If "Add context" selected: ask user for their input, then incorporate into generation
- If "Auto-generate" selected: proceed directly

## Phase 5: Generate Updated PR Title and Body

### PR Title

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

### PR Body

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

- `--release-notes` flag is present in the command invocation, OR
- Breaking changes were detected (Phase 3 step 10 — mandatory)

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
- For a `security-` branch (code-scanning alert fix), the `**Issues:**` section is replaced by an `**Alert:**` section recording the alert URL (a `---` separator, then `**Alert:**` on its own line, then the alert URL). Emit NO `Closes #`: code-scanning alerts close on the next scan, not via PR magic words. The `**Alert:**` section occupies the last slot, where `**Issues:**` would go.

**Preserving existing links:** Parse the old PR body's `**Issues:**` section to preserve existing magic-word links (`Closes`, `Fixes`, `Resolves`, `Part of`, `Related to`) that were set during PR creation or previous updates.

**Adding new links:** If `--closes` or `--related` flags were provided in the command invocation, add those as additional links.

**Magic Words:**

- `Closes #N` — Links and closes the issue on merge
- `Fixes #N` — Links and closes the issue on merge
- `Resolves #N` — Links and closes the issue on merge
- `Part of #N` — Plain reference (auto-linked, no close)
- `Related to #N` — Plain reference (auto-linked, no close)

**Issue linking rules:**

1. Always include `Closes #<N>` for the issue number derived from the branch name (skip for special prefix branches)
2. Preserve any additional magic-word links from the old PR body
3. If `--closes` provided, add `Closes #<n>` for each additional issue (dedup with existing)
4. If `--related` provided, add `Related to #<n>` for each related issue (dedup with existing)
5. Each magic word on its own line

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
Closes #<issue-from-old-body>
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

## Phase 6: Verify with User

Present the updated PR using **AskUserQuestion tool** with preview.

1. Compose the full PR content (title + description with separators) as a single string.

2. Confirm using AskUserQuestion tool:

   **Tool call structure: See AskUserQuestion Contract above. All rules are mandatory.**

   Tool parameters:
   - `question`: "Review the updated pull request and choose an action."
   - `header`: "Update PR"
   - `options`:

     **If `--release-notes` was NOT used AND no breaking changes AND meaningful changes detected:**
     [
     { label: "Update PR", description: "Apply changes to PR #<N>", preview: "<full PR content>" },
     { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "<full PR content>" },
     { label: "Edit content", description: "Modify title or description", preview: "<full PR content>" },
     { label: "Cancel", description: "Keep the PR unchanged", preview: "<full PR content>" }
     ]

     **Otherwise (flag used, breaking changes auto-added, or no meaningful changes):**
     [
     { label: "Update PR", description: "Apply changes to PR #<N>", preview: "<full PR content>" },
     { label: "Edit content", description: "Modify title or description", preview: "<full PR content>" },
     { label: "Cancel", description: "Keep the PR unchanged", preview: "<full PR content>" }
     ]

   - `multiSelect`: false

   All options use the same `preview` content (full PR title + body) since the user is choosing an action, not content. The preview enables a side-by-side layout in the UI.

3. If user selects "Add release notes":
   - Generate the **Release notes:** section (same rules as Phase 5)
   - Insert it into the PR body between the description and issue links sections (with `---` separators)
   - Re-present the full PR content using AskUserQuestion with preview (without the "Add release notes" option)

4. If user selects "Edit content": ask what to change, regenerate, re-present

5. If user selects "Cancel": abort with "PR update cancelled."

6. Only proceed after user selects "Update PR"

## Phase 7: Push and Update

1. Check if local commits need pushing: `git log origin/<branch>..HEAD --oneline`
2. If unpushed commits exist, push: `git push`
3. Update PR: `gh pr edit <number> --title "<title>" --body "<body>"`
4. Output the result:

```
✓ Updated PR #<N>: <url>
```

## Examples

### Basic update after new commits

```
User: /update-pr

Detecting PR for current branch...
Found PR #42: Allow editor theme selection per workspace

Gathering context...
- 5 commits since main
- 8 files changed
```

AskUserQuestion with:

- `question`: "Updating PR #42. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

AskUserQuestion with:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Apply changes to PR #42", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Edit content", description: "Modify title or description", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Cancel", description: "Keep the PR unchanged", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" }
  ]

User selects "Update PR".

```
✓ Updated PR #42: https://github.com/org/repo/pull/42
```

### Update with release notes added

**Branch:** `issue-200-password-reset`

AskUserQuestion with:

- `question`: "Updating PR #15. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

AskUserQuestion with:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Apply changes to PR #15", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" },
  { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" },
  { label: "Edit content", description: "Modify title or description", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" },
  { label: "Cancel", description: "Keep the PR unchanged", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" }
  ]

Meaningful changes detected (feat: commits). "Add release notes" option shown.

User selects "Add release notes". Notes generated and inserted. Re-presented with preview for confirmation.

User selects "Update PR".

```
✓ Updated PR #15: https://github.com/org/repo/pull/15
```

---

### Update with non-meaningful changes only

**Branch:** `issue-300-update-docs`

AskUserQuestion with:

- `question`: "Updating PR #45. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

AskUserQuestion with:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Apply changes to PR #45", preview: "Update API documentation for v2 endpoints\n\nUpdated OpenAPI specs and usage examples for the v2 billing endpoints.\n\n- Corrected request/response schemas\n- Added rate limiting documentation\n\n---\n\n**Issues:**\n\nCloses #300" },
  { label: "Edit content", description: "Modify title or description", preview: "Update API documentation for v2 endpoints\n\nUpdated OpenAPI specs and usage examples for the v2 billing endpoints.\n\n- Corrected request/response schemas\n- Added rate limiting documentation\n\n---\n\n**Issues:**\n\nCloses #300" },
  { label: "Cancel", description: "Keep the PR unchanged", preview: "Update API documentation for v2 endpoints\n\nUpdated OpenAPI specs and usage examples for the v2 billing endpoints.\n\n- Corrected request/response schemas\n- Added rate limiting documentation\n\n---\n\n**Issues:**\n\nCloses #300" }
  ]

No meaningful changes (docs: commits only). "Add release notes" option not shown.

User selects "Update PR".

```
✓ Updated PR #45: https://github.com/org/repo/pull/45
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
