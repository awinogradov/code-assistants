// Zero-dependency Linear GraphQL client for the autopilot plugin.
//
// Ported from .github/actions/release-action/src/tickets/linearClient.ts, with the
// IssueByIdentifier query extended to also return state, labels, assignee, and
// comments so the output matches the resolve-issue-context JSON contract. Uses the
// global `fetch` (Node 18+), so there is no install step and no dependency tree.
//
// The plugin bundles no Linear MCP server, so this client is the agents' only
// Linear read path (interactive and headless/CI alike), keyed by LINEAR_API_KEY.

const linearApiUrl = "https://api.linear.app/graphql";

const issueQuery = `
  query IssueByIdentifier($id: String!) {
    issue(id: $id) {
      identifier
      title
      url
      description
      state { name }
      labels { nodes { name } }
      comments(orderBy: createdAt) { nodes { user { displayName } createdAt body } }
    }
  }
`;

const teamMembersQuery = `
  query TeamMembers($team: String!) {
    viewer { id name displayName }
    teams(filter: { key: { eq: $team } }) {
      nodes { members { nodes { id name displayName active } } }
    }
  }
`;

/**
 * Create a Linear API client.
 *
 * @param {string} apiKey - Linear API key (starts with `lin_api_`).
 * @returns {{ fetchIssue: (id: string) => Promise<object|null>, fetchTeamMembers: (team: string) => Promise<object|null> }}
 */
export function createLinearClient(apiKey) {
  const query = async (queryText, variables) => {
    const response = await fetch(linearApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: queryText, variables }),
    });

    if (!response.ok) {
      throw new Error("Linear API request failed", {
        cause: { status: response.status, statusText: response.statusText },
      });
    }

    const result = await response.json();
    const firstError = result.errors?.[0];
    if (firstError) {
      const { message } = firstError;
      if (message.includes("not found") || message.includes("Entity not found")) {
        return null;
      }
      throw new Error("Linear API returned a GraphQL error", { cause: { message } });
    }

    return result.data ?? null;
  };

  return {
    async fetchIssue(id) {
      const data = await query(issueQuery, { id });
      return data?.issue ?? null;
    },
    async fetchTeamMembers(team) {
      const data = await query(teamMembersQuery, { team });
      // An unknown team key yields an empty nodes array, not a GraphQL error.
      const teamNode = data?.teams?.nodes?.[0];
      if (!teamNode) return null;
      return { viewer: data?.viewer ?? null, members: teamNode.members?.nodes ?? [] };
    },
  };
}
