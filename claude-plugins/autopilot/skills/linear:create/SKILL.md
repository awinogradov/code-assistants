---
name: linear:create
description: Create a Linear issue with a structured body (Context, What, Why, Scope, Solution) and wizard-selected status, label, and assignee via the Linear MCP. Use when filing a Linear ticket on a linear-tracked project.
argument-hint: "[title hint or short description]"
allowed-tools:
  - Bash(git *)
  - Read
  - Grep
  - Glob
  - MCP(linear:*)
  - MCP(repomix:*)
  - MCP(context7:*)
  - MCP(Ref:*)
  - MCP(exa:*)
  - MCP(perplexity:*)
  - Agent
  - AskUserQuestion
  - Skill(autopilot:ascii-schemas)
---

# Create Linear Issue

Create a Linear issue with a structured five-section body (Context, What, Why, Scope, Solution) and wizard-selected status, label, and assignee. This is the Linear counterpart to `issue:create` (which files GitHub issues): use it on a project that lists a `linear` tracker in `package.json` `agents.trackers`. The body uses the same fixed five-section structure as `issue:create`; the Linear-specific metadata (status, labels, assignee) is chosen through a short wizard.

## When to Use

- Filing a new Linear ticket on a linear-tracked project
- When invoked from other skills that need to open a Linear issue

## Input

Arguments: `$ARGUMENTS`

Expected form:

- `[title hint or short description]` — optional free-form hint that seeds the title and body (e.g., `"users cannot reset password via email"`).

## Input resolution

- **Title hint** — `$ARGUMENTS` → if empty, prompt once via AskUserQuestion: "What is this issue about?" with a free-form slot. Do not abort silently.
- **Linear team** — collect every `linear` entry of `agents.trackers` in the repo-root `package.json` (via the Read tool) and resolve a single target `team` in [Phase 0](#phase-0-resolve-team-and-hint). REQUIRED. If no `linear` tracker is configured, stop and tell the user to file a GitHub issue with `/autopilot:issue-create` instead.
- **Repo label** — the chosen `linear` entry's optional `label`, pre-selected in [Phase 4](#phase-4-select-labels).

## Completion Requirement

This workflow is not complete until [Phase 7](#phase-7-create-issue) calls `mcp__plugin_autopilot_linear__save_issue` and outputs the created issue identifier and URL. Generating a title, body, or wizard selections does not constitute completion.

## Phase 0: Resolve Team and Hint

1. Parse `$ARGUMENTS` as an optional title hint; if empty, prompt once via AskUserQuestion.
2. Read `package.json` and collect **all** `linear` entries from `agents.trackers`, then resolve a single target `team`:
   - **None** ⇒ stop: `This project is not Linear-tracked. Use /autopilot:issue-create for a GitHub issue.`
   - **Exactly one** ⇒ use its `team` (and `label`) — no prompt.
   - **Two or more** ⇒ ask the user which team to file on via AskUserQuestion (single-select): one option per `linear` entry, `{ label: "<team>", description: "<comma-joined keys, or 'no keys'>" }`. Bind the chosen entry's `team` and optional `label` for the rest of the wizard.

## Phase 1: Gather Context

Mirror `issue:create` so the body reflects real code, not hallucinated structure. Unlike `issue:create`, this skill deliberately omits related-issue/PR detection and the duplicate-warning check — Linear search is not wired through the MCP here, so surfacing related work is out of scope.

1. Acquire the codebase snapshot once (prefer the committed pack): if `.repomix/pack.xml` exists at the repository root, call `mcp__repomix__attach_packed_output` with its path; otherwise `mcp__repomix__pack_codebase` with `compress: true`. Store the `outputId`.
2. `mcp__repomix__grep_repomix_output` for files/symbols related to the hint, then `mcp__repomix__read_repomix_output` for the matched sections only.
3. Collect git context (`git log -20 --oneline`, `git status --short`).
4. **External documentation (best-effort):** for any library/framework named in the hint, consult context7/Ref/exa/perplexity. On error or empty result, continue — never block creation on MCP availability.

## Phase 2: Generate Title and Body

**Title:** capitalized, ≤ 80 characters, no trailing period, business-focused, NOT Conventional Commits, no prefix.

**Body — section ordering is MANDATORY** (exact `## ` headings, no trailing colon, no bold). The five-section spec is canonical in [issue:create Phase 5](../issue:create/SKILL.md#phase-5-generate-body) — keep this list in sync with it:

1. `## Context` — 1-2 paragraphs on the situation and why it matters now.
2. `## What` — the deliverable in plain terms.
3. `## Why` — user impact / business motivation.
4. `## Scope` — a bullet list with `**In scope:**` and `**Out of scope:**` sub-headings.
5. `## Solution` — the high-level approach. Invoke `Skill(autopilot:ascii-schemas)` for a diagram when the Solution describes a flow between ≥ 2 components; embed it verbatim in a fenced ` ```text ` block.

## Phase 3: Select Status

Fetch the team's workflow states and let the user choose (default to the team's initial state — e.g. `Triage` or `Todo`):

```
mcp__plugin_autopilot_linear__list_issue_statuses  with { "team": "<team>" }
```

Present the states via AskUserQuestion (single-select).

## Phase 4: Select Labels

Fetch the team's labels; pre-select the `label` from `agents.trackers` (when present):

```
mcp__plugin_autopilot_linear__list_issue_labels  with { "team": "<team>" }
```

Present via AskUserQuestion (multi-select). Only labels returned by the call may be selected — never invent a label.

## Phase 5: Resolve Assignee

Launch the `resolve-assignees` agent to gather candidates (CODEOWNERS + Linear team members):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:resolve-assignees"
- `prompt`: "Resolve assignee candidates. Repository: [owner/repo]. Linear team: [team]."
- `description`: "Resolve assignees"
```

Present the candidates via AskUserQuestion, including a `Leave unassigned` option. Assignment is best-effort — if the agent returns no candidates, default to unassigned.

## Phase 6: Verify with User

Present the full issue via AskUserQuestion with a `preview` carrying the title, the five-section body, and a metadata line `Team: <team> · Status: <status> · Labels: <labels> · Assignee: <assignee or unassigned>`. Options: `Create issue` / `Edit content` / `Cancel`, all sharing the same preview. Only proceed to [Phase 7](#phase-7-create-issue) after `Create issue`.

## Phase 7: Create Issue

This phase is mandatory. Create the ticket:

```
mcp__plugin_autopilot_linear__save_issue  with {
  "title": "<title>",
  "team": "<team>",
  "description": "<five-section body>",
  "state": "<selected status>",
  "labels": ["<selected labels>"],
  "assignee": "<selected assignee, omit when unassigned>"
}
```

Output the result:

```
✓ Created Linear issue: <identifier> — <url>
```

When you generate the issue body, apply the reference-formatting rules inlined at the end of this skill (the **Reference formatting & readability** block below, RFC-0001) to every reference it contains — link files, docs, skills, and agents as absolute `<repo-blob-url>` URLs, and never leave a reference as bare text.

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
