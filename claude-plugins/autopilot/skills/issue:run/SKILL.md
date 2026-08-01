---
name: issue:run
description: List recent open GitHub or Linear issues, pick one, and start autopilot on it via the run skill. Use to go from browsing issues to a running autopilot session in one step.
argument-hint: "[issue number — optional; skips the picker] [--all — include assigned issues]"
allowed-tools:
  - Bash(gh *)
  - Read
  - MCP(linear:*)
  - ToolSearch
  - AskUserQuestion
  - Skill(autopilot:run)
---

# Run Autopilot on an Issue

Pick one of the repository's recent open issues and hand it to `autopilot:run`, which drives the full pipeline (plan → implement → commit → PR → monitor). This is the discovery counterpart to `issue:create`: `issue:create` files an issue, `issue:run` starts work on one — without leaving the slash prompt to look up a number.

## When to Use

- When you want to start work but first need to browse the repository's open issues
- When you already know the issue number and want a shortcut straight into `autopilot:run`

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `[issue number]` — optional. A bare number (`42`) or `#`-prefixed (`#42`). When present, the picker is skipped and autopilot runs on that issue directly. When empty, the skill lists recent open issues to choose from.
- `[--all]` — optional. Lists every open issue, including assigned ones. Without it, the picker lists only unassigned open issues — work that is free to pick up.

## Input resolution

- **Issue number** — if `$ARGUMENTS` contains an issue number, skip Phases 1-2 and hand it straight to [Phase 3](#phase-3-hand-off-to-autopilot). Otherwise list and prompt.
- **`--all` flag** — parse `$ARGUMENTS` for `--all` independently of the issue number (order does not matter). The skill consumes the flag itself: it only toggles the [Phase 1](#phase-1-fetch-recent-open-issues) search string and is never forwarded to a `gh` call. Because a bare issue number skips Phases 1-2, `--all` is a no-op when an issue number is also supplied.
- **Repository** — `gh repo view --json nameWithOwner --jq .nameWithOwner`. No prompt. Pass `--repo <owner/repo>` to every `gh` call so the skill is correct inside git worktrees.

**Decision points.** Every user choice below uses AskUserQuestion (single-select). Read [`askuserquestion-format.md`](../shared-rules/references/askuserquestion-format.md) once and apply it to every `question` you compose.

## Phase 0: Resolve Repository and Provider

Resolve the repository once and store it as `<repo>` (format `owner/name`):

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

Determine the provider: read `agents.trackers` from `package.json` (via the Read tool). When at least one `linear` tracker is configured, the provider is **Linear** (note **every** configured `team`); otherwise **GitHub** (the default).

If `$ARGUMENTS` already supplies an issue identifier (a GitHub number or a Linear id), skip directly to [Phase 3](#phase-3-hand-off-to-autopilot).

## Phase 1: Fetch Recent Open Issues

**If the provider is Linear:** first pick the team to browse. With exactly one `linear` tracker, use its `team` (no prompt). With two or more, ask via AskUserQuestion (single-select) — one option per team, `{ label: "<team>", description: "<comma-joined keys, or 'no keys'>" }` — and use the chosen `team`. Then list that team's recent open issues via the Linear MCP `list_issues` tool (open only, ordered by most-recently-updated; without `--all`, prefer unassigned when the tool exposes an assignee filter). Then mirror the GitHub empty-state handling:

- Non-empty — map each to a picker option `{ label: "<identifier> <title>", description: "<labels or 'no labels'>" }` and continue at [Phase 2](#phase-2-select-an-issue).
- Empty with `--all` — there are genuinely no open issues to pick from; tell the user and stop (they can re-invoke as `/issue:run <id>`).
- Empty without `--all` — re-list once without the unassigned preference; if still empty, stop with the same message.

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool names `list_issues`.

The GitHub steps below apply to **GitHub** projects.

Build the search string from the `--all` flag, then list the four most-recently-updated matching open issues:

- Default (no `--all`) — `"sort:updated-desc no:assignee"`, so the picker shows only unassigned work.
- With `--all` — `"sort:updated-desc"`, the same string with the `no:assignee` qualifier removed, so every open issue is listed.

```bash
gh issue list --repo <repo> --state open --limit 4 --search "sort:updated-desc no:assignee" --json number,title,labels
```

- Non-empty result — keep it for [Phase 2](#phase-2-select-an-issue).
- Clean exit with an empty result (`[]`):
  - With `--all` — there are genuinely no open issues to pick from. Tell the user and stop; if they have a number in mind they can re-invoke as `/issue:run <number>`.
  - Without `--all` — every open issue may already be assigned. Probe once for any open issue, using the default search string with `no:assignee` removed:

    ```bash
    gh issue list --repo <repo> --state open --limit 1 --search "sort:updated-desc" --json number
    ```

    - Clean-exit non-empty probe — open issues exist but all are assigned. Tell the user "All open issues are currently assigned. Re-run `/issue:run --all` to include them, or pass an issue number directly." and stop.
    - Clean-exit empty (`[]`) probe — there are no open issues at all (same as the `--all` case). Tell the user and stop.

- Non-zero exit (auth or network failure) on either the list or the probe — report the `gh` error verbatim and stop. Only a clean exit with `[]` triggers an empty-state branch; never invent issues.

## Phase 2: Select an Issue

Ask (header "Issue"): which issue should autopilot run on? The choice set is exact — one choice per fetched issue, labeled with its identifier and title (truncate the title so the label stays short), described by its labels (or "no labels"); selecting a choice hands that issue to autopilot. Compose the dialog wording yourself, and mention that the free-text "Other" accepts any issue number.

Two constraints shape the option list:

- `AskUserQuestion` requires two to four options: with two or more issues, list up to four; with exactly one, list it plus a second choice for entering a different issue number; with none, follow [Phase 1](#phase-1-fetch-recent-open-issues)'s empty-result handling and do not call `AskUserQuestion`.
- Do NOT add an "Other" option — `AskUserQuestion` always provides a free-text "Other" automatically, and adding one is invalid. The auto-provided "Other" lets the user type any issue number, including issues beyond the four shown.

Resolve the selection to an issue identifier (a GitHub number or a Linear id):

- A listed issue choice — use its identifier.
- The enter-a-different-number choice (shown only in the single-issue case) or the auto-provided free-text "Other" — read the entered value, strip a leading `#`, and take the leading integer. If it is not a positive integer, re-prompt once; if it still fails, report the invalid input and stop.

Existence and open/closed state are not checked here — `autopilot:run` owns issue resolution, so a syntactically valid number is handed off as-is.

## Phase 3: Hand Off to Autopilot

Invoke `Skill(autopilot:run)` with the resolved identifier as its argument (a bare integer like `142`, or a Linear id like `ENG-123`). `autopilot:run` owns everything downstream — issue resolution, planning, branch creation, implementation, commit, PR, and monitoring. This skill makes no further changes after the hand-off.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
