import { describe, expect, test } from 'bun:test';

import {
  agentsFieldDocsUrl,
  agentsRulesValues,
  resolvePackageAgentsRules,
} from './resolvePackageAgentsRules.ts';

describe('resolvePackageAgentsRules', () => {
  test('rejects empty input with docs link', () => {
    expect(() => resolvePackageAgentsRules('')).toThrow(/agents-field\.md/);
  });

  test('rejects non-JSON input', () => {
    expect(() => resolvePackageAgentsRules('not json')).toThrow(/not valid JSON/);
  });

  test('rejects package.json without `agents`', () => {
    const raw = JSON.stringify({ name: 'demo' });
    expect(() => resolvePackageAgentsRules(raw)).toThrow(/Missing `agents.rules`/);
    expect(() => resolvePackageAgentsRules(raw)).toThrow(agentsFieldDocsUrl);
  });

  test('rejects package.json without `agents.rules`', () => {
    const raw = JSON.stringify({ name: 'demo', agents: { language: 'typescript' } });
    expect(() => resolvePackageAgentsRules(raw)).toThrow(/Missing `agents.rules`/);
    expect(() => resolvePackageAgentsRules(raw)).toThrow(agentsFieldDocsUrl);
  });

  test('rejects unrecognized `agents.rules` value and lists allowed values', () => {
    const raw = JSON.stringify({ agents: { rules: 'Deno' } });
    expect(() => resolvePackageAgentsRules(raw)).toThrow(/Invalid `agents.rules`/);
    for (const value of agentsRulesValues) {
      expect(() => resolvePackageAgentsRules(raw)).toThrow(new RegExp(`"${value.replace(/\+/g, '\\+')}"`));
    }
  });

  for (const value of agentsRulesValues) {
    test(`resolves valid value "${value}"`, () => {
      const raw = JSON.stringify({ name: 'demo', agents: { rules: value } });
      expect(resolvePackageAgentsRules(raw)).toBe(value);
    });
  }

  test('ignores extra fields on `agents` and root', () => {
    const raw = JSON.stringify({
      name: 'demo',
      version: '1.0.0',
      agents: { rules: 'Bun', language: 'typescript' },
    });
    expect(resolvePackageAgentsRules(raw)).toBe('Bun');
  });
});
