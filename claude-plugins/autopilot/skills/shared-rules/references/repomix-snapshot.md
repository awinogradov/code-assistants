<!-- repomix-snapshot:start -->

### Codebase context: select one source, then read only it

Codebase context comes from an ordered source chain. Check the tiers top-down and select the first one that works; any failure inside a tier falls through to the next rather than aborting.

Selection is **exclusive and per context holder**: the session and each delegated agent select for themselves, and each holder selects exactly one source, records the selection once, and serves every repository-content question from that source for the rest of its run. Running the tiers side by side — graph queries plus pack reads plus tree crawling in one holder — is the duplication this contract exists to prevent, whichever tier was selected. Record the selection as a single trace line when the source is chosen:

```
context-source: graphify | repomix <outputId> | default <reason>
```

A holder whose toolset cannot reach a tier selects the highest tier it can actually use and records why — an agent with only `Read`/`Glob` has no repomix MCP tools, so it selects `context-source: default (no repomix MCP tools)` and that selection is legitimate, not a fallback.

**Tier 1 — graphify knowledge graph.** Fires when the consuming repository carries a committed graph: `graphify-out/graph.json` exists at the repository root AND the `graphify` CLI resolves on PATH (`command -v graphify`). For natural-language codebase questions, query the graph first — no LLM, no network:

```
graphify query "<plain-language question>"
graphify path "<EntityA>" "<EntityB>"
graphify explain "<Concept>"
```

Graph queries are whole-repo by nature; the caller's `includePatterns` does not apply to this tier. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when targeted queries do not surface enough context.

**Tier 2 — repomix pack.** Prefer the committed pack over re-packing — the refresh is merge-triggered, so the pack is current for anything already on the default branch.

```
Acquire codebase snapshot (prefer the committed pack to avoid re-packing):
  Check whether `.repomix/pack.xml` exists at the repository root.
  - If it exists, call `mcp__repomix__attach_packed_output` with:
    - `path`: [repository root absolute path]/.repomix/pack.xml
  - If it is absent (or the attach fails), fall back to `mcp__repomix__pack_codebase` with:
    - `directory`: [repository root absolute path]
    - `compress`: true
    - `includePatterns`: [only when the invoking skill specifies one — omit the key entirely otherwise]
```

**`includePatterns` is caller-supplied and tier-2-only.** The fall-back pack is scoped only when the invoking skill names a pattern — the review and reply skills pass `".claude/**, **.md, **.yml, .github/**"` because they reason over configuration and prose rather than application code. A skill that needs the whole tree omits the key.

**Tier 3 — default tools.** With neither a graph nor a working repomix path, use plain `Grep`/`Glob`/`Read` on the repository plus `git` via Bash. This tier is the single last resort for every consumer — a skill does not define its own fallback.

**Per-tier read contract.** What "search and read the snapshot" means downstream depends on the selected source:

- Tier 1 returns no `outputId` — answer codebase questions with further `graphify` queries and targeted `Read` of the files the graph names.
- Tier 2 — store the returned `outputId`; search the snapshot with `mcp__repomix__grep_repomix_output` and read matched regions with `mcp__repomix__read_repomix_output` using `startLine`/`endLine`. Do not read the full pack.
- Tier 3 — search with `Grep`/`Glob` and read only the matched files.

**Bounded operations on an oversized pack.** Pack size is never a valid reason to fall back to direct reads: serve an oversized pack through `mcp__repomix__grep_repomix_output` (regex plus context lines) and `mcp__repomix__read_repomix_output` with explicit `startLine`/`endLine` slices — never a full-range read, and never a switch to tree crawling because the pack is large.

**Fallback taxonomy — reading outside the selected source.** After selection, a direct `Read`/`Grep`/`Glob` of repository content the selected source should answer is permitted only for a recorded reason, emitted as one line beside the access:

```
context-fallback: <reason> <path>
```

with `<reason>` exactly one of:

- `absent-or-excluded` — the content is not in the selected source (not packed, or excluded by `includePatterns`).
- `truncated-or-unreadable` — the source is damaged where this content lives: a truncated or unreadable pack region, or a graph query that errors.
- `stale-snapshot` — the snapshot predates a base-branch change this task depends on.
- `byte-verification` — exact byte-level content is required (hashes, whitespace-sensitive edits) that a snapshot cannot guarantee.
- `generated-or-untracked` — generated or untracked content a committed snapshot never contains.
- `post-snapshot-mutation` — working-tree changes made after the snapshot, including this session's own edits; the branch diff already reports what is in flight, so this stays a targeted read, never re-exploration.

A read with no reason from this list does not happen — re-ask the selected source instead. Broad rediscovery after selection (repository-wide `Read`/`Grep`/`Glob` sweeps, or delegating a context agent to re-cover content the selected source already answers) is never valid.

<!-- repomix-snapshot:end -->
