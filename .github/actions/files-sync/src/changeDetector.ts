/**
 * Source/destination comparison for the files-sync action.
 *
 * Fetches raw file contents from GitHub via the REST API (no working tree required) and
 * returns the subset of entries that differ between source and destination.
 *
 * @example
 *   const changes = await computeChanges(octokit, entries, { owner, name }, 'main');
 */

import type { Octokit } from '@octokit/rest';
import type { RequestError } from '@octokit/request-error';

import { parseRepoSlug, type SyncEntry } from './parseInputs.ts';

export interface FileChange {
  path: string;
  content: string;
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

    return typeof response.data === 'string'
      ? response.data
      : Buffer.from(JSON.stringify(response.data)).toString('utf-8');
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
  const results = await Promise.all(
    entries.map((entry) => detectChange({ octokit, entry, destRepo, baseRef })),
  );

  return results.filter((change): change is FileChange => change !== null);
}

interface DetectArgs {
  octokit: Octokit;
  entry: SyncEntry;
  destRepo: { owner: string; name: string };
  baseRef: string;
}

async function detectChange({
  octokit,
  entry,
  destRepo,
  baseRef,
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

  return { path: entry.dest, content: sourceContent };
}
