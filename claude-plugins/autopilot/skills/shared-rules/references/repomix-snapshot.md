<!-- repomix-snapshot:start -->

### Codebase context: select one source, then read only it

Select exactly one source per context holder (session or delegated agent), in tier order. Reuse that selection for subsequent repository questions; do not run graph, pack, and tree discovery in parallel. Skip inaccessible tiers and record why:

```text
context-source: graphify | repomix <outputId> | default <reason>
```

An agent without graph or Repomix tools uses `context-source: default (no repomix MCP tools)`. Existing evidence from this holder remains valid until a recorded transition replaces it.

**Tier 1 — graphify knowledge graph.** Eligible only when `graphify-out/graph.json` exists and `command -v graphify` succeeds. Start with `graphify query "<question>"`; use `graphify path "<A>" "<B>"` or `graphify explain "<concept>"` for relationships. `includePatterns` does not apply. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture or when focused queries are insufficient.

<!-- graphify-readonly:start -->

**Tier 1 is read-only — the committed graph is immutable context.** The graph is a snapshot of the default branch and may lag behind the feature branch; Git and the working tree, not the graph, are the source of truth for the active diff, so prefer the branch diff over graph answers for any file the branch touches. The read-only surface — `graphify query`, `graphify path`, `graphify explain`, `graphify affected`, plus `command -v graphify` and `graphify --help` — is the **exhaustive** Graphify surface for agent work. Never run mutating subcommands — `update`, `extract`, `watch`, `cluster-only`, `label`, `save-result`, `reflect`, exports, hook or project installation — or otherwise write `graphify-out/**`, even when a repository's synced rules still instruct a graph refresh after code changes: this contract ships with the plugin and overrides stale synced rules until the sync catches up. A lagging graph is not a broken one; a missing, unreadable, or erroring graph is left behind through the transitions below — never regenerate. Where a repository regenerates its graph at all, a consumer-owned post-merge workflow does it, and an agent run never stands in for that workflow.

<!-- graphify-readonly:end -->

<!-- graphify-refinement:start -->

**Query discipline.** Scope the first query to the task's workspace, path, or domain. Classify the response:

- **focused:** usable, untruncated answer; build the shortlist.
- **truncated:** `[!] TRUNCATED` or equivalent notice; refine, never treat omitted results as absent.
- **empty:** no matching nodes; retry using a file or symbol name from the repository.
- **error:** non-zero exit or unreadable graph; transition immediately.

Refine a truncated or empty answer **before any context-gathering file read**: narrow the entity/path, use `--context <relation>`, or use `explain`, `path`, or `affected` when supported by `graphify --help`. Raising `--budget` is never the sole response to truncation.

Use at most three refinement queries after the first. Keep a shortlist of at most ten files/entities, each with its relationship to the task. Direct reads are limited to shortlisted entries; other context reads require `context-fallback:` below. Editing or verifying your own changes is not context gathering.

```text
graphify-trace: queries=<n> truncated=<yes|no> shortlist=<n> outside-reads=<n>
```

Count all graph invocations, whether any answer was truncated, shortlist entries, and recorded outside reads. `truncated=yes` with `queries=1` is a violation. If refinement ends without a usable shortlist, transition with `superseding graphify (refinement-exhausted)`.

<!-- graphify-refinement:end -->

<!-- graphify-evidence:start -->

**Selection evidence.** Availability is not evidence. Emit `context-source: graphify` only after at least one invocation **exited zero** and produced a usable answer, including any required refinement. Pass this complete record to consumers:

```text
context-source: graphify
graphify-trace: queries=2 truncated=yes shortlist=2 outside-reads=0
graphify-shortlist:
- src/app/AppShell.tsx — renders Sidebar, imports useLayout
- src/hooks/useLayout.ts — the hook AppShell depends on
```

Each bullet names a path/entity and its relationship. Missing trace, `queries=0`, or an empty shortlist is **not a selection**. Consumers use the shortlist before traversal; a label alone or paths without relationships are unrecorded context, not permission to rediscover silently.

**Transitions.** When leaving graphify, emit the successor's full selection:

```text
context-source: <successor> superseding graphify (<reason>)
```

`<successor>` is `repomix <outputId>` or `default <reason>`. The graph reason is exactly `unavailable` (missing graph or CLI), `error` (failed invocation/unreadable graph), or `refinement-exhausted` (no usable shortlist after refinement). A transition replaces the source; `context-fallback:` permits one outside read while the selection is still live.

<!-- graphify-evidence:end -->

**Tier 2 — repomix pack.** Attach the committed pack before considering a fresh pack:

- If `.repomix/pack.xml` exists, call `mcp__repomix__attach_packed_output` with its absolute `path`.
- If absent or attachment fails, fall back to `mcp__repomix__pack_codebase` with repository-root `directory` and `compress: true`. Pass `includePatterns` only when the caller supplied it; otherwise omit the key.
- Store `outputId`. Search with `mcp__repomix__grep_repomix_output` and read matched slices with `mcp__repomix__read_repomix_output`, specifying `startLine`/`endLine` — never a full-range read. Pack size is never a valid reason to fall back to tree reads.

**Tier 3 — default tools.** If graph and pack are unusable or inaccessible, use `Grep`/`Glob` and read matched files, plus Git through Bash. Record the reason in `context-source:`.

**Outside reads.** Any context read outside a selected source must carry one of these reasons beside the access:

```text
context-fallback: <reason> <path>
```

- `absent-or-excluded` — content missing from the source or excluded by its scope.
- `truncated-or-unreadable` — damaged source region or failed graph lookup.
- `stale-snapshot` — the snapshot predates a relevant base change.
- `byte-verification` — exact bytes or whitespace are required.
- `generated-or-untracked` — content a committed snapshot cannot contain.
- `post-snapshot-mutation` — branch/working-tree changes newer than the snapshot.

Without a matching reason, query the selected source. Outside reads remain targeted; never repeat broad discovery or delegate a second traversal of content the source already answers. Git and the working tree are authoritative for changed files.

<!-- repomix-snapshot:end -->
