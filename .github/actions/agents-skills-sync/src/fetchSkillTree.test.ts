import { describe, expect, test } from 'bun:test';

import type { Octokit } from '@octokit/rest';

import { fetchSkillTree } from './fetchSkillTree.ts';

interface TreeEntry {
  path?: string;
  type?: string;
}

function fakeOctokit(tree: TreeEntry[], options: { truncated?: boolean; defaultBranch?: string } = {}) {
  const calls: Record<string, unknown>[] = [];
  const octokit = {
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: options.defaultBranch ?? 'main' } }),
      },
      git: {
        getTree: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { data: { tree, truncated: options.truncated ?? false } };
        },
      },
    },
  } as unknown as Octokit;
  return { octokit, calls };
}

const tree: TreeEntry[] = [
  { path: 'agent-skills/autopilot-run/SKILL.md', type: 'blob' },
  { path: 'agent-skills/README.md', type: 'blob' },
  { path: 'agent-skills/autopilot-run', type: 'tree' },
  { path: 'rules/Bun.md', type: 'blob' },
];

describe('fetchSkillTree', () => {
  test('returns sorted blob paths under agent-skills/ only', async () => {
    const { octokit } = fakeOctokit(tree);
    const files = await fetchSkillTree({ octokit, sourceRepo: 'o/r', sourceRef: 'main' });
    expect(files).toEqual(['agent-skills/README.md', 'agent-skills/autopilot-run/SKILL.md']);
  });

  test('resolves the default branch when sourceRef is empty', async () => {
    const { octokit, calls } = fakeOctokit(tree, { defaultBranch: 'trunk' });
    await fetchSkillTree({ octokit, sourceRepo: 'o/r', sourceRef: '' });
    expect(calls[0]).toMatchObject({ tree_sha: 'trunk' });
  });

  test('throws on a truncated tree instead of syncing a partial layout', async () => {
    const { octokit } = fakeOctokit(tree, { truncated: true });
    expect(fetchSkillTree({ octokit, sourceRepo: 'o/r', sourceRef: 'main' })).rejects.toThrow(/truncated/);
  });

  test('throws when the layout is absent from the source repo', async () => {
    const { octokit } = fakeOctokit([{ path: 'rules/Bun.md', type: 'blob' }]);
    expect(fetchSkillTree({ octokit, sourceRepo: 'o/r', sourceRef: 'main' })).rejects.toThrow(/No files found/);
  });
});
