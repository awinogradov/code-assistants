import { describe, expect, test } from 'bun:test';

import { buildSyncEntries } from './buildSyncEntries.ts';

const baseArgs = {
  sourceRepo: 'awinogradov/code-assistants',
  rules: 'Bun',
  sourceRef: '',
  agentsMd: false,
};

describe('buildSyncEntries', () => {
  test('returns a single content entry by default (legacy v1 shape)', () => {
    const entries = buildSyncEntries(baseArgs);

    expect(entries).toEqual([
      {
        repo: 'awinogradov/code-assistants',
        source: 'rules/Bun.md',
        dest: 'CLAUDE.md',
      },
    ]);
  });

  test('omits `ref` when sourceRef is empty', () => {
    const entries = buildSyncEntries(baseArgs);

    expect(entries[0]).not.toHaveProperty('ref');
  });

  test('includes `ref` when sourceRef is provided', () => {
    const entries = buildSyncEntries({ ...baseArgs, sourceRef: 'v1.2.3' });

    expect(entries[0]).toMatchObject({ ref: 'v1.2.3' });
  });

  test('appends the symlink entry when agentsMd is true', () => {
    const entries = buildSyncEntries({ ...baseArgs, agentsMd: true });

    expect(entries).toEqual([
      {
        repo: 'awinogradov/code-assistants',
        source: 'rules/Bun.md',
        dest: 'CLAUDE.md',
      },
      {
        symlink: 'CLAUDE.md',
        dest: 'AGENTS.md',
      },
    ]);
  });

  test('symlink entry carries no extra fields', () => {
    const entries = buildSyncEntries({ ...baseArgs, agentsMd: true });
    const symlinkEntry = entries[1]!;

    expect(Object.keys(symlinkEntry).sort()).toEqual(['dest', 'symlink']);
  });

  test('preserves content-then-symlink order', () => {
    const entries = buildSyncEntries({ ...baseArgs, agentsMd: true, sourceRef: 'main' });

    expect(entries[0]).toMatchObject({ source: 'rules/Bun.md' });
    expect(entries[1]).toMatchObject({ symlink: 'CLAUDE.md' });
  });

  test('honors the rules value in the content source path', () => {
    const entries = buildSyncEntries({ ...baseArgs, rules: 'NodeJS+React+Tailwind' });

    expect(entries[0]).toMatchObject({ source: 'rules/NodeJS+React+Tailwind.md' });
  });
});
