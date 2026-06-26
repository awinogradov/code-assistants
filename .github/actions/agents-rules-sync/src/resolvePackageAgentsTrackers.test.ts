import { describe, expect, test } from 'bun:test';

import {
  resolvePackageAgentsTrackers,
  trackersDocsUrl,
} from './resolvePackageAgentsTrackers.ts';

describe('resolvePackageAgentsTrackers', () => {
  test('rejects empty input with docs link', () => {
    expect(() => resolvePackageAgentsTrackers('')).toThrow(/11-linear-tracker\.md/);
  });

  test('rejects non-JSON input with docs link', () => {
    expect(() => resolvePackageAgentsTrackers('not json')).toThrow(/not valid JSON/);
    expect(() => resolvePackageAgentsTrackers('not json')).toThrow(trackersDocsUrl);
  });

  test('defaults to GitHub-only when `trackers` is absent', () => {
    const raw = JSON.stringify({ name: 'demo', agents: { rules: 'Bun' } });
    expect(resolvePackageAgentsTrackers(raw)).toEqual([{ type: 'github' }]);
  });

  test('defaults a single Linear entry `keys` to `[team]`', () => {
    const raw = JSON.stringify({ agents: { trackers: [{ type: 'linear', team: 'FRTNS' }] } });
    expect(resolvePackageAgentsTrackers(raw)).toEqual([
      { type: 'linear', team: 'FRTNS', keys: ['FRTNS'] },
    ]);
  });

  test('accepts two Linear teams side by side', () => {
    const raw = JSON.stringify({
      agents: {
        trackers: [
          { type: 'linear', team: 'FRTNS' },
          { type: 'linear', team: 'ENG' },
          { type: 'github' },
        ],
      },
    });
    expect(resolvePackageAgentsTrackers(raw)).toEqual([
      { type: 'linear', team: 'FRTNS', keys: ['FRTNS'] },
      { type: 'linear', team: 'ENG', keys: ['ENG'] },
      { type: 'github' },
    ]);
  });

  test('preserves explicit `keys` and routes multiple prefixes to one team', () => {
    const raw = JSON.stringify({
      agents: { trackers: [{ type: 'linear', team: 'ENG', keys: ['ENG', 'INF'], label: 'autopilot' }] },
    });
    expect(resolvePackageAgentsTrackers(raw)).toEqual([
      { type: 'linear', team: 'ENG', keys: ['ENG', 'INF'], label: 'autopilot' },
    ]);
  });

  test('rejects a Linear entry missing `team`, naming the path and docs link', () => {
    const raw = JSON.stringify({ agents: { trackers: [{ type: 'linear' }] } });
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(/agents\.trackers\.0\.team/);
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(trackersDocsUrl);
  });

  test('rejects a key prefix that routes to two trackers, naming the key', () => {
    const raw = JSON.stringify({
      agents: {
        trackers: [
          { type: 'linear', team: 'FRTNS', keys: ['ENG', 'INF'] },
          { type: 'linear', team: 'ENG' },
        ],
      },
    });
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(/"ENG"/);
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(/more than one Linear tracker/);
  });

  test('rejects more than one `github` tracker', () => {
    const raw = JSON.stringify({ agents: { trackers: [{ type: 'github' }, { type: 'github' }] } });
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(/Only one `github` tracker/);
  });

  test('rejects an unknown tracker `type`', () => {
    const raw = JSON.stringify({ agents: { trackers: [{ type: 'jira' }] } });
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(/agents\.trackers/);
  });

  test('rejects a lowercase `team`', () => {
    const raw = JSON.stringify({ agents: { trackers: [{ type: 'linear', team: 'frtns' }] } });
    expect(() => resolvePackageAgentsTrackers(raw)).toThrow(/uppercase letters/);
  });
});
