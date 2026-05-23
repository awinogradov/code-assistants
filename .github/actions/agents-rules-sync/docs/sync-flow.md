# Sync flow

End-to-end data flow for [`agents-rules-sync`](../README.md), including how it composes with [`files-sync`](../../files-sync/README.md) and what changes when the [`agents-md`](../README.md#inputs) input is enabled.

## Diagram

```
┌───────────────────────┐  ① reads pkg   ┌──────────────────────────────┐
│ Consumer repo         │───────────────▶│ Action: agents-rules-sync    │
│ package.json          │                │ inputs.agents-md = true      │
│ { agents.rules: Bun } │                │ resolve step (Bun)           │
└───────────────────────┘                └──────────────┬───────────────┘
                                                        │ ② emit YAML
                                                        ▼
                                  ┌──────────────────────────────────┐
                                  │ files YAML payload (2 entries)   │
                                  │ - repo: awinogradov/...           │
                                  │   source: rules/Bun.md           │
                                  │   dest: CLAUDE.md                │
                                  │ - symlink: CLAUDE.md             │
                                  │   dest: AGENTS.md                │
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
       │ mode = source tree mode  │                    │   skip if target matches     │
       │   (default 100644)       │                    │ else → FileChange            │
       │                          │                    │ mode = 120000                │
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
- ② [`buildSyncEntries`](../src/buildSyncEntries.ts) constructs the `files` YAML — one entry by default, two entries when `agents-md: true`. Both entries are emitted atomically in the same payload so they land in the same PR.
- ③ The composite step output is passed verbatim to `files-sync` as its `files` input. The schema in [`parseInputs.ts`](../../files-sync/src/parseInputs.ts) is a strict union of `contentEntrySchema` and `symlinkEntrySchema`.
- ④ [`changeDetector.ts`](../../files-sync/src/changeDetector.ts) narrows each entry. The two branches do very different I/O.
- ⑤ Surviving `FileChange` objects funnel into the single existing Git Data API pipeline ([`createSyncPullRequest.ts`](../../files-sync/src/createSyncPullRequest.ts)). Mode `120000` is already in the tree-mode union accepted by `createTree`, so no special handling is needed at commit time.

## Default behavior

With `agents-md: false` (the default), the YAML payload is identical to the v1 shape:

```yaml
- repo: awinogradov/code-assistants
  source: rules/Bun.md
  dest: CLAUDE.md
```

A single content entry; downstream PR touches `CLAUDE.md` only. Existing consumers are byte-for-byte unaffected.

## With `agents-md: true`

The payload gains a second symlink entry:

```yaml
- repo: awinogradov/code-assistants
  source: rules/Bun.md
  dest: CLAUDE.md
- symlink: CLAUDE.md
  dest: AGENTS.md
```

`files-sync` writes both `CLAUDE.md` (regular file) and `AGENTS.md` (Git symlink, mode `120000`) in the same commit and PR.

## Why the symlink path does not use the Contents API

The content branch uses `fetchRawContent` (Contents API + `Accept: application/vnd.github.raw`) to read both source and destination bodies. That endpoint **follows symlinks server-side** when the link target is a normal file in the repo — it returns the resolved file's bytes, not the link metadata.

For symlink detection that is a deal-breaker. After the first run, the consumer's `AGENTS.md → CLAUDE.md → <regular file>` chain would always look like the regular file's content via the Contents API, so we could never tell whether `AGENTS.md` is already a symlink or a stale regular file.

The symlink branch instead uses the **Git Trees + Blobs APIs** ([`fetchTreeEntries`](../../files-sync/src/changeDetector.ts) + `octokit.rest.git.getBlob`). The recursive tree exposes the actual mode (`120000` ↔ symlink), and the blob body of a symlink IS the link target string. This is the only reliable way to read a symlink's target from a remote repo without a local working tree.

## Idempotency

Both branches return `null` from `detectChange` when nothing needs to change:

- Content entry: source and dest raw bytes are byte-equal.
- Symlink entry: dest exists at `dest`, has mode `120000`, and the blob body equals the requested target.

When every entry returns `null`, `computeChanges` yields an empty array, `files-sync` skips PR creation entirely, and the existing PR branch is left untouched. No empty PRs, no force-push churn.
