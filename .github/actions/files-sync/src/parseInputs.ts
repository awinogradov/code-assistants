/**
 * Input parsing for the files-sync action.
 *
 * Parses the `files` action input — a YAML list of sync entries — and validates it with Zod.
 *
 * @example
 *   const entries = parseFilesInput(process.env.FILES_INPUT ?? '');
 */

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const repoPattern = /^[^/]+\/[^/]+$/;

export const syncEntrySchema = z.object({
  repo: z
    .string()
    .regex(repoPattern, 'repo must be in `owner/name` form'),
  source: z.string().min(1, 'source path is required'),
  dest: z.string().min(1, 'dest path is required'),
  ref: z.string().min(1).optional(),
});

export const filesInputSchema = z
  .array(syncEntrySchema)
  .min(1, 'at least one file entry is required');

export type SyncEntry = z.infer<typeof syncEntrySchema>;

export function parseFilesInput(raw: string): SyncEntry[] {
  const trimmed = raw.trim();

  if (trimmed === '') {
    throw new Error('FILES_INPUT is empty');
  }

  const parsed = parseYaml(trimmed) as unknown;
  const result = filesInputSchema.safeParse(parsed);

  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    throw new Error(`Invalid files input at ${path}: ${issue.message}`);
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
