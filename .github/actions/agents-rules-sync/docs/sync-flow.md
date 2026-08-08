# Sync flow

End-to-end data flow for [`agents-rules-sync`](../README.md), including how it composes with [`files-sync`](../../files-sync/README.md) to publish `AGENTS.md` and its `CLAUDE.md` symlink.

## Diagram

```
┌───────────────────────┐  ① reads pkg   ┌──────────────────────────────┐
│ Consumer repo         │───────────────▶│ Action: agents-rules-sync    │
│ package.json          │                │ resolve step (Bun)           │
│ { agents.rules: Bun } │                │                              │
└───────────────────────┘                └──────────────┬───────────────┘
                                                        │ ② emit YAML
                                                        ▼
                                  ┌──────────────────────────────────┐
                                  │ files YAML payload (2 entries)   │
                                  │ - repo: awinogradov/...           │
                                  │   source: rules/Bun.md           │
                                  │   dest: AGENTS.md                │
                                  │ - symlink: AGENTS.md             │
                                  │   dest: CLAUDE.md                │
                                  └──────────────┬───────────────────┘
                                                 │ ③ stringifyYaml
                                                 ▼
                            ┌────────────────────────────────────────┐
                            │ Action: files-sync                     │
                            │ parseFilesInput  z.union<content|sym>  │
                            └──────────────────┬─────────────────────┘
                                               │ ④ per-entry detect
                  ┌────────────────────────────┴────────────────────────────┐
                  ▼                                                         ▼
       ┌──────────────────────────┐                    ┌──────────────────────────────┐
       │ content entry            │                    │ symlink entry                │
       │ fetchRawContent(src)     │                    │ fetchTreeEntries(dest@ref)   │
       │ fetchRawContent(dest)    │                    │ if mode == 120000:           │
       │ if differ → FileChange   │                    │   getBlob → decode target    │
       │ if equal → check dest    │                    │   skip if target matches     │
       │   mode; 120000 → change  │                    │ else → FileChange            │
       │ mode = source tree mode  │                    │ mode = 120000                │
       │   (default 100644)       │                    │                              │
       └─────────────┬────────────┘                    └─────────────┬────────────────┘
                     │ ⑤                                             │ ⑤
                     └──────────────────────┬────────────────────────┘
                                            ▼
                        ┌──────────────────────────────────────┐
                        │ createSyncPullRequest                │
                        │ createBlob → createTree (base_tree)  │
                        │ → createCommit → upsertBranch        │
                        │ → upsertPullRequest (1 PR, idempot.) │
                        └──────────────────────────────────────┘
```

**Flow legend**

- ① [`agents-rules-sync.ts`](../agents-rules-sync.ts) fetches the consumer's root `package.json` from the default branch via the Contents API and validates `agents.rules` with Zod ([`resolvePackageAgentsRules.ts`](../src/resolvePackageAgentsRules.ts)).
- ② [`buildSyncEntries`](../src/buildSyncEntries.ts) constructs the `files` YAML — always two entries, with no input to toggle. Both are emitted atomically in the same payload so they land in the same PR and the pair is never half-applied.
- ③ The composite step output is passed verbatim to `files-sync` as its `files` input. The schema in [`parseInputs.ts`](../../files-sync/src/parseInputs.ts) is a strict union of `contentEntrySchema` and `symlinkEntrySchema`.
- ④ [`changeDetector.ts`](../../files-sync/src/changeDetector.ts) narrows each entry. The two branches do very different I/O.
- ⑤ Surviving `FileChange` objects funnel into the single existing Git Data API pipeline ([`createSyncPullRequest.ts`](../../files-sync/src/createSyncPullRequest.ts)). Mode `120000` is already in the tree-mode union accepted by `createTree`, so no special handling is needed at commit time.

## Payload

The payload is the same on every run — there is no input that changes its shape:

```yaml
- repo: awinogradov/code-assistants
  source: rules/Bun.md
  dest: AGENTS.md
- symlink: AGENTS.md
  dest: CLAUDE.md
```

`files-sync` writes both `AGENTS.md` (regular file, carrying the rules body) and `CLAUDE.md` (Git symlink, mode `120000`) in the same commit and PR. `AGENTS.md` holds the content because it is the name the wider agent ecosystem reads; `CLAUDE.md` is the compatibility alias.

## Upgrading from the pre-inversion layout

A repository synced by an earlier major has the pair the other way round — `CLAUDE.md` is the regular file, and `AGENTS.md` is either absent or a symlink pointing at it. Both cases converge in the first run after the upgrade, in one PR:

- **`AGENTS.md` absent** — the content entry creates it, and the symlink entry replaces the regular `CLAUDE.md` with a link.
- **`AGENTS.md` is a symlink** — the content branch detects the mode-`120000` destination and rewrites it as a regular file in the same commit that turns `CLAUDE.md` into the link. Without that mode check the two would end up pointing at each other; see [Why byte equality is not enough for a symlink destination](#why-byte-equality-is-not-enough-for-a-symlink-destination).

## Why the symlink path does not use the Contents API

The content branch uses `fetchRawContent` (Contents API + `Accept: application/vnd.github.raw`) to read both source and destination bodies. That endpoint **follows symlinks server-side** when the link target is a normal file in the repo — it returns the resolved file's bytes, not the link metadata.

For symlink detection that is a deal-breaker. After the first run, the consumer's `CLAUDE.md → AGENTS.md → <regular file>` chain would always look like the regular file's content via the Contents API, so we could never tell whether `CLAUDE.md` is already a symlink or a stale regular file.

The symlink branch instead uses the **Git Trees + Blobs APIs** ([`fetchTreeEntries`](../../files-sync/src/changeDetector.ts) + `octokit.rest.git.getBlob`). The recursive tree exposes the actual mode (`120000` ↔ symlink), and the blob body of a symlink IS the link target string. This is the only reliable way to read a symlink's target from a remote repo without a local working tree.

## Why byte equality is not enough for a symlink destination

The same server-side symlink resolution bites the **content** branch, in the one case where a content entry's destination is currently a link. That is precisely the state a repository is in while upgrading from the pre-inversion layout: `AGENTS.md` points at `CLAUDE.md`, which holds the rules body.

Read through the Contents API, that `AGENTS.md` resolves to the rules body — byte-identical to the source the entry is trying to write. Comparing bytes alone therefore concludes "no change" and leaves the link in place, while the symlink entry rewrites `CLAUDE.md` to point at `AGENTS.md`. The result is two links referencing each other with no regular file left in the cycle, and it is stable: every later run reaches the same "no change" verdict, so the sync can never repair itself.

The content branch closes this by asking for the destination's **tree mode** via [`fetchTreePathEntry`](../../files-sync/src/changeDetector.ts) whenever the bytes match, and emitting the rewrite anyway when that mode is `120000`. Tree mode is the one signal the Contents API cannot mask. The lookup runs only on the equal-bytes path, so a genuinely changed file costs nothing extra.

## Idempotency

Both branches return `null` from `detectChange` when nothing needs to change:

- Content entry: source and dest raw bytes are byte-equal **and** the dest is not itself a symlink.
- Symlink entry: dest exists at `dest`, has mode `120000`, and the blob body equals the requested target.

When every entry returns `null`, `computeChanges` yields an empty array, `files-sync` skips PR creation entirely, and the existing PR branch is left untouched. No empty PRs, no force-push churn.
