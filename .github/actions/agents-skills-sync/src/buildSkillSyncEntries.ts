/**
 * Builds the YAML payload of sync entries that `agents-skills-sync` hands off
 * to `files-sync`. Pure function — no I/O — mirroring `agents-rules-sync`'s
 * `buildSyncEntries`.
 *
 * The entry shape MUST mirror `files-sync`'s parseInputs `contentEntrySchema`;
 * the YAML payload — not a TS type — is the contract between the two actions,
 * so it is duplicated rather than imported across workspace boundaries.
 *
 * Destinations land under `.agents/skills/` — the vendor-neutral directory
 * Codex, Kimi, and other SKILL.md-compatible CLIs read — preserving each
 * file's path relative to the source `agent-skills/` layout.
 *
 * @example
 *   const entries = buildSkillSyncEntries({
 *     sourceRepo: 'awinogradov/code-assistants',
 *     sourceRef: '',
 *     files: ['agent-skills/autopilot-run/SKILL.md'],
 *   });
 *   // → [{ repo, source: 'agent-skills/autopilot-run/SKILL.md',
 *   //      dest: '.agents/skills/autopilot-run/SKILL.md' }]
 */

const sourcePrefix = 'agent-skills/';
const destPrefix = '.agents/skills/';

/** One files-sync content entry. */
export interface SkillSyncEntry {
  repo: string;
  source: string;
  dest: string;
  ref?: string;
}

interface BuildArgs {
  sourceRepo: string;
  sourceRef: string;
  /** Source-repo file paths under `agent-skills/`, as returned by fetchSkillTree. */
  files: string[];
}

export function buildSkillSyncEntries({ sourceRepo, sourceRef, files }: BuildArgs): SkillSyncEntry[] {
  return files
    .filter((file) => file.startsWith(sourcePrefix))
    .map((file) => ({
      repo: sourceRepo,
      source: file,
      dest: `${destPrefix}${file.slice(sourcePrefix.length)}`,
      ...(sourceRef === '' ? {} : { ref: sourceRef }),
    }));
}
