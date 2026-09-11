---
name: gather-context
description: Resolve task intent, reuse validated evidence, and acquire missing planning context and emit a Context Map. Use when plan or run needs issue, standards, branch, and codebase context without loading raw documents into the parent conversation.
user-invocable: false
allowed-tools:
  - Read
  - Glob
  - Grep
  - Agent
  - Bash(git *)
  - Bash(node *)
  - Bash(command -v graphify)
  - Bash(graphify query *)
  - Bash(graphify path *)
  - Bash(graphify explain *)
  - Bash(graphify affected *)
  - Bash(graphify --help)
  - Bash(command -v entire)
  - Bash(entire *)
  - MCP(repomix:*)
---

Resolve the task once, then acquire independent context in parallel, and return the **Context Map**. Use bounded helper outputs; keep raw API responses and transcripts out of the parent context.

## Input

The invoking skill provides in the prompt:

- **Input type** — `github-issue`, `linear-issue`, `code-scanning-alert`, or `plain-description`. Already detected by the caller; this skill never re-detects.
- **Issue ID** — the GitHub number, Linear identifier, or alert number. Absent for `plain-description`.
- **Repository** (e.g., `awinogradov/code-assistants`) and **repository root** (absolute path).
- **Linear team** — for `linear-issue` only, the matched tracker's team.
- **Task summary** — user text supplementing the resolved issue title/body; use the resolved intent, never a bare ticket ID, to rank research.
- **Resolved issue** (optional) — same-invocation provider, repository/team, issue ID, URL, title, description, status, labels, comments, and completeness/errors. Reuse only after identity matches the requested target; mismatches are fatal. A transcript claim is not a resolved issue.
- **File seeds / durable evidence** (optional) — stored-plan files, step relationships, and source constraints. They narrow investigation, never prove current code or rule validity.
- **Validated brief** (optional) — explicit artifact accepted by the shared validator; required for primed scope.
- **Scope** — `task` (default), `broad` (explore), or `primed` (validated brief). `broad` skips session history and the branch digest; explore owns the volatile refresh. `primed` reuses verified stable claims and reads task-specific gaps, including uncovered standards.

## Phase 0: Resolve the task

When `Scope: primed`, read [brief-reuse.md](references/brief-reuse.md) before deciding what can be reused.

For issue input, validate and reuse `Resolved issue` or fetch the issue once using the provider helper below. If a same-invocation MCP result lacks a required field, fetch only that missing field through the same provider using the caller’s resolved tool binding, or return that specific gap to the caller if the tool is unavailable; do not require an API key after a successful MCP read. Preserve complete stored-plan text for parsing, but pass agents only the resolved intent, relevant acceptance criteria, and file seeds. For code-scanning alerts, resolve the alert before dependent research. Plain descriptions need no resolver.

Run independent setup alongside resolution: read stack configuration, collect the branch digest outside broad scope, and identify snapshot availability. Actual source selection follows the ordered graph-first contract after intent resolves; availability is not a selection. Graph queries, new task-scoped research, standards selection, and history wait for resolved intent. Failed target resolution stops dependent work.

## Phase 1: Fan out

Once intent is resolved, launch independent remaining calls in one message. Do not repeat setup or target resolution completed in Phase 0.

**Sub-agents** — pass repository root, resolved intent, and applicable file seeds to each, not the full transcript:

- [digest-repo-standards](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-repo-standards.md): pass resolved intent and file seeds. At `primed` scope follow [brief-reuse.md](references/brief-reuse.md): omit this agent only when the brief establishes complete, unchanged standards coverage for the task; otherwise request missing clauses only.
- [resolve-alert-context](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/resolve-alert-context.md): runs in Phase 0 for alerts, never again here.
- [digest-session-history](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-session-history.md): only when requested by the user or needed to answer a named regression/history/previous-decision question, scope is not `broad`, and Entire is enabled. Pass resolved intent, that question, and relevant file seeds; otherwise emit `none — not needed`.

