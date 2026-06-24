// Zero-dependency Linear GraphQL client for the autopilot plugin.
//
// Ported from .github/actions/release-action/src/tickets/linearClient.ts, with the
// IssueByIdentifier query extended to also return state, labels, assignee, and
// comments so the output matches the resolve-issue-context JSON contract. Uses the
// global `fetch` (Node 18+), so there is no install step and no dependency tree.
//
// Used only as a headless/CI fallback when the Linear MCP server is unavailable;
// interactive sessions go through mcp__plugin_autopilot_linear__* instead.

const linearApiUrl = "https://api.linear.app/graphql";

const issueQuery = `
  query IssueByIdentifier($id: String!) {
    issue(id: $id) {
      identifier
      title
      description
      url
      state { name }
      assignee { displayName }
      labels { nodes { name } }
      comments { nodes { user { displayName } createdAt body } }
    }
  }
`;

/**
 * Create a Linear API client.
 *
 * @param {string} apiKey - Linear API key (starts with `lin_api_`).
 * @returns {{ fetchIssue: (id: string) => Promise<object|null> }}
 */
export function createLinearClient(apiKey) {
  return {
    async fetchIssue(id) {
      const response = await fetch(linearApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({ query: issueQuery, variables: { id } }),
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const firstError = result.errors?.[0];
      if (firstError) {
        const message = firstError.message;
        if (message.includes("not found") || message.includes("Entity not found")) {
          return null;
        }
        throw new Error(`Linear API error: ${message}`);
      }

      return result.data?.issue ?? null;
    },
  };
}
