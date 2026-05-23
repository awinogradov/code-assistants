import { describe, expect, test } from 'bun:test';

import { isSymlinkEntry, parseFilesInput, parseRepoSlug } from './parseInputs.ts';

describe('parseFilesInput', () => {
  test('rejects empty input', () => {
    expect(() => parseFilesInput('')).toThrow(/FILES_INPUT is empty/);
    expect(() => parseFilesInput('   ')).toThrow(/FILES_INPUT is empty/);
  });

  test('parses a single legacy content entry unchanged (v1 regression)', () => {
    const yaml = `
- repo: owner/name
  source: rules/Bun.md
  dest: CLAUDE.md
`;
    const entries = parseFilesInput(yaml);

    expect(entries).toEqual([
      { repo: 'owner/name', source: 'rules/Bun.md', dest: 'CLAUDE.md' },
    ]);
  });

  test('parses a content entry with optional `ref`', () => {
    const yaml = `
- repo: owner/name
  source: README.md
  dest: README.md
  ref: v1.2.3
`;
    const entries = parseFilesInput(yaml);

    expect(entries[0]).toEqual({
      repo: 'owner/name',
      source: 'README.md',
      dest: 'README.md',
      ref: 'v1.2.3',
    });
  });

  test('parses a mixed payload (content + symlink)', () => {
    const yaml = `
- repo: owner/name
  source: rules/Bun.md
  dest: CLAUDE.md
- symlink: CLAUDE.md
  dest: AGENTS.md
`;
    const entries = parseFilesInput(yaml);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ source: 'rules/Bun.md', dest: 'CLAUDE.md' });
    expect(entries[1]).toEqual({ symlink: 'CLAUDE.md', dest: 'AGENTS.md' });
  });

  test('rejects an entry that mixes `source` and `symlink`', () => {
    const yaml = `
- repo: owner/name
  source: README.md
  symlink: README.md
  dest: AGENTS.md
`;
    expect(() => parseFilesInput(yaml)).toThrow(/Invalid files input/);
  });

  test('rejects an entry with neither `source` nor `symlink`', () => {
    const yaml = `
- dest: AGENTS.md
`;
    expect(() => parseFilesInput(yaml)).toThrow(/Invalid files input/);
  });

  test('rejects a content entry with bad repo slug', () => {
    const yaml = `
- repo: bad
  source: README.md
  dest: README.md
`;
    expect(() => parseFilesInput(yaml)).toThrow(/Invalid files input/);
    expect(() => parseFilesInput(yaml)).toThrow(/owner\/name/);
  });

  test('rejects a symlink entry with empty `symlink`', () => {
    const yaml = `
- symlink: ""
  dest: AGENTS.md
`;
    expect(() => parseFilesInput(yaml)).toThrow(/Invalid files input/);
  });

  test('rejects a symlink entry with empty `dest`', () => {
    const yaml = `
- symlink: CLAUDE.md
  dest: ""
`;
    expect(() => parseFilesInput(yaml)).toThrow(/Invalid files input/);
  });

  test('rejects an empty list', () => {
    expect(() => parseFilesInput('[]')).toThrow(/Invalid files input/);
    expect(() => parseFilesInput('[]')).toThrow(/at least one/);
  });
});

describe('isSymlinkEntry', () => {
  test('narrows correctly for symlink shape', () => {
    expect(isSymlinkEntry({ symlink: 'CLAUDE.md', dest: 'AGENTS.md' })).toBe(true);
  });

  test('returns false for content shape', () => {
    expect(
      isSymlinkEntry({ repo: 'owner/name', source: 'README.md', dest: 'README.md' }),
    ).toBe(false);
  });
});

describe('parseRepoSlug', () => {
  test('splits owner/name', () => {
    expect(parseRepoSlug('awinogradov/code-assistants')).toEqual({
      owner: 'awinogradov',
      name: 'code-assistants',
    });
  });

  test('throws on bare value', () => {
    expect(() => parseRepoSlug('bare')).toThrow(/Invalid repo slug/);
  });
});
