/**
 * Git author/committer identity for files-sync commits.
 *
 * @see https://github.com/awinogradov/code-assistants/blob/main/.github/actions/files-sync/README.md
 */
export interface BotIdentity {
  name: string;
  email: string;
}

const defaultUsername = 'github-actions[bot]';
const defaultUserId = '41898282';

/**
 * Resolves the git identity used to author sync commits.
 *
 * Decouples commit attribution from the `bot_token` owner: regardless of whose PAT
 * authenticates the Git Data API call, commits are authored by the configured
 * `bot_username`, falling back to GitHub's native `github-actions[bot]` when unset.
 *
 * @param username - The `bot_username` action input (`INPUT_BOT_USERNAME`). Empty or
 *   whitespace-only values fall back to `github-actions[bot]`.
 * @returns The resolved `{ name, email }`, where `email` is the `<uid>+<name>` GitHub noreply address.
 *
 * @example
 *   resolveBotIdentity('symbiot-bot');
 *   // → { name: 'symbiot-bot', email: '41898282+symbiot-bot@users.noreply.github.com' }
 *   resolveBotIdentity();
 *   // → { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }
 */
export function resolveBotIdentity(username?: string): BotIdentity {
  const name = username?.trim() || defaultUsername;

  return { name, email: `${defaultUserId}+${name}@users.noreply.github.com` };
}
