/**
 * Fetch raw file content from a GitHub repository via the contents API.
 *
 * Returns `null` when the file is not found (HTTP 404). All other HTTP errors
 * are re-thrown with a descriptive message that includes the resource path.
 *
 * @example
 *   const raw = await fetchRawContent({
 *     octokit,
 *     owner: 'awinogradov',
 *     repo: 'code-assistants',
 *     path: 'rules/Bun.md',
 *   });
 */

import type { Octokit } from '@octokit/rest';
import type { RequestError } from '@octokit/request-error';

interface FetchRawContentArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export async function fetchRawContent({
  octokit,
  owner,
  repo,
  path,
  ref,
}: FetchRawContentArgs): Promise<string | null> {
  try {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner,
        repo,
        path,
        ref,
        headers: { accept: 'application/vnd.github.raw' },
      },
    );

    if (typeof response.data !== 'string') {
      throw new Error(
        `Expected raw string content from ${owner}/${repo}:${path}${ref ? `@${ref}` : ''}, got ${typeof response.data}`,
      );
    }

    return response.data;
  } catch (error) {
    const requestError = error as RequestError;

    if (requestError.status === 404) {
      return null;
    }

    throw new Error(
      `Failed to fetch ${owner}/${repo}:${path}${ref ? `@${ref}` : ''}: ${requestError.message}`,
    );
  }
}
