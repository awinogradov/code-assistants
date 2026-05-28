import { describe, expect, mock, test } from 'bun:test';

import { resolveBotIdentity } from './botIdentity.ts';

function makeOctokit(
  getByUsername: (args: { username: string }) => Promise<{ data: { id: number } }>,
) {
  return { rest: { users: { getByUsername } } };
}

describe('resolveBotIdentity', () => {
  test('defaults to github-actions[bot] without a lookup when username is empty', async () => {
    const getByUsername = mock(async () => ({ data: { id: 999 } }));
    const octokit = makeOctokit(getByUsername);
    const expected = {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com',
    };

    expect(await resolveBotIdentity(octokit)).toEqual(expected);
    expect(await resolveBotIdentity(octokit, '   ')).toEqual(expected);
    expect(getByUsername).not.toHaveBeenCalled();
  });

  test('resolves a custom username to its real GitHub user id', async () => {
    const getByUsername = mock(async ({ username }: { username: string }) => {
      expect(username).toBe('symbiot-bot');
      return { data: { id: 123456 } };
    });

    expect(await resolveBotIdentity(makeOctokit(getByUsername), '  symbiot-bot  ')).toEqual({
      name: 'symbiot-bot',
      email: '123456+symbiot-bot@users.noreply.github.com',
    });
  });

  test('falls back to the github-actions[bot] id when the lookup fails', async () => {
    const getByUsername = mock(async () => {
      throw new Error('404');
    });

    expect(await resolveBotIdentity(makeOctokit(getByUsername), 'ghost-bot')).toEqual({
      name: 'ghost-bot',
      email: '41898282+ghost-bot@users.noreply.github.com',
    });
  });
});
