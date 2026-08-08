import { describe, expect, test } from 'bun:test';

import { buildSkillSyncEntries } from './buildSkillSyncEntries.ts';

const baseArgs = {
  sourceRepo: 'awinogradov/code-assistants',
  sourceRef: '',
  files: [
    'claude-plugins/autopilot/skills/run/SKILL.md',
    'claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md',
  ],
};

describe('buildSkillSyncEntries', () => {
  test('maps each source file verbatim to its .agents/skills destination', () => {
    expect(buildSkillSyncEntries(baseArgs)).toEqual([
      {
        repo: 'awinogradov/code-assistants',
        source: 'claude-plugins/autopilot/skills/run/SKILL.md',
        dest: '.agents/skills/run/SKILL.md',
      },
      {
        repo: 'awinogradov/code-assistants',
        source: 'claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md',
        dest: '.agents/skills/shared-rules/references/repomix-snapshot.md',
      },
    ]);
  });

  test('omits `ref` when sourceRef is empty', () => {
    expect(buildSkillSyncEntries(baseArgs)[0]).not.toHaveProperty('ref');
  });

  test('includes `ref` on every entry when sourceRef is provided', () => {
    const entries = buildSkillSyncEntries({ ...baseArgs, sourceRef: 'v1.2.3' });
    for (const entry of entries) {
      expect(entry).toMatchObject({ ref: 'v1.2.3' });
    }
  });

  test('preserves nested reference paths under the skill directory', () => {
    const entries = buildSkillSyncEntries({
      ...baseArgs,
      files: ['claude-plugins/autopilot/skills/pr-review/references/checks-security.md'],
    });
    expect(entries[0]).toMatchObject({
      dest: '.agents/skills/pr-review/references/checks-security.md',
    });
  });

  test('drops paths outside the skills layout', () => {
    const entries = buildSkillSyncEntries({
      ...baseArgs,
      files: ['rules/Bun.md', 'claude-plugins/autopilot/agents/expert-review.md'],
    });
    expect(entries).toEqual([]);
  });
});
