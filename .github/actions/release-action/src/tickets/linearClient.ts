/**
 * Linear API client for fetching issue details
 *
 * Uses Linear GraphQL API to fetch issue information by identifier.
 *
 * @see https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 *
 * @example
 * ```typescript
 * import { createLinearClient } from "./linearClient.ts";
 *
 * const client = createLinearClient("lin_api_xxx");
 * const ticket = await client.fetchTicket("TEAM-123");
 * // → { id: "TEAM-123", title: "Add auth", url: "https://linear.app/...", system: "linear" }
 * ```
 */

import type { TicketClient, TicketInfo } from "./tickets.types.ts";

/** Linear GraphQL API endpoint */
const linearApiUrl = "https://api.linear.app/graphql";

/** GraphQL query to fetch issue by identifier */
const issueQuery = `
  query IssueByIdentifier($id: String!) {
    issue(id: $id) {
      identifier
      title
      description
      url
    }
  }
`;

/** Linear GraphQL response type */
interface LinearIssueResponse {
  data?: {
    issue?: {
      identifier: string;
      title: string;
      description: string | null;
      url: string;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Create a Linear API client
 *
 * @param apiKey - Linear API key (starts with lin_api_)
 * @returns TicketClient for fetching Linear issues
 *
 * @example
 * ```typescript
 * const client = createLinearClient(process.env.LINEAR_API_KEY);
 * const ticket = await client.fetchTicket("TEAM-123");
 * ```
 */
export function createLinearClient(apiKey: string): TicketClient {
  return {
    systemType: "linear",

    async fetchTicket(ticketId: string): Promise<TicketInfo | null> {
      const response = await fetch(linearApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({
          query: issueQuery,
          variables: { id: ticketId },
        }),
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as LinearIssueResponse;

      const firstError = result.errors?.[0];
      if (firstError) {
        const errorMessage = firstError.message;
        // Not found errors are expected for invalid ticket IDs
        if (errorMessage.includes("not found") || errorMessage.includes("Entity not found")) {
          return null;
        }
        throw new Error(`Linear API error: ${errorMessage}`);
      }

      const issue = result.data?.issue;
      if (!issue) {
        return null;
      }

      return {
        id: issue.identifier,
        title: issue.title,
        description: issue.description ?? undefined,
        url: issue.url,
        system: "linear",
      };
    },

    buildUrl(ticketId: string): string {
      // Linear URLs follow pattern: https://linear.app/team/issue/TEAM-123
      // We can't construct this without knowing the team slug, so return a search URL
      return `https://linear.app/issue/${ticketId}`;
    },
  };
}
