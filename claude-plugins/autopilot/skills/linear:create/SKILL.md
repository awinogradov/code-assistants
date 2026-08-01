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

**Linear MCP access:** Read [`linear-mcp-access.md`](../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool names `save_issue`, `list_issue_statuses`, `list_issue_labels`.

## Phase 0: Resolve Team and Hint

1. Parse `$ARGUMENTS` as an optional title hint; if empty, prompt once via AskUserQuestion. Retain the resolved hint **verbatim** (the raw `$ARGUMENTS`, or the user's exact AskUserQuestion answer — unmodified, un-paraphrased) as the original prompt; [Phase 2](#phase-2-generate-title-and-body) emits it as a collapsed preamble at the top of the body.
2. Read `package.json` and collect **all** `linear` entries from `agents.trackers`, then resolve a single target `team`:
   - **None** ⇒ stop: `This project is not Linear-tracked. Use /autopilot:issue-create for a GitHub issue.`
   - **Exactly one** ⇒ use its `team` (and `label`) — no prompt.
   - **Two or more** ⇒ ask the user which team to file on via AskUserQuestion (single-select): one option per `linear` entry, `{ label: "<team>", description: "<comma-joined keys, or 'no keys'>" }`. Bind the chosen entry's `team` and optional `label` for the rest of the wizard.

## Phase 1: Gather Context

Mirror `issue:create` so the body reflects real code, not hallucinated structure. Unlike `issue:create`, this skill deliberately omits related-issue/PR detection and the duplicate-warning check — Linear search is not wired through the MCP here, so surfacing related work is out of scope.

1. Acquire the codebase snapshot once by following [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md); this skill passes no `includePatterns`. Store the `outputId`.
2. `mcp__repomix__grep_repomix_output` for files/symbols related to the hint, then `mcp__repomix__read_repomix_output` for the matched sections only.
3. Collect git context (`git log -20 --oneline`, `git status --short`).
4. **External documentation (best-effort):** for any library/framework named in the hint, consult context7/Ref/exa/perplexity. On error or empty result, continue — never block creation on MCP availability.

## Phase 2: Generate Title and Body

**Title:** capitalized, ≤ 80 characters, no trailing period, business-focused, NOT Conventional Commits, no prefix.

**Body:** read [`issue-body-grammar.md`](../shared-rules/references/issue-body-grammar.md) and apply it — the five-section structure, the per-section rules, and the linkability pass that runs after drafting. Links must use the absolute `<repo-blob-url>` form because the body is posted outside the repo, where relative paths do not resolve.

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

When you generate the issue body, apply the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001, read it first) to every reference it contains — link files, docs, skills, agents, sections, and commit SHAs as absolute `<repo-blob-url>` URLs (the body is posted outside the repo, where relative paths do not resolve), link cited external resources to their canonical source URL, and never leave a reference as bare text.
