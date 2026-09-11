# Selective brief refresh

The sidecar `brief.sources.json` is optional for legacy readers and required for selective reuse. Write it alongside the brief after acquisition; never infer complete dependencies from a previous brief's prose.

Schema: `{ "version": 1, "base": "<full SHA>", "briefBlob": "<git hash-object of brief>", "sections": { "<stable heading>": { "complete": true, "files": [{ "path": "<repo-relative path>", "blob": "<git hash-object of file>" }], "roots": ["<repo-relative discovery directory>"] } } }`.

Every stable heading in the brief needs a section entry, even one whose prose says `none`. Record files actually used to support claims, plus the directory roots inventoried to discover them; roots detect new, deleted, and renamed sources that were not in the file list. `complete: false` means coverage was partial or overflow remains. Snapshot dependencies include source configuration, not a reusable session handle. Hashes bind evidence; they are not a claim that dependencies have been inferred automatically. Bind each hash to the content actually used to write the claim. If a snapshot differs from the current file, refresh that claim from the current source before recording its hash; never hash newer content to vouch for an older summary.

## Classify

1. Read the brief and sidecar. Missing or malformed metadata, unknown version, an unresolvable base, sidecar/base disagreement, a `briefBlob` mismatch, a missing stable-section entry, or incomplete dependencies selects full prime. Validate full hexadecimal SHAs and repo-relative paths before passing them as quoted arguments; use `--` before paths.
2. Use the caller’s freshly fetched `origin/main`; do not fetch again. Compare the recorded base with `origin/main` and `HEAD`, and collect staged, unstaged, and untracked paths. Exclude only derived `.repomix/`, changelogs, release notes, and LICENSES.md. Also compare each recorded source blob with current working-tree content: this catches edits later reverted or carried between branches. A failed read is unknown evidence, never an empty diff.
3. Full prime when history diverged, a changed path is outside every recorded discovery root, or structural inputs changed: root instructions, README/doc indexes, accepted standards/principles, package manifests/lockfiles, source/graph configuration, entry points, or module-boundary files identified by the prior Architecture map. Unknown structural impact also selects full prime.
4. Otherwise mark each section affected when a changed path matches its recorded file or lies under one of its discovery roots. A rename affects both old and new roots; missing supporting files invalidate their sections. Refresh these sections only, selecting a current source once through [repomix-snapshot.md](../../shared-rules/references/repomix-snapshot.md) and querying the named gaps. Never reuse the prior brief’s session-scoped source handle. With no affected sections, delta refresh.

A root may cover multiple sections; invalidate all of them. Prefer conservative invalidation over narrowing a root without evidence. A broad root can reduce selective-refresh savings, which is acceptable.

## Write

Compose refreshed sections from current evidence and preserve unaffected stable sections byte-identical. Always recompute volatile sections. Record `Base: <origin/main SHA>` plus current source blobs, section roots, and completeness; then compute the finished brief's `briefBlob` and write the sidecar. An interrupted pair of writes is detected by the binding mismatch and forces full prime next time.

Local changes participate in invalidation even when upstream is unchanged. Reusing this brief on another checkout must compare its recorded blobs with that checkout; a base SHA alone cannot vouch for local edits.
