<!-- repomix-snapshot:start -->

### Acquire codebase snapshot

Prefer the committed pack over re-packing — the refresh is merge-triggered, so the pack is current for anything already on the default branch.

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

Store the returned `outputId`; search the snapshot with `mcp__repomix__grep_repomix_output` and read matched regions with `mcp__repomix__read_repomix_output` using `startLine`/`endLine`. Do not read the full pack.

**`includePatterns` is caller-supplied.** The fall-back pack is scoped only when the invoking skill names a pattern — the review and reply skills pass `".claude/**, **.md, **.yml, .github/**"` because they reason over configuration and prose rather than application code. A skill that needs the whole tree omits the key.

<!-- repomix-snapshot:end -->