**Direct calls** in the same message:

- **Snapshot** — follow [repomix-snapshot.md](../shared-rules/references/repomix-snapshot.md), without `includePatterns`. Retain its complete evidence record. Declare graphify only after a query **exited zero** and produced a usable shortlist; otherwise use its `superseding graphify` transition. Do not repeat that contract here or reacquire a source already selected by this context holder.
- **Stack** — Read `package.json` and extract `agents.rules`.
- **Branch digest** — except `Scope: broad`: one Bash call to the bundled helper, `node "${CLAUDE_PLUGIN_ROOT}/lib/git/digest-branch.ts"` (Node ≥ 24 or Bun; when `CLAUDE_PLUGIN_ROOT` is unset, build the absolute path from this skill's own base directory). It prints one bounded JSON object — `branch`, `isWorktree`, `commits[]`, `files[]`, `isStaleMerged`, `baseAhead`, `truncated`, `digestError`, `telemetry` — covering git state too, so no separate `git branch`/`git rev-parse` calls run. The full invocation and output contract live in [the helper's header](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/lib/git/digest-branch.ts). A failed `cherry`/`rev-list` read yields `isStaleMerged`/`baseAhead` as `null` — treat null as unknown, never as false/0.
- **Issue context** — Phase 0 only, and only without a matching resolved issue: one Bash call to the provider's bundled helper, in place of a delegated agent. GitHub: `node "${CLAUDE_PLUGIN_ROOT}/lib/github/fetch-issue.ts" <owner/repo> <issue-number>`, appending `--assign` exactly when the caller passes `Auto-assign current user: true` (contract in [the helper's header](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/lib/github/fetch-issue.ts)). Linear: `LINEAR_API_KEY="$LINEAR_API_KEY" node "${CLAUDE_PLUGIN_ROOT}/lib/linear/fetch-issue.mjs" <LINEAR-ID>`. Both print the provider-agnostic issue contract with `resolveError` naming any failure.
- **Related TODOs** — issue inputs only: one bounded Grep call by this skill (no sub-agent). Search the issue reference forms — for GitHub number `N` both `issues/N` and `#N`, for Linear id `ID` both `issue/ID` and the bare `ID` token — in content mode with `head_limit` ≤ 20, keeping each match as `path:line — text`.

**Broad scope:** skip the Entire settings read, history agent, and branch-digest helper. Read `git status --porcelain` and `git diff --name-only origin/main...HEAD` only to identify working-tree and branch paths the snapshot cannot show; these are context pointers, not a volatile-state digest. Emit `none — caller-owned volatile refresh` for In-flight changes and Git state, and `none — not requested` for Session history. Explore recomputes its volatile sections once after acquisition.

**Entire enabled:** only after a history trigger, read `.entire/settings.json`; run history only for `"enabled": true`. Report CLI/auth failures without retrying. At `primed` scope, validate standards coverage per brief-reuse; the branch digest still runs because Git state can change independently.

**Failure handling.** A resolver that returns `unresolved` with a non-null `resolveError` is fatal — surface the error and stop, so nothing proceeds against a misfetched target. A _digest_ failure is not fatal: record `digestError` in the map and continue, but unavailable required standards leave affected decisions open until the source is retrieved. Degraded context never authorizes ignoring a binding rule. A helper **process** failure — non-zero exit despite the exit-0 design, stdout that is not one JSON object, a missing Node runtime — maps to the same class as the field that helper feeds: fatal for the issue helper, degraded for the branch digest. Surface it either way; never silently re-run the work through a delegated agent.

**Standards overflow:** retain the digest's `overflow` counts and `digestError` in Applicable standards. Nonzero overflow is incomplete context, never “no applicable rules.” Before deciding work affected by omitted constraints, retrieve the named source or request a narrower standards digest, passing already captured clauses to avoid repeating them. Do not rerun the broad inventory. If the missing constraints remain unresolved, state that limit and leave the affected decision open. A broad explore brief records the incompleteness for its next consumer.

