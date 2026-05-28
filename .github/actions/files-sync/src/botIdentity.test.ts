import { describe, expect, test } from 'bun:test';

import { resolveBotIdentity } from './botIdentity.ts';

describe('resolveBotIdentity', () => {
  const defaultIdentity = {
    name: 'github-actions[bot]',
    email: '41898282+github-actions[bot]@users.noreply.github.com',
  };

  test('falls back to github-actions[bot] when username is undefined', () => {
    expect(resolveBotIdentity()).toEqual(defaultIdentity);
  });

  test('falls back to github-actions[bot] for an empty or whitespace username', () => {
    expect(resolveBotIdentity('')).toEqual(defaultIdentity);
    expect(resolveBotIdentity('   ')).toEqual(defaultIdentity);
  });

  test('uses the provided username and derives the noreply email', () => {
    expect(resolveBotIdentity('symbiot-bot')).toEqual({
      name: 'symbiot-bot',
      email: '41898282+symbiot-bot@users.noreply.github.com',
    });
  });

  test('trims surrounding whitespace from the username', () => {
    expect(resolveBotIdentity('  symbiot-bot  ')).toEqual({
      name: 'symbiot-bot',
      email: '41898282+symbiot-bot@users.noreply.github.com',
    });
  });
});
