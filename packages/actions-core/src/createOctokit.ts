/**
 * Build an authenticated Octokit client that retries transient GitHub failures.
 *
 * GitHub occasionally answers a perfectly valid API call with a 5xx (the "Unicorn"
 * error page) or drops the connection. A single such blip is enough to fail an
 * entire scheduled sync run, so every client that talks to the API on an
 * unattended code path should be built here rather than with a bare `new Octokit`.
 * The retry plugin backs off and re-issues the request; it deliberately does not
 * retry 4xx statuses, so a genuine 404 still surfaces immediately.
 *
 * @example
 *   const octokit = createOctokit(token);
 *   await octokit.rest.repos.getCommit({ owner, repo, ref });
 */

import { retry } from "@octokit/plugin-retry";
import { Octokit } from "@octokit/rest";

const RetryingOctokit = Octokit.plugin(retry);

export function createOctokit(token: string): Octokit {
  return new RetryingOctokit({ auth: token });
}
