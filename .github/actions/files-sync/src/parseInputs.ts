/**
 * Input parsing for the files-sync action.
 *
 * Parses the `files` action input — a YAML list of sync entries — and validates it with Zod.
 *
 * Two entry variants are supported (strict XOR):
 *
 * - **Content entry**: copies a file from a source repo to the destination.
 *   Fields: `repo`, `source`, `dest`, optional `ref`.
 * - **Symlink entry**: writes a Git symlink (mode `120000`) at `dest` pointing at `symlink`.
 *   Fields: `symlink`, `dest`. No `repo`/`source`/`ref`.
 *
 * @example
 *   const entries = parseFilesInput(process.env.FILES_INPUT ?? '');
 */

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const repoPattern = /^[^/]+\/[^/]+$/;

/**
 * Schema for a content sync entry that copies a file between repositories.
 *
 * @see {@link symlinkEntrySchema} for the symlink variant.
 */
export const contentEntrySchema = z.strictObject({
  repo: z
    .string()
    .regex(repoPattern, 'repo must be in `owner/name` form'),
  source: z.string().min(1, 'source path is required'),
  dest: z.string().min(1, 'dest path is required'),
  ref: z.string().min(1).optional(),
});

/**
 * Schema for a symlink sync entry that writes a Git mode `120000` blob at `dest`.
 *
 * The blob body is the literal `symlink` value — a relative target path. Fetching
 * the symlink target's content is the responsibility of the caller of the symlink,
 * not files-sync.
 *
 * @see {@link contentEntrySchema} for the content-copy variant.
 */
export const symlinkEntrySchema = z.strictObject({
  symlink: z.string().min(1, 'symlink target is required'),
  dest: z.string().min(1, 'dest path is required'),
});

export const syncEntrySchema = z.union([contentEntrySchema, symlinkEntrySchema]);

export const filesInputSchema = z
  .array(syncEntrySchema)
  .min(1, 'at least one file entry is required');

export type ContentEntry = z.infer<typeof contentEntrySchema>;
export type SymlinkEntry = z.infer<typeof symlinkEntrySchema>;
export type SyncEntry = z.infer<typeof syncEntrySchema>;

export function parseFilesInput(raw: string): SyncEntry[] {
  const trimmed = raw.trim();

  if (trimmed === '') {
    throw new Error('FILES_INPUT is empty');
  }

  const parsed = parseYaml(trimmed) as unknown;
  const result = filesInputSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid files input:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

export function parseRepoSlug(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/');

  if (owner === undefined || name === undefined) {
    throw new Error(`Invalid repo slug: ${repo}`);
  }

  return { owner, name };
}

/**
 * Type guard: narrows a `SyncEntry` to the symlink variant.
 *
 * Use this in callers that branch behavior by entry kind — Zod's strict-object
 * union ensures `'symlink' in entry` is sound (no extra keys can sneak through).
 */
export function isSymlinkEntry(entry: SyncEntry): entry is SymlinkEntry {
  return 'symlink' in entry;
}
