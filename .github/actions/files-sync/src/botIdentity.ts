/**
 * Git author/committer identity for files-sync commits.
 *
 * @see https://github.com/awinogradov/code-assistants/blob/main/.github/actions/files-sync/README.md
 */
export interface BotIdentity {
  name: string;
  email: string;
}

/** Minimal Octokit surface needed to resolve a GitHub user's numeric id. */
interface UserLookup {
  rest: {
    users: {
      getByUsername: (args: { username: string }) => Promise<{ data: { id: number } }>;
    };
  };
}

const defaultUsername = 'github-actions[bot]';
const defaultUserId = '41898282';

function buildIdentity(name: string, userId: string): BotIdentity {
  return { name, email: `${userId}+${name}@users.noreply.github.com` };
}

/**
 * Resolves the git identity used to author sync commits, decoupling attribution
 * from the `bot_token` owner.
 *
 * The numeric id in the noreply email is read from the live GitHub API so a custom
 * `bot_username` links to its real account. `github-actions[bot]` uses its well-known
 * id without a lookup, and any lookup failure falls back to that id.
 *
 * @param octokit - Authenticated client used to look up the user id.
 * @param username - The `bot_username` action input. Empty/whitespace falls back to `github-actions[bot]`.
 *
 * @example
 *   await resolveBotIdentity(octokit, 'symbiot-bot');
 *   // → { name: 'symbiot-bot', email: '123456+symbiot-bot@users.noreply.github.com' }
 *   await resolveBotIdentity(octokit);
 *   // → { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }
 */
export async function resolveBotIdentity(octokit: UserLookup, username?: string): Promise<BotIdentity> {
  const name = username?.trim() || defaultUsername;

  if (name === defaultUsername) {
    return buildIdentity(name, defaultUserId);
  }

  try {
    const { data } = await octokit.rest.users.getByUsername({ username: name });
    return buildIdentity(name, String(data.id));
  } catch {
    return buildIdentity(name, defaultUserId);
  }
}
