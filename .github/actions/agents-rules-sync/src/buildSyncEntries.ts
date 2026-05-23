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
 * @example
 *   const entries = buildSyncEntries({
 *     sourceRepo: 'awinogradov/code-assistants',
 *     rules: 'Bun',
 *     sourceRef: '',
 *     agentsMd: true,
 *   });
 *   // → [{ repo, source: 'rules/Bun.md', dest: 'CLAUDE.md' },
 *   //    { symlink: 'CLAUDE.md', dest: 'AGENTS.md' }]
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
  agentsMd: boolean;
}

export function buildSyncEntries({
  sourceRepo,
  rules,
  sourceRef,
  agentsMd,
}: BuildArgs): SyncEntry[] {
  const content: ContentSyncEntry = {
    repo: sourceRepo,
    source: `rules/${rules}.md`,
    dest: 'CLAUDE.md',
  };

  if (sourceRef !== '') {
    content.ref = sourceRef;
  }

  if (!agentsMd) {
    return [content];
  }

  const symlink: SymlinkSyncEntry = {
    symlink: 'CLAUDE.md',
    dest: 'AGENTS.md',
  };

  return [content, symlink];
}
