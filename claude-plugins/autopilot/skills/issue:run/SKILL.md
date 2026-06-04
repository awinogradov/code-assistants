---
name: issue:run
description: List recent open GitHub issues, pick one, and start autopilot on it via the run skill. Use to go from browsing issues to a running autopilot session in one step.
argument-hint: "[issue number — optional; skips the picker]"
allowed-tools:
  - Bash(gh *)
  - AskUserQuestion
  - Skill(autopilot:run)
---

# Run Autopilot on an Issue

Pick one of the repository's recent open issues and hand it to `autopilot:run`, which drives the full pipeline (plan → implement → commit → PR → monitor). This is the discovery counterpart to `issue:create`: `issue:create` files an issue, `issue:run` starts work on one — without leaving the slash prompt to look up a number.

## When to Use

- When you want to start work but first need to browse the repository's open issues
- When you already know the issue number and want a shortcut straight into `autopilot:run`

## Flow

```text
┌────────────────────────────────────┐
│  /issue:run  [optional #number]    │ ①
└─────────────────┬──────────────────┘
                  ▼
┌────────────────────────────────────┐
│  gh issue list --state open        │ ②
│  --search "sort:updated-desc"      │
└─────────────────┬──────────────────┘
                  ▼
┌────────────────────────────────────┐
│  AskUserQuestion (single-select)   │ ③
│    (●) #142  Fix login bug         │
│    ( ) #138  Flaky CI run          │
│    ( ) #131  Docs typo             │
│    ( ) #129  Add dark mode         │
│    ( ) Other: type any number…     │
└─────────────────┬──────────────────┘
                  ▼
┌────────────────────────────────────┐
│  Skill(autopilot:run) <number>     │ ④
└─────────────────┬──────────────────┘
                  ▼
┌────────────────────────────────────┐
│  plan → implement → commit →       │ ⑤
│  PR → monitor                      │
└────────────────────────────────────┘
```

**Flow legend:**

- ① User invokes `/issue:run`; an optional issue number skips straight to ④.
- ② Skill lists recent open issues, most-recently-updated first.
- ③ AskUserQuestion shows up to four issues; the auto-provided "Other" accepts any number.
- ④ Skill hands the chosen number to `autopilot:run`.
- ⑤ `autopilot:run` owns the rest of the pipeline.

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `[issue number]` — optional. A bare number (`42`) or `#`-prefixed (`#42`). When present, the picker is skipped and autopilot runs on that issue directly. When empty, the skill lists recent open issues to choose from.

## Input resolution

- **Issue number** — if `$ARGUMENTS` contains an issue number, skip Phases 1-2 and hand it straight to Phase 3. Otherwise list and prompt.
- **Repository** — `gh repo view --json nameWithOwner -q .nameWithOwner`. No prompt. Pass `--repo <owner/repo>` to every `gh` call so the skill is correct inside git worktrees.

## Phase 0: Resolve Repository

Resolve the repository once and store it as `<repo>` (format `owner/name`):

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

If `$ARGUMENTS` already supplies an issue number, skip directly to Phase 3.

## Phase 1: Fetch Recent Open Issues

List the four most-recently-updated open issues:

```bash
gh issue list --repo <repo> --state open --limit 4 --search "sort:updated-desc" --json number,title,labels
```

- Non-empty result — keep it for Phase 2.
- Empty result (`[]`) — there are no open issues to pick from. Tell the user and stop; if they have a number in mind they can re-invoke as `/issue:run <number>`.
- Non-zero exit (auth or network failure) — report the `gh` error verbatim and stop. Never invent issues.

## Phase 2: Select an Issue

Present the fetched issues with `AskUserQuestion` (single-select):

- `question`: "Which issue should autopilot run on? Pick one, or choose Other to enter any issue number."
- `header`: "Issue"
- `options`: one entry per fetched issue, `{ label: "#<number> <title>", description: "<comma-separated labels, or 'no labels'>" }` (truncate the title so the label stays short). `AskUserQuestion` requires two to four options, so: with two or more issues, list up to four; with exactly one, list it plus a second option `Enter a different number`; with none, follow Phase 1's empty-result handling and do not call `AskUserQuestion`.
- `multiSelect`: false

Do NOT add an "Other" option — `AskUserQuestion` always provides a free-text "Other" automatically, and adding one is invalid. The auto-provided "Other" lets the user type any issue number, including issues beyond the four shown.

Resolve the selection to an issue number:

- A listed issue option — use its `<number>`.
- `Enter a different number` (shown only in the single-issue case) or the auto-provided free-text "Other" — read the entered value, strip a leading `#`, and take the leading integer. If it is not a positive integer, re-prompt once; if it still fails, report the invalid input and stop.

Existence and open/closed state are not checked here — `autopilot:run` owns issue resolution, so a syntactically valid number is handed off as-is.

## Phase 3: Hand Off to Autopilot

Invoke `Skill(autopilot:run)` with the resolved number as its argument (the bare integer, e.g. `142`). `autopilot:run` owns everything downstream — issue resolution, planning, branch creation, implementation, commit, PR, and monitoring. This skill makes no further changes after the hand-off.

## Examples

### Example 1: Pick from the list

```
/issue:run
```

Lists the four most-recently-updated open issues; the user selects `#142 Fix login bug`; the skill invokes `Skill(autopilot:run)` with `142`.

### Example 2: Skip the picker

```
/issue:run 142
```

`$ARGUMENTS` is a number, so the skill skips the listing and invokes `Skill(autopilot:run)` with `142` directly.

### Example 3: An issue beyond the top four

```
/issue:run
```

The target issue is not among the four shown; the user chooses "Other" and types `131`; the skill invokes `Skill(autopilot:run)` with `131`.

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
