import { describe, expect, test } from 'bun:test';

import type { Octokit } from '@octokit/rest';

import { computeChanges } from './changeDetector.ts';
import type { SyncEntry } from './parseInputs.ts';

interface TreeEntryFixture {
  path: string;
  mode: string;
  sha: string;
}

interface MockOptions {
  treeEntries?: TreeEntryFixture[];
  truncated?: boolean;
  blobs?: Record<string, string>;
}

const destRepo = { owner: 'owner', name: 'repo' };
const baseRef = 'main';

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function makeOctokit(options: MockOptions = {}): Octokit {
  const treeEntries = options.treeEntries ?? [];
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
        getTree: async () => ({
          data: {
            sha: 'base-tree-sha',
            tree: treeEntries,
            truncated: options.truncated ?? false,
          },
        }),
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

  test('throws when the dest tree is truncated', async () => {
    const octokit = makeOctokit({ treeEntries: [], truncated: true });

    const promise = computeChanges({
      octokit,
      entries: [symlinkEntry],
      destRepo,
      baseRef,
    });

    await expect(promise).rejects.toThrow(/truncated/);
  });
});
