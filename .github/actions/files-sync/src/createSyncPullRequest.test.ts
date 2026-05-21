import { describe, expect, test } from 'bun:test';

import type { Octokit } from '@octokit/rest';

import type { FileChange } from './changeDetector.ts';
import { createSyncPullRequest } from './createSyncPullRequest.ts';

interface MockOverrides {
  listOpenPrs?: () => Promise<{ data: Array<{ number: number; html_url: string }> }>;
  createPr?: () => Promise<{ data: { number: number; html_url: string } }>;
}

function makeOctokit(overrides: MockOverrides = {}): Octokit {
  const listOpenPrs = overrides.listOpenPrs ?? (async () => ({ data: [] }));
  const createPr =
    overrides.createPr ??
    (async () => ({ data: { number: 42, html_url: 'https://github.com/owner/repo/pull/42' } }));

  return {
    rest: {
      git: {
        getRef: async () => ({ data: { object: { sha: 'base-sha' } } }),
        getCommit: async () => ({ data: { tree: { sha: 'base-tree-sha' } } }),
        createBlob: async () => ({ data: { sha: 'blob-sha' } }),
        createTree: async () => ({ data: { sha: 'new-tree-sha' } }),
        createCommit: async () => ({ data: { sha: 'new-commit-sha' } }),
        createRef: async () => ({ data: {} }),
        updateRef: async () => ({ data: {} }),
      },
      pulls: {
        list: listOpenPrs,
        create: createPr,
      },
    },
  } as unknown as Octokit;
}

const baseArgs = {
  destRepo: { owner: 'owner', name: 'repo' },
  base: 'main',
  branch: 'chore/sync',
  title: 'Sync',
  body: 'body',
  commitMessage: 'chore: sync',
  changes: [{ path: 'CLAUDE.md', content: 'hello', mode: '100644' }] satisfies FileChange[],
};

describe('createSyncPullRequest', () => {
  test('returns PR shape on happy path', async () => {
    const octokit = makeOctokit();

    const pr = await createSyncPullRequest({ octokit, ...baseArgs });

    expect(pr).toEqual({ number: 42, htmlUrl: 'https://github.com/owner/repo/pull/42' });
  });

  test('rethrows 403 from pulls.create with PAT / GitHub App guidance and README link', async () => {
    const octokit = makeOctokit({
      createPr: async () => {
        const error = new Error('GitHub Actions is not permitted to create or approve pull requests');
        Object.assign(error, { status: 403 });
        throw error;
      },
    });

    const promise = createSyncPullRequest({ octokit, ...baseArgs });

    await expect(promise).rejects.toThrow(/PAT or GitHub App/);
    await expect(promise).rejects.toThrow(/owner\/repo/);
    await expect(promise).rejects.toThrow(/files-sync\/README\.md#permissions/);
  });

  test('rethrows non-403 errors unchanged', async () => {
    const octokit = makeOctokit({
      createPr: async () => {
        const error = new Error('boom');
        Object.assign(error, { status: 500 });
        throw error;
      },
    });

    await expect(createSyncPullRequest({ octokit, ...baseArgs })).rejects.toThrow(/^boom$/);
  });
});
