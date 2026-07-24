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

Every AskUserQuestion call that presents content for review (PR previews in [Phase 6](#phase-6-verify-with-user)) MUST follow these exact rules. Simple choice dialogs ([Phase 4](#phase-4-ask-user-for-context-optional) Auto-generate/Add context) are exempt from the preview requirement.

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
   - GitHub: `issue-<number>-<short-description>` (e.g., `issue-123-add-feature`)
   - Linear: `<team>-<number>-<short-description>` (e.g., `eng-123-add-auth`)
   - Special prefix: `<hotfix|trivial|maintenance|proposal|security>-<short-description>` (e.g., `hotfix-memory-leak-editor`, `security-tainted-format-string`)
3. Determine the provider and issue reference from the branch, checking **in this order**:
   - **GitHub** — `^issue-([0-9]+)-`: extract the number; `provider = github`; link as `Closes #<n>`.
   - **Special prefix** — `hotfix-`/`trivial-`/`maintenance-`/`proposal-`/`security-`: the PR title uses the uppercased prefix (e.g., `HOTFIX:`). For a `security-` branch, emit NO `Closes #` — keep the code-scanning alert reference (see the `**Alert:**` rule below).
   - **Linear** — `^([a-z][a-z0-9]*)-([0-9]+)-`: uppercase to the Linear id (e.g., `eng-123-…` → `ENG-123`); `provider = linear`; the title gets the `ENG-123:` prefix and `**Issues:**` carries the magic word with the plain Linear issue URL — `Closes <linear-issue-url>` from the issue context below (bare-id fallback per the Magic Words rule in [Phase 5](#phase-5-generate-updated-pr-title-and-body)).

Invoke the `analyze-pr-commits` sub-agent to gather commit history, diff summary, issue context, and change significance:

```
Use the Agent tool with:
- `subagent_type`: "autopilot:analyze-pr-commits"
- `prompt`: "Analyze commits for PR. Base: [base branch from Phase 1]. Branch: [branch name]. Provider: [github or linear]. Issue number: [GitHub number, Linear id, or none]. Repository: [owner/repo]. Fetch issue: [true if a GitHub or Linear issue branch, false if special prefix]."
- `description`: "Analyze PR commits"
```

After the agent completes, store the structured results (commit log, diff summary, issue context, breaking/meaningful flags).

4. If the agent reports breaking changes, treat release notes as mandatory — inform: "Breaking changes detected — release notes will be included automatically."
5. If user provided additional context (from conversation history or command arguments), incorporate it into generation

## Phase 4: Ask User for Context (Optional)

Use **AskUserQuestion tool** to ask if user wants to highlight anything:

**Formatting Note:** Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

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

Read [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md) and conform the updated title to it.

**Title self-check (MANDATORY):** re-verify the updated title against the [Phase 3](#phase-3-gather-context) provider before [Phase 7](#phase-7-push-and-update) executes `gh pr edit`. If `provider = linear`, the title MUST start with the branch's `<team>-<number>` uppercased plus `: ` (branch `frtns-28-pr-gate` → title starts with `FRTNS-28: `); if the prefix is missing — including when the existing PR title lacked it — or names a different id, fix the title now so an update restores the convention instead of preserving the defect. If `provider = github` or a special prefix, the title MUST NOT start with a `TEAM-N:` ticket prefix. This check is the gate, exactly like the reference-formatting self-check below is for the body.

### PR Body

Read [`pr-body-grammar.md`](../shared-rules/references/pr-body-grammar.md) and compose the body to it — section set, ordering, separators, release-notes heading, magic words, and the worked examples. The clauses below are specific to _updating_ an existing PR and have no counterpart in the shared block.

**Reference formatting (MANDATORY):** the generated body — both the description and the release-notes section — MUST follow the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) — read it first. The rule that keeps regressing: render every mention of a standard consistently as a link to its versioned RFC by stable ID (e.g., `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`), never a mix of bare text and links in the same body. Before finalizing, self-check the drafted body: a bare 7–40-char hex token or a bare tracker id (`[A-Z][A-Z0-9]*-[0-9]+`) outside the `**Issues:**` section is a violation — link it per the block.

**Preserving existing links:** Parse the old PR body's `**Issues:**` section to preserve existing magic-word links (`Closes`, `Fixes`, `Resolves`, `Part of`, `Related to`) — the reference after the magic word may be a GitHub `#N`, a legacy bare Linear id (`[A-Z][A-Z0-9]*-[0-9]+`, e.g. `Closes ENG-123`), or a Linear issue URL (`https://linear.app/<workspace>/issue/<KEY-N>` with optional trailing slug or slash). Accept all three; when regenerating a line that carried a legacy bare id, upgrade it to the URL form if the issue URL is resolvable from the issue context.

**Adding new links:** If `--closes` or `--related` flags were provided in the command invocation, add those as additional links.

**Issue linking rules specific to updating:**

1. Preserve any additional magic-word links from the old PR body
2. If `--closes` provided, add `Closes #<n>` for each additional issue (dedup with existing)
3. If `--related` provided, add `Related to #<n>` for each related issue (dedup with existing)

## Phase 6: Verify with User

Present the updated PR using **AskUserQuestion tool** with preview.

1. Compose the full PR content (title + description with separators) as a single string, after running the [Phase 5](#phase-5-generate-updated-pr-title-and-body) Title self-check on the title.

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
   - Generate the **Release notes:** section (same rules as [Phase 5](#phase-5-generate-updated-pr-title-and-body))
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

**Reference self-check (MANDATORY):** after composing the output, re-read it against [`reference-formatting.md`](../shared-rules/references/reference-formatting.md). A bare commit SHA, a bare tracker id outside a magic-word line, or an unlinked mention of a file that exists in the repo is a violation — fix it before emitting.
