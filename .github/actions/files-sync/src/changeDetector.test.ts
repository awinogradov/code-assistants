import { describe, expect, test } from 'bun:test';

import type { Octokit } from '@octokit/rest';

import { computeChanges } from './changeDetector.ts';
import type { SyncEntry } from './parseInputs.ts';

interface TreeEntryFixture {
  path: string;
  mode: string;
  sha: string;
  type?: 'blob' | 'tree';
}

interface MockOptions {
  treeEntries?: TreeEntryFixture[];
  treesBySha?: Record<string, TreeEntryFixture[]>;
  blobs?: Record<string, string>;
  /** Raw Contents API bodies, keyed `owner/repo:path`. Absent key ⇒ HTTP 404. */
  files?: Record<string, string>;
}

const destRepo = { owner: 'owner', name: 'repo' };
const baseRef = 'main';

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function makeOctokit(options: MockOptions = {}): Octokit {
  const rootTreeEntries = options.treeEntries ?? [];
  const treesBySha = options.treesBySha ?? {};
  const blobs = options.blobs ?? {};
  const files = options.files ?? {};

  return {
    request: async (
      _route: string,
      { owner, repo, path }: { owner: string; repo: string; path: string },
    ) => {
      const content = files[`${owner}/${repo}:${path}`];

      if (content === undefined) {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }

      return { data: content };
    },
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: 'main' } }),
        getCommit: async () => ({
          data: { commit: { tree: { sha: 'base-tree-sha' } } },
        }),
      },
      git: {
        getTree: async ({ tree_sha }: { tree_sha: string }) => {
          const tree = tree_sha === 'base-tree-sha' ? rootTreeEntries : treesBySha[tree_sha] ?? [];
          return {
            data: {
              sha: tree_sha,
              tree,
              truncated: false,
            },
          };
        },
        getBlob: async ({ file_sha }: { file_sha: string }) => {
          const decoded = blobs[file_sha];

          if (decoded === undefined) {
            throw new Error(`unexpected blob fetch for sha=${file_sha}`);
          }

          return { data: { content: encodeBase64(decoded), sha: file_sha, encoding: 'base64' } };
        },
      },
    },
  } as unknown as Octokit;
}

describe('computeChanges — content entries', () => {
  const contentEntry: SyncEntry = {
    repo: 'source/upstream',
    source: 'rules/Bun.md',
    dest: 'AGENTS.md',
  };
  const rulesBody = '# Bun Project Rules\n';
  const sourceTreeEntry: TreeEntryFixture = {
    path: 'rules/Bun.md',
    mode: '100644',
    sha: 'rules-blob-sha',
  };

  test('returns no change when dest is a byte-equal regular file', async () => {
    const octokit = makeOctokit({
      files: {
        'source/upstream:rules/Bun.md': rulesBody,
        'owner/repo:AGENTS.md': rulesBody,
      },
      treeEntries: [
        sourceTreeEntry,
        { path: 'AGENTS.md', mode: '100644', sha: 'dest-blob-sha' },
      ],
    });

    const changes = await computeChanges({
      octokit,
      entries: [contentEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([]);
  });

  test('emits a change when dest content differs', async () => {
    const octokit = makeOctokit({
      files: {
        'source/upstream:rules/Bun.md': rulesBody,
        'owner/repo:AGENTS.md': '# Stale rules\n',
      },
      treeEntries: [
        sourceTreeEntry,
        { path: 'AGENTS.md', mode: '100644', sha: 'dest-blob-sha' },
      ],
    });

    const changes = await computeChanges({
      octokit,
      entries: [contentEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([
      { path: 'AGENTS.md', content: rulesBody, mode: '100644' },
    ]);
  });

  // The Contents API follows symlinks, so a dest that is still a symlink to the old
  // regular file reads back byte-equal to the source. Skipping it would leave the two
  // files pointing at each other with no regular file left in the cycle.
  test('emits a change when dest is a symlink whose resolved content matches', async () => {
    const octokit = makeOctokit({
      files: {
        'source/upstream:rules/Bun.md': rulesBody,
        'owner/repo:AGENTS.md': rulesBody,
      },
      treeEntries: [
        sourceTreeEntry,
        { path: 'AGENTS.md', mode: '120000', sha: 'symlink-blob-sha' },
      ],
    });

    const changes = await computeChanges({
      octokit,
      entries: [contentEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([
      { path: 'AGENTS.md', content: rulesBody, mode: '100644' },
    ]);
  });

  test('emits a change when dest does not exist', async () => {
    const octokit = makeOctokit({
      files: { 'source/upstream:rules/Bun.md': rulesBody },
      treeEntries: [sourceTreeEntry],
    });

    const changes = await computeChanges({
      octokit,
      entries: [contentEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([
      { path: 'AGENTS.md', content: rulesBody, mode: '100644' },
    ]);
  });
});

describe('computeChanges — symlink entries', () => {
  const symlinkEntry: SyncEntry = { symlink: 'CLAUDE.md', dest: 'AGENTS.md' };

  test('returns no change when dest already symlinks to the same target', async () => {
    const octokit = makeOctokit({
      treeEntries: [{ path: 'AGENTS.md', mode: '120000', sha: 'symlink-blob-sha' }],
      blobs: { 'symlink-blob-sha': 'CLAUDE.md' },
    });

    const changes = await computeChanges({
      octokit,
      entries: [symlinkEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([]);
  });

  test('emits a change when dest does not exist', async () => {
    const octokit = makeOctokit({ treeEntries: [] });

    const changes = await computeChanges({
      octokit,
      entries: [symlinkEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([
      { path: 'AGENTS.md', content: 'CLAUDE.md', mode: '120000' },
    ]);
  });

  test('emits a change when dest exists as a regular file', async () => {
    const octokit = makeOctokit({
      treeEntries: [{ path: 'AGENTS.md', mode: '100644', sha: 'file-blob-sha' }],
    });

    const changes = await computeChanges({
      octokit,
      entries: [symlinkEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([
      { path: 'AGENTS.md', content: 'CLAUDE.md', mode: '120000' },
    ]);
  });

  test('emits a change when existing symlink points elsewhere', async () => {
    const octokit = makeOctokit({
      treeEntries: [{ path: 'AGENTS.md', mode: '120000', sha: 'stale-blob-sha' }],
      blobs: { 'stale-blob-sha': 'rules/Bun.md' },
    });

    const changes = await computeChanges({
      octokit,
      entries: [symlinkEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([
      { path: 'AGENTS.md', content: 'CLAUDE.md', mode: '120000' },
    ]);
  });

  test('walks nested destination paths via non-recursive tree calls', async () => {
    const nestedEntry: SyncEntry = { symlink: 'CLAUDE.md', dest: 'tools/AGENTS.md' };
    const octokit = makeOctokit({
      treeEntries: [{ path: 'tools', mode: '040000', sha: 'tools-tree-sha', type: 'tree' }],
      treesBySha: {
        'tools-tree-sha': [
          { path: 'AGENTS.md', mode: '120000', sha: 'nested-blob-sha' },
        ],
      },
      blobs: { 'nested-blob-sha': 'CLAUDE.md' },
    });

    const changes = await computeChanges({
      octokit,
      entries: [nestedEntry],
      destRepo,
      baseRef,
    });

    expect(changes).toEqual([]);
  });
});
