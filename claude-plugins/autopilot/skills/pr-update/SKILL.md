---
name: pr-update
description: Update an existing pull request's title and description based on current branch commits. Use when PR needs to be refreshed after new commits or when asked to update PR.
argument-hint: "[--release-notes] [--closes #N,#M] [--related #X,#Y] [--autopilot]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Read
  - AskUserQuestion
---

# Update PR

Update an existing pull request's title and description to reflect the current state of the branch. Regathers context from all commits and the diff, then regenerates the PR content following the same conventions as `pr-create`.

## When to Use

- After pushing new commits to a branch with an existing PR
- When the PR title or description no longer reflects the changes
- When invoked from `commits-create` or `commits-restructure` via the "Update PR" prompt
- When the user explicitly asks to update/refresh a PR

## Input

Arguments: `$ARGUMENTS`

Expected flags (all optional):

- `--release-notes` — add or refresh the release notes section (auto-enabled on breaking changes)
- `--closes #N,#M` — additional issue numbers to close on merge
- `--related #X,#Y` — related issues to link without closing
- `--autopilot` — non-interactive mode used by skill callers (`commits-create`, `commits-restructure`) and `/autopilot:run`. Skips the [Phase 4](#phase-4-ask-user-for-context-optional) context dialog (auto-generate) and the [Phase 6](#phase-6-verify-with-user) confirmation — the update is applied directly, because the caller already established that refreshing the PR is bookkeeping, not a decision.

## Input resolution

Arguments are optional. Resolve each field:

- **`--release-notes`** — `$ARGUMENTS` → auto-enable on breaking changes detected in commit log → default `false`. Do NOT prompt.
- **`--closes`** / **`--related`** — `$ARGUMENTS` only. No inference, no prompt. Treat absence as intentional.
- **`--autopilot`** — `$ARGUMENTS` or the invoking skill's instruction only. Never inferred from conversation history. Default: `false` (interactive mode).
- **Existing PR** — detect via `gh pr view --json number,url,title,body,baseRefName,headRefName`. If no PR exists, abort with a clear message.
- **Branch + base + issue number** — from `git branch --show-current` and the `^issue-([0-9]+)-` pattern. Special prefix branches (`hotfix-`, `trivial-`, `maintenance-`, `proposal-`) have no issue number.
- **Repository conventions** — read `CONTRIBUTING.md` directly.

## AskUserQuestion Contract (MANDATORY)

Read [`askuserquestion-contract.md`](../shared-rules/references/askuserquestion-contract.md) and apply it to the [Phase 6](#phase-6-verify-with-user) PR preview dialog — the PR content (title + body with separators) is the preview. Simple choice dialogs ([Phase 4](#phase-4-ask-user-for-context-optional) Auto-generate/Add context) are exempt from the preview requirement.

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
2. Validate the branch name against the branch grammar in [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md)
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

**Autopilot bypass:** if `--autopilot` was passed, skip this phase — proceed with auto-generation.

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

**Title self-check (MANDATORY):** before [Phase 7](#phase-7-push-and-update) executes `gh pr edit`, run the Title self-check from [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md) against the [Phase 3](#phase-3-gather-context) provider.

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

**Autopilot bypass:** if `--autopilot` was passed, skip the dialog — compose the full PR content (title + body), run the [Phase 5](#phase-5-generate-updated-pr-title-and-body) Title self-check, and proceed directly to [Phase 7](#phase-7-push-and-update).

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

### Basic update after new commits (abbreviated for readability)

```
User: /update-pr

Detecting PR for current branch...
Found PR #42: Allow editor theme selection per workspace

Gathering context...
- 5 commits since main
- 8 files changed
```

[Phase 4](#phase-4-ask-user-for-context-optional) AskUserQuestion with:

- `question`: "Updating PR #42. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

[Phase 6](#phase-6-verify-with-user) AskUserQuestion parameters:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: `Update PR` / `Add release notes` / `Edit content` / `Cancel`, with the descriptions listed in [Phase 6](#phase-6-verify-with-user)
- `multiSelect`: false

Preview (every option carries this same full preview string):

```
Allow editor theme selection per workspace

Users can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.

- Added editor_theme per-workspace setting
- Falls back to the system theme if no preference is set
- Added validation for theme names

---

**Issues:**

Closes #749
```

User selects "Update PR".

```
✓ Updated PR #42: https://github.com/org/repo/pull/42
```

Further worked examples: read [references/examples.md](./references/examples.md) when a call site is ambiguous.
