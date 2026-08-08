/**
 * Builds the YAML payload of sync entries that `agents-rules-sync` hands off to
 * `files-sync`. Pure function — no I/O, no globals — so it is straightforward to
 * test in isolation.
 *
 * The shape of `SyncEntry` here MUST mirror `files-sync`'s parseInputs schema:
 * see `.github/actions/files-sync/src/parseInputs.ts` (`contentEntrySchema` and
 * `symlinkEntrySchema`). They are intentionally duplicated rather than imported
 * across workspace boundaries because the YAML payload — not the TS type — is the
 * contract between the two actions.
 *
 * `AGENTS.md` is the regular file carrying the rules body and `CLAUDE.md` is a
 * symlink to it, so the vendor-neutral name is the source of truth and every
 * consumer gets both without opting in.
 *
 * @example
 *   const entries = buildSyncEntries({
 *     sourceRepo: 'awinogradov/code-assistants',
 *     rules: 'Bun',
 *     sourceRef: '',
 *   });
 *   // → [{ repo, source: 'rules/Bun.md', dest: 'AGENTS.md' },
 *   //    { symlink: 'AGENTS.md', dest: 'CLAUDE.md' }]
 */

interface ContentSyncEntry {
  repo: string;
  source: string;
  dest: string;
  ref?: string;
}

interface SymlinkSyncEntry {
  symlink: string;
  dest: string;
}

export type SyncEntry = ContentSyncEntry | SymlinkSyncEntry;

interface BuildArgs {
  sourceRepo: string;
  rules: string;
  sourceRef: string;
}

export function buildSyncEntries({
  sourceRepo,
  rules,
  sourceRef,
}: BuildArgs): SyncEntry[] {
  const content: ContentSyncEntry = {
    repo: sourceRepo,
    source: `rules/${rules}.md`,
    dest: 'AGENTS.md',
  };

  if (sourceRef !== '') {
    content.ref = sourceRef;
  }

  const symlink: SymlinkSyncEntry = {
    symlink: 'AGENTS.md',
    dest: 'CLAUDE.md',
  };

  return [content, symlink];
}
