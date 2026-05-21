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
import type { RequestError } from '@octokit/request-error';

import { parseRepoSlug, type SyncEntry } from './parseInputs.ts';

const defaultMode = '100644';

export interface FileChange {
  path: string;
  content: string;
  mode: string;
}

interface FetchArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export async function fetchRawContent({
  octokit,
  owner,
  repo,
  path,
  ref,
}: FetchArgs): Promise<string | null> {
  try {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner,
        repo,
        path,
        ref,
        headers: { accept: 'application/vnd.github.raw' },
      },
    );

    if (typeof response.data !== 'string') {
      throw new Error(
        `Expected raw string content from ${owner}/${repo}:${path}${ref ? `@${ref}` : ''}, got ${typeof response.data}`,
      );
    }

    return response.data;
  } catch (error) {
    const requestError = error as RequestError;

    if (requestError.status === 404) {
      return null;
    }

    throw new Error(
      `Failed to fetch ${owner}/${repo}:${path}${ref ? `@${ref}` : ''}: ${requestError.message}`,
    );
  }
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

  const modes = new Map<string, string>();
  for (const entry of tree.data.tree) {
    if (entry.path !== undefined && entry.mode !== undefined) {
      modes.set(entry.path, entry.mode);
    }
  }

  return modes;
}
