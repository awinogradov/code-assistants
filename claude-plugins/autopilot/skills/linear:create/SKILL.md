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
  - ToolSearch
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

This workflow is not complete until [Phase 7](#phase-7-create-issue) calls the Linear MCP `save_issue` tool and outputs the created issue identifier and URL. Generating a title, body, or wizard selections does not constitute completion.

<!-- Canonical Linear MCP access note. The same paragraph in branch:create, issue:run, and todo-cleanup SKILL.md mirrors this one (only the tool list varies) — keep the four in sync. -->

**Linear MCP access:** Linear operations here use the session's connected Linear MCP server, matching tools by name — the suffix after the final `__` (`save_issue`, `list_issue_statuses`, `list_issue_labels`) — under whatever server prefix the session exposes: the bundled `mcp__plugin_autopilot_linear__*` or a user-configured Linear server such as `mcp__linear-server__*` (Claude Code connects one server per endpoint; a user-scope server shadows the bundled one). The prefix must identify a Linear server (a `linear` server name or the `mcp.linear.app` endpoint) — never bind a generic tool name like `get_issue` to a non-Linear MCP. If a tool is not visible, search for it with ToolSearch by bare tool name before concluding it is absent. Only when no Linear MCP tool resolves under any prefix, stop and tell the user: `No Linear MCP available — check /mcp for a disconnected or unauthenticated Linear server, or connect one: claude mcp add --transport http linear https://mcp.linear.app/mcp`.

## Phase 0: Resolve Team and Hint

1. Parse `$ARGUMENTS` as an optional title hint; if empty, prompt once via AskUserQuestion. Retain the resolved hint **verbatim** (the raw `$ARGUMENTS`, or the user's exact AskUserQuestion answer — unmodified, un-paraphrased) as the original prompt; [Phase 2](#phase-2-generate-title-and-body) emits it as a collapsed preamble at the top of the body.
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

**Body — section ordering is MANDATORY** (exact `## ` headings, no trailing colon, no bold). The five-section spec is canonical in [issue:create Phase 5](../issue:create/SKILL.md#phase-5-generate-body) — keep this list in sync with it. Each section has one non-overlapping job and must not repeat what another covers; length follows the content, with no fixed paragraph cap:

1. `## Context` — the situation and background only: state of the world and what surfaced it now (not impact — that's Why; not the fix — that's Solution).
2. `## What` — the deliverable / observable end state (not the how).
3. `## Why` — user impact and motivation only; assumes Context, never restates it.
4. `## Scope` — a bullet list with `**In scope:**` and `**Out of scope:**` sub-headings that reference What rather than re-describe it.
5. `## Solution` — the high-level approach (how), not a restatement of the deliverable. Invoke `Skill(autopilot:ascii-schemas)` for a diagram whenever one would aid understanding — a flow, sequence, architecture, data schema, UI layout, comparison, or logical relationship; embed it verbatim in a fenced ` ```text ` block.

After drafting, run the linkability pass from [issue:create Phase 5](../issue:create/SKILL.md#phase-5-generate-body) — every prose mention of a file or path that exists in the repo becomes an absolute `<repo-blob-url>` link, and every cited external source whose URL is in context becomes an inline `[title](url)` link; never invent a URL for an unlinkable mention.

**Original-prompt preamble (prepend last).** After the linkability pass, prepend the user's original prompt — the title hint resolved verbatim in [Phase 0](#phase-0-resolve-team-and-hint) — to the top of the body as a collapsed section, so the ticket records exactly what was asked, not only its structured interpretation. Use Linear's GraphQL collapsible fence (`+++ Section title` to open, `+++` to close), documented in the [Linear API docs](https://linear.app/developers/graphql); its content renders initially hidden. Do NOT use `<details>` HTML — Linear does not render it. Emit the block above `## Context`:

```text
+++ Original prompt

<the Phase 0 hint, verbatim>

+++
```

then a blank line, then the five-section body. This preamble is a permitted metadata block **above** `## Context`; it is not one of the five sections, so it does not change the mandatory section order. Prepend it **after** the linkability pass and treat the fence content as opaque — like a code specimen, the user's text inside it is never link-transformed or reworded.

Because the hint is reproduced verbatim (unlike the five sections, which paraphrase the input), any secret or PII pasted into it lands unfiltered in the ticket. Do not put credentials, tokens, or personal data in the hint; the [Phase 6](#phase-6-verify-with-user) preview is the checkpoint to catch and remove any that slipped in before the ticket is created.

## Phase 3: Select Status

Fetch the team's workflow states and let the user choose (default to the team's initial state — e.g. `Triage` or `Todo`):

```
Linear MCP list_issue_statuses  with { "team": "<team>" }
```

Present the states via AskUserQuestion (single-select).

## Phase 4: Select Labels

Fetch the team's labels; pre-select the `label` from `agents.trackers` (when present):

```
Linear MCP list_issue_labels  with { "team": "<team>" }
```

Present via AskUserQuestion (multi-select). Only labels returned by the call may be selected — never invent a label.

## Phase 5: Resolve Assignee

Launch the `resolve-assignees` agent to gather candidates — CODEOWNERS plus the Linear team's members, with the current Linear user resolved and returned first (flagged `self`):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:resolve-assignees"
- `prompt`: "Resolve assignee candidates. Repository: [owner/repo]. Linear team: [team]."
- `description`: "Resolve assignees"
```

Present the returned candidates via AskUserQuestion (single-select), preserving the agent's order, with a `Leave unassigned` option last. The `self` candidate (the current user) is already first — render it as the first option, label it `<name> (you)`, and append `(Recommended)` so self-assign is the obvious default. Assignment is best-effort — if the agent returns no candidates, default to unassigned.

## Phase 6: Verify with User

Present the full issue via AskUserQuestion with a `preview` carrying the title, the collapsible original-prompt preamble followed by the five-section body, and a metadata line `Team: <team> · Status: <status> · Labels: <labels> · Assignee: <assignee or unassigned>`. Options: `Create issue` / `Edit content` / `Cancel`, all sharing the same preview. Only proceed to [Phase 7](#phase-7-create-issue) after `Create issue`.

## Phase 7: Create Issue

This phase is mandatory. Create the ticket. The `description` is the full body assembled in [Phase 2](#phase-2-generate-title-and-body) — the collapsible original-prompt preamble followed by the five-section body — so the created ticket carries the preamble, not only its [Phase 6](#phase-6-verify-with-user) preview:

```
Linear MCP save_issue  with {
  "title": "<title>",
  "team": "<team>",
  "description": "<original-prompt preamble + five-section body>",
  "state": "<selected status>",
  "labels": ["<selected labels>"],
  "assignee": "<selected assignee, omit when unassigned>"
}
```

Output the result:

```
✓ Created Linear issue: <identifier> — <url>
```

When you generate the issue body, apply the reference-formatting rules inlined at the end of this skill (the **Reference formatting & readability** block below, RFC-0001) to every reference it contains — link files, docs, skills, agents, sections, and commit SHAs as absolute `<repo-blob-url>` URLs (the body is posted outside the repo, where relative paths do not resolve), link cited external resources to their canonical source URL, and never leave a reference as bare text.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as `[title](url)` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
