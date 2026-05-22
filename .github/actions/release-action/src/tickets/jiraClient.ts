/**
 * Jira API client for fetching issue details
 *
 * Uses Jira REST API v3 to fetch issue information.
 *
 * @see https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 *
 * @example
 * ```typescript
 * import { createJiraClient } from "./jiraClient.ts";
 *
 * const client = createJiraClient(
 *   "https://company.atlassian.net",
 *   "user@company.com",
 *   "api_token"
 * );
 * const ticket = await client.fetchTicket("PROJ-123");
 * ```
 */

import type { TicketClient, TicketInfo } from "./tickets.types.ts";

/** ADF content node (simplified) */
interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

/** Jira issue response type */
interface JiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    description?: {
      type: string;
      content?: AdfNode[];
    } | null;
  };
}

/**
 * Extract plain text from Jira ADF (Atlassian Document Format)
 *
 * @param adf - ADF document object
 * @returns Plain text content
 */
function extractTextFromAdf(adf: { content?: AdfNode[] } | null | undefined): string {
  if (!adf?.content) {
    return "";
  }

  const texts: string[] = [];

  function traverse(nodes: AdfNode[]): void {
    for (const node of nodes) {
      if (node.text) {
        texts.push(node.text);
      }
      if (node.content) {
        traverse(node.content);
      }
    }
  }

  traverse(adf.content);
  return texts.join(" ").trim();
}

/**
 * Create a Jira API client
 *
 * @param baseUrl - Jira instance URL (e.g., https://company.atlassian.net)
 * @param email - User email for authentication
 * @param apiToken - Jira API token
 * @returns TicketClient for fetching Jira issues
 *
 * @example
 * ```typescript
 * const client = createJiraClient(
 *   process.env.JIRA_BASE_URL,
 *   process.env.JIRA_EMAIL,
 *   process.env.JIRA_API_TOKEN
 * );
 * ```
 */
export function createJiraClient(baseUrl: string, email: string, apiToken: string): TicketClient {
  // Remove trailing slash from base URL
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const authHeader = `Basic ${btoa(`${email}:${apiToken}`)}`;

  return {
    systemType: "jira",

    async fetchTicket(ticketId: string): Promise<TicketInfo | null> {
      const url = `${normalizedBaseUrl}/rest/api/3/issue/${ticketId}?fields=summary,description`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: authHeader,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
      }

      const issue = (await response.json()) as JiraIssueResponse;
      const description = extractTextFromAdf(issue.fields.description);

      return {
        id: issue.key,
        title: issue.fields.summary,
        description: description || undefined,
        url: `${normalizedBaseUrl}/browse/${issue.key}`,
        system: "jira",
      };
    },

    buildUrl(ticketId: string): string {
      return `${normalizedBaseUrl}/browse/${ticketId}`;
    },
  };
}
