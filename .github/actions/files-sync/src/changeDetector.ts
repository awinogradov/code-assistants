/**
 * Source/destination comparison for the files-sync action.
 *
 * Fetches raw file contents from GitHub via the REST API (no working tree required) and
 * returns the subset of entries that differ between source and destination. Preserves
 * the source file mode (e.g. `100755` for executables) so the sync commit does not
 * strip execute bits. Symlink entries are written as Git mode `120000` blobs whose body
 * is the symlink target string.
 *
 * @example
 *   const changes = await computeChanges({ octokit, entries, destRepo, baseRef: 'main' });
 */

import type { Octokit } from '@octokit/rest';

import { fetchRawContent } from '@code-assistants/actions-core/fetchRawContent';

import {
  isSymlinkEntry,
  parseRepoSlug,
  type ContentEntry,
  type SymlinkEntry,
  type SyncEntry,
} from './parseInputs.ts';

const defaultMode = '100644';
const symlinkMode = '120000';

export interface FileChange {
  path: string;
  content: string;
  mode: string;
}

interface TreeEntry {
  mode: string;
  sha: string;
}

type TreeCache = Map<string, Promise<Map<string, TreeEntry>>>;

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
  const treeCache: TreeCache = new Map();
  const results = await Promise.all(
    entries.map((entry) =>
      detectChange({ octokit, entry, destRepo, baseRef, treeCache }),
    ),
  );

  return results.filter((change): change is FileChange => change !== null);
}

interface DetectArgs {
  octokit: Octokit;
  entry: SyncEntry;
  destRepo: { owner: string; name: string };
  baseRef: string;
  treeCache: TreeCache;
}

async function detectChange(args: DetectArgs): Promise<FileChange | null> {
  if (isSymlinkEntry(args.entry)) {
    return detectSymlinkChange({ ...args, entry: args.entry });
  }

  return detectContentChange({ ...args, entry: args.entry });
}

interface DetectContentArgs extends Omit<DetectArgs, 'entry'> {
  entry: ContentEntry;
}

async function detectContentChange({
  octokit,
  entry,
  destRepo,
  baseRef,
  treeCache,
}: DetectContentArgs): Promise<FileChange | null> {
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
    treeCache,
  });

  return { path: entry.dest, content: sourceContent, mode };
}

interface DetectSymlinkArgs extends Omit<DetectArgs, 'entry'> {
  entry: SymlinkEntry;
}

async function detectSymlinkChange({
  octokit,
  entry,
  destRepo,
  baseRef,
  treeCache,
}: DetectSymlinkArgs): Promise<FileChange | null> {
  // NOTE: We cannot reuse `fetchRawContent` (Contents API + Accept: raw) here.
  // GitHub server-side-follows symlinks whose target is a normal file in the
  // repo and returns the target's content, which would mask the link metadata
  // and produce spurious diffs. The Git Trees + Blobs APIs are the only
  // reliable way to read a symlink's target from a remote repo without a
  // local working tree.
  const destEntries = await loadTreeEntries({
    octokit,
    owner: destRepo.owner,
    repo: destRepo.name,
    ref: baseRef,
    treeCache,
  });

  const existing = destEntries.get(entry.dest);
  const change: FileChange = { path: entry.dest, content: entry.symlink, mode: symlinkMode };

  if (existing === undefined || existing.mode !== symlinkMode) {
    return change;
  }

  const blob = await octokit.rest.git.getBlob({
    owner: destRepo.owner,
    repo: destRepo.name,
    file_sha: existing.sha,
  });
  const currentTarget = Buffer.from(blob.data.content, 'base64').toString('utf8');

  if (currentTarget === entry.symlink) {
    return null;
  }

  return change;
}

interface ResolveModeArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref?: string;
  path: string;
  treeCache: TreeCache;
}

async function resolveSourceMode({
  octokit,
  owner,
  repo,
  ref,
  path,
  treeCache,
}: ResolveModeArgs): Promise<string> {
  const entries = await loadTreeEntries({ octokit, owner, repo, ref, treeCache });
  return entries.get(path)?.mode ?? defaultMode;
}

interface LoadTreeArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref?: string;
  treeCache: TreeCache;
}

async function loadTreeEntries({
  octokit,
  owner,
  repo,
  ref,
  treeCache,
}: LoadTreeArgs): Promise<Map<string, TreeEntry>> {
  const cacheKey = `${owner}/${repo}@${ref ?? ''}`;
  let cached = treeCache.get(cacheKey);

  if (cached === undefined) {
    cached = fetchTreeEntries({ octokit, owner, repo, ref });
    treeCache.set(cacheKey, cached);
  }

  return cached;
}

interface FetchTreeArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref?: string;
}

/**
 * Fetch the recursive Git tree for `owner/repo@ref` and return a Map keyed by path.
 *
 * Throws when the tree is truncated, because partial trees cannot reliably resolve
 * file modes or symlink targets. Used by both source-mode resolution (content sync)
 * and dest-tree probing (symlink detection).
 *
 * @example
 *   const entries = await fetchTreeEntries({ octokit, owner: 'me', repo: 'app' });
 *   entries.get('AGENTS.md')?.mode; // '120000' if symlink
 */
export async function fetchTreeEntries({
  octokit,
  owner,
  repo,
  ref,
}: FetchTreeArgs): Promise<Map<string, TreeEntry>> {
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
      `Tree is truncated for ${owner}/${repo}${ref ? `@${ref}` : ''}; cannot reliably resolve file modes`,
    );
  }

  const entries = new Map<string, TreeEntry>();
  for (const entry of tree.data.tree) {
    if (entry.path !== undefined && entry.mode !== undefined && entry.sha !== undefined) {
      entries.set(entry.path, { mode: entry.mode, sha: entry.sha });
    }
  }

  return entries;
}
