import { describe, expect, test } from 'bun:test';

import { buildSkillSyncEntries } from './buildSkillSyncEntries.ts';

const baseArgs = {
  sourceRepo: 'awinogradov/code-assistants',
  sourceRef: '',
  files: ['agent-skills/README.md', 'agent-skills/autopilot-run/SKILL.md'],
};

describe('buildSkillSyncEntries', () => {
  test('maps each source file to its .agents/skills destination', () => {
    expect(buildSkillSyncEntries(baseArgs)).toEqual([
      {
        repo: 'awinogradov/code-assistants',
        source: 'agent-skills/README.md',
        dest: '.agents/skills/README.md',
      },
      {
        repo: 'awinogradov/code-assistants',
        source: 'agent-skills/autopilot-run/SKILL.md',
        dest: '.agents/skills/autopilot-run/SKILL.md',
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
      files: ['agent-skills/autopilot-pr-review/references/checks-security.md'],
    });
    expect(entries[0]).toMatchObject({
      dest: '.agents/skills/autopilot-pr-review/references/checks-security.md',
    });
  });

  test('drops paths outside the agent-skills layout', () => {
    const entries = buildSkillSyncEntries({ ...baseArgs, files: ['rules/Bun.md'] });
    expect(entries).toEqual([]);
  });
});
