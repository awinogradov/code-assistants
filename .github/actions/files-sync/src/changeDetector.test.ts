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

  return {
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
