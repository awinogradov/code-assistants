/**
 * GitHub API client for fetching commits and pull request details
 *
 * Uses git commands for commit history and GitHub REST API for PR details.
 *
 * @example
 * ```typescript
 * import { getCommitsSinceLastTag, fetchPullRequest } from "./githubClient.ts";
 *
 * const commits = await getCommitsSinceLastTag(process.cwd());
 * const pr = await fetchPullRequest(45, "owner", "repo", "ghp_xxx");
 * ```
 */

import { $ } from "bun";

import { getLatestReachableTag } from "../gitTags.ts";

import type { CommitInfo, CommitScope, PullRequestInfo } from "./tickets.types.ts";
import { extractPrNumber } from "./ticketExtractor.ts";

/** GitHub API base URL */
const githubApiUrl = "https://api.github.com";

/**
 * Get all commits since the last reachable tag, optionally scoped to a member.
 *
 * Uses reachability-based discovery: finds the closest tag reachable from HEAD by commit
 * topology, not version number. This prevents picking a higher-versioned tag that sits on
 * an older commit (e.g. v1.0.0 before v0.16.1).
 *
 * @param cwd - Working directory
 * @param scope - Optional tag glob + path filter for monorepo per-member extraction.
 *   `tagPattern` defaults to `"v*"`; when `path` is set the range is restricted to
 *   commits touching that pathspec (resolved relative to `cwd`).
 * @returns Array of commit info with extracted PR numbers
 *
 * @example
 * ```typescript
 * const commits = await getCommitsSinceLastTag(process.cwd());
 * // → [{ sha: "abc123", message: "feat: add auth (#45)", prNumber: 45 }]
 *
 * // Monorepo: only commits touching the member path since its last tag
 * const memberCommits = await getCommitsSinceLastTag(repoRoot, {
 *   tagPattern: "release-action@v*",
 *   path: ".github/actions/release-action",
 * });
 * ```
 */
export async function getCommitsSinceLastTag(
  cwd: string,
  scope: CommitScope = {}
): Promise<CommitInfo[]> {
  const latestTag = await getLatestReachableTag(scope.tagPattern ?? "v*", cwd);

  // Get commits with format: SHA|message
  const format = "--format=%H|%s";
  const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
  const logResult = scope.path
    ? await $`git log ${range} ${format} -- ${scope.path}`.cwd(cwd).quiet().nothrow()
    : await $`git log ${range} ${format}`.cwd(cwd).quiet().nothrow();

  const lines = logResult.stdout.toString().trim().split("\n").filter(Boolean);

  const commits: CommitInfo[] = [];

  for (const line of lines) {
    const separatorIndex = line.indexOf("|");
    if (separatorIndex === -1) {
      continue;
    }

    const sha = line.substring(0, separatorIndex);
    const message = line.substring(separatorIndex + 1);
    const prNumber = extractPrNumber(message);

    commits.push({ sha, message, prNumber });
  }

  return commits;
}

/**
 * Fetch pull request details from GitHub API
 *
 * @param prNumber - Pull request number
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub token for authentication
 * @returns Pull request info or null if not found
 *
 * @example
 * ```typescript
 * const pr = await fetchPullRequest(45, "owner", "repo", "ghp_xxx");
 * // → { number: 45, title: "feat: TEAM-123 add auth", url: "...", author: "dev" }
 * ```
 */
export async function fetchPullRequest(
  prNumber: number,
  owner: string,
  repo: string,
  token: string
): Promise<PullRequestInfo | null> {
  const url = `${githubApiUrl}/repos/${owner}/${repo}/pulls/${prNumber}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "code-assistants-release-action",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: { login: string };
  };

  return {
    number: data.number,
    title: data.title,
    body: data.body ?? undefined,
    url: data.html_url,
    author: data.user.login,
  };
}

/**
 * Fetch multiple pull requests in parallel with rate limiting
 *
 * @param prNumbers - Array of PR numbers to fetch
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub token for authentication
 * @param concurrency - Max concurrent requests (default: 5)
 * @returns Map of PR number to PR info
 */
export async function fetchPullRequests(
  prNumbers: number[],
  owner: string,
  repo: string,
  token: string,
  concurrency = 5
): Promise<Map<number, PullRequestInfo>> {
  const results = new Map<number, PullRequestInfo>();
  const uniquePrNumbers = [...new Set(prNumbers)];

  // Process in batches for rate limiting
  for (let i = 0; i < uniquePrNumbers.length; i += concurrency) {
    const batch = uniquePrNumbers.slice(i, i + concurrency);
    const promises = batch.map(async (prNumber) => {
      const pr = await fetchPullRequest(prNumber, owner, repo, token);
      if (pr) {
        results.set(prNumber, pr);
      }
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * Fetch the pull request associated with a commit SHA
 *
 * Uses the GitHub API endpoint that returns PRs containing a specific commit.
 * Works for all merge strategies (squash, rebase, merge commit).
 *
 * @param commitSha - Full or abbreviated commit SHA
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub token for authentication
 * @returns Pull request info or null if no PR found
 *
 * @example
 * ```typescript
 * const pr = await fetchPullRequestForCommit("52ff2cd", "owner", "repo", "ghp_xxx");
 * // → { number: 44, title: "ARCH-90: Add feature", url: "...", author: "dev" }
 * ```
 */
export async function fetchPullRequestForCommit(
  commitSha: string,
  owner: string,
  repo: string,
  token: string
): Promise<PullRequestInfo | null> {
  const url = `${githubApiUrl}/repos/${owner}/${repo}/commits/${commitSha}/pulls`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "code-assistants-release-action",
    },
  });

  if (!response.ok) {
    // 404 → commit has no associated PR (legitimate "no data"). Anything else
    // (401, 403, 429, 5xx) is an operational failure that must surface so the
    // release doesn't silently lose ticket data.
    if (response.status === 404) return null;
    throw new Error(
      `GitHub API error fetching PR for commit ${commitSha}: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as Array<{
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: { login: string };
  }>;

  // Return the first (most recent) PR associated with this commit
  const [firstPr] = data;
  if (!firstPr) {
    return null;
  }

  return {
    number: firstPr.number,
    title: firstPr.title,
    body: firstPr.body ?? undefined,
    url: firstPr.html_url,
    author: firstPr.user.login,
  };
}

/**
 * Fetch pull requests for multiple commits in parallel
 *
 * @param commitShas - Array of commit SHAs
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub token for authentication
 * @param concurrency - Max concurrent requests (default: 5)
 * @returns Map of commit SHA to PR info
 */
export async function fetchPullRequestsForCommits(
  commitShas: string[],
  owner: string,
  repo: string,
  token: string,
  concurrency = 5
): Promise<Map<string, PullRequestInfo>> {
  const results = new Map<string, PullRequestInfo>();
  const uniqueShas = [...new Set(commitShas)];

  // Process in batches for rate limiting
  for (let i = 0; i < uniqueShas.length; i += concurrency) {
    const batch = uniqueShas.slice(i, i + concurrency);
    const promises = batch.map(async (sha) => {
      const pr = await fetchPullRequestForCommit(sha, owner, repo, token);
      if (pr) {
        results.set(sha, pr);
      }
    });
    await Promise.all(promises);
  }

  return results;
}
