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
  - Bash(command -v graphify)
  - Bash(graphify *)
  - Bash(command -v entire)
  - Bash(entire *)
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
- **Scope** — `task` (the default), `broad`, or `primed`, selecting how [Phase 2](#phase-2-scope-the-codebase-pass) reads the snapshot. Optional: `plan` and `run` omit it and get `task`. `primed` additionally gates off one [Phase 1](#phase-1-fan-out) agent, so this input is a fan-out selector and not only a read strategy — see [`run-primed`](../run-primed/SKILL.md), the only caller that passes it.

## Phase 1: Fan out

Issue **every** call below in a **single message** so they run concurrently. Do not stage them; do not wait on one before starting another.

**Sub-agents** (each returns a bounded JSON object — see the agent's own output schema):

| Agent                                                                                                                                          | When                       | Prompt                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`digest-repo-standards`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-repo-standards.md)   | Except `Scope: primed`     | `Repository root: [path]. Task summary: [summary].`                                                        |
| [`digest-branch-diff`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-branch-diff.md)         | Always                     | `Repository root: [path]. Base ref: origin/main.`                                                          |
| [`resolve-issue-context`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/resolve-issue-context.md)   | Issue inputs               | Per that agent's Input section; pass `Auto-assign current user: true` for GitHub only                      |
| [`resolve-alert-context`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/resolve-alert-context.md)   | `code-scanning-alert` only | `Fetch alert context. Alert number: [n]. Repository: [owner/repo].`                                        |
| [`search-codebase-todos`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/search-codebase-todos.md)   | Issue inputs               | `Search for TODOs. Input type: [type]. Issue ID: [id].`                                                    |
| [`digest-session-history`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-session-history.md) | Entire enabled (see below) | `Repository root: [path]. Task summary: [summary]. Relevant files: [paths the task text names, when any].` |

**Direct calls** in the same message:

- **Snapshot** — follow the ordered source chain in [`repomix-snapshot.md`](../shared-rules/references/repomix-snapshot.md); this skill passes no `includePatterns`. Record the selected source, and the returned `outputId` when the repomix tier was selected.
- **Stack** — Read `package.json` and extract `agents.rules`.
- **Git state** — `git branch --show-current`, `git rev-parse --git-dir`, and `git rev-parse --git-common-dir` (the last two differ inside a worktree).

**Entire enabled** means `.entire/settings.json` at the repository root exists and carries `"enabled": true` — check it with the Read tool before the fan-out, so repositories without [Entire](https://docs.entire.io/overview) never pay the agent spawn. The agent re-verifies the CLI itself and degrades to a `digestError` result on missing binary or auth; like every digest, that failure is recorded, never fatal.

`digest-repo-standards` is the one agent `Scope: primed` skips: that caller holds a validated brief whose conventions came from this same digest on this same revision, so re-running it is duplicate cost rather than fresh information. `digest-branch-diff` still runs at every scope — `isStaleMerged` and `baseAhead` describe the checkout in front of you, which a brief written elsewhere cannot know.

**Failure handling.** A resolver that returns `unresolved` with a non-null `resolveError` is fatal — surface the error and stop, so nothing proceeds against a misfetched target. A _digest_ failure is not fatal: record `digestError` in the map and continue, because a plan without a standards digest is degraded, not wrong.

## Phase 2: Scope the codebase pass

Only now is the task's subject matter known, so this pass runs after the fan-out returns.

Search the snapshot for the implementations, patterns, and tests the change touches, using the read contract of the selected source — `graphify` queries when the graph tier was selected, `mcp__repomix__grep_repomix_output` with ranged `mcp__repomix__read_repomix_output` when the repomix tier was, or `Grep`/`Glob`/`Read` directly when only default tools remain. A graph or pack reflects the base at its last refresh, so reach for live Grep/Glob/Read **only** for working-tree code it cannot show — `digest-branch-diff` already reports what is in flight. Do not crawl the tree for anything the selected source answers.

**At `broad` scope there is no change to narrow to**, so read the snapshot breadth-first instead: the principal modules and their boundaries, the entry points, and the conventions that govern them. Fill `Relevant files` and `Patterns to mirror` at that altitude — the modules a newcomer must know and the conventions they must copy, rather than the handful a specific edit would touch.

**At `primed` scope the caller already holds the repository picture**, so read the snapshot only for the task-specific gaps that picture does not cover — the implementations and tests this particular change touches and the brief does not name. Do not re-derive architecture, key types, or test conventions; the caller merges those from its brief.

Every other section keeps its meaning, and the emitted section list is identical at all three scopes, so a caller that omits `Scope` sees exactly today's behavior.

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
**Session history** — [from digest-session-history: commit/file → session/checkpoint links; "none" when Entire is unavailable or nothing matched]
**Applicable standards** — [id + status (mark "defaulted" when inferred) + one line on why the plan must honor it; then dropped candidates; "none" when nothing matched]
**Stack** — [agents.rules value, and the deltas it resolves to]
**Git state** — [branch, isWorktree, isStaleMerged, baseAhead]
**Snapshot** — [selected source: graphify graph | repomix outputId | live tools — for later phases to reuse]
```

Two fields carry decisions the caller would otherwise recompute badly:

- **`isStaleMerged`** — a branch whose commits already landed upstream under rewritten SHAs still shows a non-empty `git log origin/main..HEAD`. A caller testing only for emptiness reads a finished branch as active work. Trust this field over a commit count.
- **Applicable standards** — this doubles as the plan's audit log of what it planned against, including what the selection cap dropped. At `Scope: primed` the digest did not run, so write it as supplied by the caller's validated brief and name that brief — never leave it reading `none`, which would claim no standard applied rather than that one was sourced elsewhere.

When you write the Context Map, apply the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001, read it first) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