## Phase 2: Scope the codebase pass

Investigate using resolved intent and the selected source after the fan-out returns.

Use the selected source's read contract for implementations, patterns, and tests. Apply its refinement limits and fallback taxonomy; read changed or untracked paths directly only with a recorded reason. Fold any additional evidence into the map.

**At `broad` scope there is no change to narrow to**, so read the snapshot breadth-first instead: the principal modules and their boundaries, the entry points, and the conventions that govern them. Fill `Relevant files` and `Patterns to mirror` at that altitude — the modules a newcomer must know and the conventions they must copy, rather than the handful a specific edit would touch.

**With stored-plan file seeds**, start with those implementations and their step relationships, then inspect directly relevant dependencies, tests, and current standards. Do not re-derive unrelated architecture. Expand only for a named evidence gap and fold that evidence into the map.

**At `primed` scope the caller already holds the repository picture**, so read the snapshot only for the task-specific gaps that picture does not cover — the implementations and tests this particular change touches and the brief does not name. Do not re-derive architecture, key types, or test conventions; the caller merges those from its brief.

Bound composed summaries: at most 10 relevant files/patterns/types per section and 5 task-relevant comments, with source pointers and explicit omitted counts. Never cut conditions or exceptions; missing decision-relevant evidence requires focused retrieval before deciding. Broad coverage may link module indexes rather than enumerate every file.

Every other section keeps its meaning, and the emitted section list is identical at all three scopes, so a caller that omits `Scope` sees exactly today's behavior.

## Phase 3: Emit the Context Map

Emit these sections in this order. This is the caller's entire view of the repository, so an empty section says "nothing applied" and must be written as `none` rather than dropped.

```
### Context Map

**Issue / alert** — [identity, URL, title, status, relevant acceptance criteria and comments, completeness/errors; retain the full resolved payload separately for stored-plan parsing; "none" for plain-description]
**Related TODOs** — [each as `location` — `text`; "No related TODOs found" when total is 0]
**Relevant files** — [path — role in this change]
**Patterns to mirror** — [existing implementation — what to copy from it]
**Key types** — [interfaces, types, Zod schemas in play]
**Test conventions** — [how this area is tested; fixtures that apply]
**In-flight changes** — [broad: "none — caller-owned volatile refresh"; otherwise one-line summary this skill composes from the branch digest's commit subjects and file stats, and isStaleMerged / baseAhead when relevant]
**Session history** — [broad: "none — not requested"; otherwise from digest-session-history: commit/file → session/checkpoint links; "none" when Entire is unavailable or nothing matched]
**Applicable standards** — [actual conventions as source + rule, preserving conditions/exceptions; RFC id + status (mark "defaulted" when inferred) + applicable clauses; principles; dropped candidates, overflow counts, and digestError; "none" only when nothing applies]
**Stack** — [agents.rules value, and the deltas it resolves to]
**Git state** — [broad: "none — caller-owned volatile refresh"; otherwise from the branch digest: branch, isWorktree, isStaleMerged, baseAhead — null tri-states reported as unknown]
**Snapshot** — [the evidence record emitted in Phase 1, verbatim — the `context-source:` line for later phases to reuse, and on the graph tier the `graphify-trace:` line and the `graphify-shortlist:` bullets with the relationship justifying each]
```

At broad scope, retain the stable-section supporting file paths and discovery roots as acquisition proceeds, with explicit completeness. Attach them to Snapshot for explore’s dependency sidecar; do not re-read the repository just to reconstruct this record.

Preserve `isStaleMerged` and unknown/null Git states from the helper. At `primed` scope, name the brief supplying Applicable standards. Carry the Snapshot evidence record verbatim, including relationships on shortlist entries; never substitute a source label alone.

When you write the Context Map, apply the reference-formatting rules in [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001, read it first) to every reference it contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
