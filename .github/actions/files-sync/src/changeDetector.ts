/**
 * Source/destination comparison for the files-sync action.
 *
 * Fetches raw file contents from GitHub via the REST API (no working tree required) and
 * returns the subset of entries that differ between source and destination. Preserves
 * the source file mode (e.g. `100755` for executables) so the sync commit does not
 * strip execute bits.
 *
 * @example
 *   const changes = await computeChanges(octokit, entries, { owner, name }, 'main');
 */

import type { Octokit } from '@octokit/rest';

import { fetchRawContent } from '@code-assistants/actions-lib/fetchRawContent';

import { parseRepoSlug, type SyncEntry } from './parseInputs.ts';

const defaultMode = '100644';

export interface FileChange {
  path: string;
  content: string;
  mode: string;
}

interface ComputeArgs {
  octokit: Octokit;
  entries: SyncEntry[];
  destRepo: { owner: string; name: string };
  baseRef: string;
}

export async function computeChanges({
  octokit,
  entries,
  destRepo,
  baseRef,
}: ComputeArgs): Promise<FileChange[]> {
  const modeCache = new Map<string, Promise<Map<string, string>>>();
  const results = await Promise.all(
    entries.map((entry) =>
      detectChange({ octokit, entry, destRepo, baseRef, modeCache }),
    ),
  );

  return results.filter((change): change is FileChange => change !== null);
}

interface DetectArgs {
  octokit: Octokit;
  entry: SyncEntry;
  destRepo: { owner: string; name: string };
  baseRef: string;
  modeCache: Map<string, Promise<Map<string, string>>>;
}

async function detectChange({
  octokit,
  entry,
  destRepo,
  baseRef,
  modeCache,
}: DetectArgs): Promise<FileChange | null> {
  const source = parseRepoSlug(entry.repo);

  const sourceContent = await fetchRawContent({
    octokit,
    owner: source.owner,
    repo: source.name,
    path: entry.source,
    ref: entry.ref,
  });

  if (sourceContent === null) {
    throw new Error(`Source not found at ${entry.repo}:${entry.source}`);
  }

  const destContent = await fetchRawContent({
    octokit,
    owner: destRepo.owner,
    repo: destRepo.name,
    path: entry.dest,
    ref: baseRef,
  });

  if (destContent === sourceContent) {
    return null;
  }

  const mode = await resolveSourceMode({
    octokit,
    owner: source.owner,
    repo: source.name,
    ref: entry.ref,
    path: entry.source,
    modeCache,
  });

  return { path: entry.dest, content: sourceContent, mode };
}

interface ResolveModeArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref?: string;
  path: string;
  modeCache: Map<string, Promise<Map<string, string>>>;
}

async function resolveSourceMode({
  octokit,
  owner,
  repo,
  ref,
  path,
  modeCache,
}: ResolveModeArgs): Promise<string> {
  const cacheKey = `${owner}/${repo}@${ref ?? ''}`;
  let modesPromise = modeCache.get(cacheKey);

  if (modesPromise === undefined) {
    modesPromise = fetchSourceTreeModes({ octokit, owner, repo, ref });
    modeCache.set(cacheKey, modesPromise);
  }

  const modes = await modesPromise;
  return modes.get(path) ?? defaultMode;
}

interface FetchModesArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref?: string;
}

async function fetchSourceTreeModes({
  octokit,
  owner,
  repo,
  ref,
}: FetchModesArgs): Promise<Map<string, string>> {
  const targetRef = ref ?? (await octokit.rest.repos.get({ owner, repo })).data.default_branch;
  const commit = await octokit.rest.repos.getCommit({ owner, repo, ref: targetRef });
  const tree = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commit.data.commit.tree.sha,
    recursive: 'true',
  });

  if (tree.data.truncated) {
    throw new Error(
      `Source tree is truncated for ${owner}/${repo}${ref ? `@${ref}` : ''}; cannot reliably resolve file modes`,
    );
  }

  const modes = new Map<string, string>();
  for (const entry of tree.data.tree) {
    if (entry.path !== undefined && entry.mode !== undefined) {
      modes.set(entry.path, entry.mode);
    }
  }

  return modes;
}
