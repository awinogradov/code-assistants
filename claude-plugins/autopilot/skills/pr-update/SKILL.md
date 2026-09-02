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

Both dialogs and the contract governing them live in [`references/interactive-dialogs.md`](./references/interactive-dialogs.md) — [Phase 4](#phase-4-ask-user-for-context-optional) and [Phase 6](#phase-6-verify-with-user) each say when to read it. Under `--autopilot` neither runs.

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

Otherwise ask whether the user wants to highlight anything, using the dialog in [`references/interactive-dialogs.md`](./references/interactive-dialogs.md#phase-4-ask-user-for-context-optional) — read it now. "Add context" incorporates the user's input into generation; "Auto-generate" proceeds directly.

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

Otherwise present the updated PR for review, using the dialog in [`references/interactive-dialogs.md`](./references/interactive-dialogs.md#phase-6-verify-with-user) — read it now. It carries the two option sets (they differ by whether release notes are still offerable), the shared-preview rule, and the handling for each choice. Only proceed to [Phase 7](#phase-7-push-and-update) after the user selects "Update PR".

## Phase 7: Push and Update

1. Check if local commits need pushing: `git log origin/<branch>..HEAD --oneline`
2. If unpushed commits exist, push: `git push`
3. Update PR: `gh pr edit <number> --title "<title>" --body "<body>"`
4. Output the result:

```
✓ Updated PR #<N>: <url>
```

## Examples

Worked call sites live in [`references/examples.md`](./references/examples.md) — read it when a call site is ambiguous.
