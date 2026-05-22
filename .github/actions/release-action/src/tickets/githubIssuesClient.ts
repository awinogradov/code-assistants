/**
 * GitHub Issues client for fetching issue details
 *
 * Uses GitHub REST API to fetch issue information.
 * GitHub Issues use #123 format instead of PREFIX-123.
 *
 * @example
 * ```typescript
 * import { createGithubIssuesClient } from "./githubIssuesClient.ts";
 *
 * const client = createGithubIssuesClient("owner", "repo", "ghp_xxx");
 * const ticket = await client.fetchTicket("123");
 * ```
 */

import type { TicketClient, TicketInfo } from "./tickets.types.ts";

/** GitHub API base URL */
const githubApiUrl = "https://api.github.com";

/** GitHub issue response type (includes pull_request field when item is a PR) */
interface GithubIssueResponse {
  number: number;
  title: string;
  html_url: string;
  /** Present when the item is a pull request, not a true issue */
  pull_request?: {
    url: string;
    html_url: string;
  };
}

/**
 * Create a GitHub Issues client
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub token for authentication
 * @returns TicketClient for fetching GitHub issues
 *
 * @example
 * ```typescript
 * const client = createGithubIssuesClient("owner", "repo", process.env.GITHUB_TOKEN);
 * const ticket = await client.fetchTicket("123");
 * ```
 */
export function createGithubIssuesClient(owner: string, repo: string, token: string): TicketClient {
  return {
    systemType: "github",

    async fetchTicket(ticketId: string): Promise<TicketInfo | null> {
      // Remove # prefix if present
      const issueNumber = ticketId.replace(/^#/, "");
      const url = `${githubApiUrl}/repos/${owner}/${repo}/issues/${issueNumber}`;

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

      const issue = (await response.json()) as GithubIssueResponse;

      // GitHub Issues API returns PRs too — filter them out
      if (issue.pull_request) {
        return null;
      }

      return {
        id: `#${issue.number}`,
        title: issue.title,
        url: issue.html_url,
        system: "github",
      };
    },

    buildUrl(ticketId: string): string {
      const issueNumber = ticketId.replace(/^#/, "");
      return `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
    },
  };
}

/**
 * Pattern to extract GitHub issue references (#123)
 *
 * Note: This differs from PR extraction pattern which requires (#123) at end of line.
 * This pattern matches #123 anywhere in text (except in URLs or #comments).
 */
export const githubIssuePattern = /(?<![/\w])#(\d+)\b/g;

/**
 * Extract GitHub issue numbers from text
 *
 * @param text - Text to search for issue references
 * @param excludePrNumbers - Optional set of known PR numbers to exclude from results
 * @returns Array of issue numbers (without # prefix)
 *
 * @example
 * ```typescript
 * extractGithubIssueNumbers("Fixes #123 and relates to #456");
 * // → ["123", "456"]
 *
 * // Exclude known PR numbers to avoid misclassification
 * extractGithubIssueNumbers("Refs #273 and fixes #42", new Set([273]));
 * // → ["42"]
 * ```
 */
export function extractGithubIssueNumbers(text: string, excludePrNumbers?: Set<number>): string[] {
  const matches: string[] = [];
  let match;

  // Reset regex state
  githubIssuePattern.lastIndex = 0;

  while ((match = githubIssuePattern.exec(text)) !== null) {
    const [, issueNumber] = match;
    if (issueNumber) {
      matches.push(issueNumber);
    }
  }

  const unique = [...new Set(matches)];
  if (!excludePrNumbers || excludePrNumbers.size === 0) {
    return unique;
  }
  return unique.filter((num) => !excludePrNumbers.has(Number(num)));
}
