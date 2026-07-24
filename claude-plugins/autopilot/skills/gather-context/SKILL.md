---
name: gather-context
description: Acquire all planning context in one parallel fan-out and emit a Context Map. Use when plan or run needs issue, standards, branch, and codebase context without loading raw documents into the parent conversation.
user-invocable: false
allowed-tools:
  - Read
  - Glob
  - Grep
  - Agent
  - Bash(git *)
  - MCP(repomix:*)
---

Acquire every piece of context a planning pass needs, in one parallel fan-out, and return a single **Context Map**. The caller reads the map and nothing else.

Two properties make this skill worth its own seam:

- **One fan-out.** Input _detection_ is pure string matching and performs no I/O, so the issue id is known before anything is fetched. Input _resolution_ is what costs time, and it parallelizes with standards, branch, and snapshot acquisition. There is no reason to stage these.
- **Digests, not documents.** Each sub-agent returns a bounded JSON object. The full text of a README, three RFCs, and an unbounded branch diff never reaches the caller's context.

## Input

The invoking skill provides in the prompt:

- **Input type** — `github-issue`, `linear-issue`, `code-scanning-alert`, or `plain-description`. Already detected by the caller; this skill never re-detects.
- **Issue ID** — the GitHub number, Linear identifier, or alert number. Absent for `plain-description`.
- **Repository** (e.g., `awinogradov/code-assistants`) and **repository root** (absolute path).
- **Linear team** — for `linear-issue` only, the matched tracker's team.
- **Task summary** — the raw task text, used to rank standards and scope the codebase pass.

## Phase 1: Fan out

Issue **every** call below in a **single message** so they run concurrently. Do not stage them; do not wait on one before starting another.

**Sub-agents** (each returns a bounded JSON object — see the agent's own output schema):

| Agent                                                            | When                       | Prompt                                                                                |
| ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| [`digest-repo-standards`](../../agents/digest-repo-standards.md) | Always                     | `Repository root: [path]. Task summary: [summary].`                                   |
| [`digest-branch-diff`](../../agents/digest-branch-diff.md)       | Always                     | `Repository root: [path]. Base ref: origin/main.`                                     |
| [`resolve-issue-context`](../../agents/resolve-issue-context.md) | Issue inputs               | Per that agent's Input section; pass `Auto-assign current user: true` for GitHub only |
| [`resolve-alert-context`](../../agents/resolve-alert-context.md) | `code-scanning-alert` only | `Fetch alert context. Alert number: [n]. Repository: [owner/repo].`                   |
| [`search-codebase-todos`](../../agents/search-codebase-todos.md) | Issue inputs               | `Search for TODOs. Input type: [type]. Issue ID: [id].`                               |

**Direct calls** in the same message:

- **Snapshot** — when `.repomix/pack.xml` exists at the repository root, `mcp__repomix__attach_packed_output` with that path; otherwise `mcp__repomix__pack_codebase` with `compress: true`. Store the returned `outputId`.
- **Stack** — Read `package.json` and extract `agents.rules`.
- **Git state** — `git branch --show-current`, `git rev-parse --git-dir`, and `git rev-parse --git-common-dir` (the last two differ inside a worktree).

**Failure handling.** A resolver that returns `unresolved` with a non-null `resolveError` is fatal — surface the error and stop, so nothing proceeds against a misfetched target. A _digest_ failure is not fatal: record `digestError` in the map and continue, because a plan without a standards digest is degraded, not wrong.

## Phase 2: Scope the codebase pass

Only now is the task's subject matter known, so this pass runs after the fan-out returns.

Search the snapshot with `mcp__repomix__grep_repomix_output` for the implementations, patterns, and tests the change touches, reading specific ranges via `mcp__repomix__read_repomix_output`. The snapshot reflects the base at its last refresh, so reach for live Grep/Glob/Read **only** for working-tree code the snapshot cannot show — `digest-branch-diff` already reports what is in flight. Do not crawl the tree for anything the snapshot answers.

## Phase 3: Emit the Context Map

Emit these sections in this order. This is the caller's entire view of the repository, so an empty section says "nothing applied" and must be written as `none` rather than dropped.

```
### Context Map

**Issue / alert** — [source, title, status, labels, assignee when non-null, description, comments; "none" for plain-description]
**Related TODOs** — [each as `location` — `text`; "No related TODOs found" when total is 0]
**Relevant files** — [path — role in this change]
**Patterns to mirror** — [existing implementation — what to copy from it]
**Key types** — [interfaces, types, Zod schemas in play]
**Test conventions** — [how this area is tested; fixtures that apply]
**In-flight changes** — [from digest-branch-diff: summary, and isStaleMerged / baseAhead when relevant]
**Applicable standards** — [id + status (mark "defaulted" when inferred) + one line on why the plan must honor it; then dropped candidates; "none" when nothing matched]
**Stack** — [agents.rules value, and the deltas it resolves to]
**Git state** — [branch, isWorktree, isStaleMerged, baseAhead]
**Snapshot** — [outputId, for later phases to reuse]
```

Two fields carry decisions the caller would otherwise recompute badly:

- **`isStaleMerged`** — a branch whose commits already landed upstream under rewritten SHAs still shows a non-empty `git log origin/main..HEAD`. A caller testing only for emptiness reads a finished branch as active work. Trust this field over a commit count.
- **Applicable standards** — this doubles as the plan's audit log of what it planned against, including what the selection cap dropped.

When you write the Context Map, apply the reference-formatting rules inlined at the end of this skill (the **Reference formatting & readability** block below, RFC-0001) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

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
