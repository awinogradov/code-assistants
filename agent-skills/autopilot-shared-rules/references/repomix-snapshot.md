<!-- repomix-snapshot:start -->

### Acquire codebase context

Codebase context comes from an ordered source chain. Check the tiers top-down and use the first one that works; any failure inside a tier falls through to the next rather than aborting.

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

**Per-tier read contract.** Record which tier was selected; what "search and read the snapshot" means downstream depends on it:

- Tier 1 returns no `outputId` — answer codebase questions with further `graphify` queries and targeted `Read` of the files the graph names.
- Tier 2 — store the returned `outputId`; search the snapshot with `mcp__repomix__grep_repomix_output` and read matched regions with `mcp__repomix__read_repomix_output` using `startLine`/`endLine`. Do not read the full pack.
- Tier 3 — search with `Grep`/`Glob` and read only the matched files.

<!-- repomix-snapshot:end -->
