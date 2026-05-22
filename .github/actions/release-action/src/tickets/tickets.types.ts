/**
 * Type definitions for ticket system integration
 *
 * @example
 * ```typescript
 * import type { TicketConfig, TicketInfo } from "./tickets.types.ts";
 *
 * const config: TicketConfig = {
 *   systems: [{ type: "linear", keys: ["TEAM", "PROJ"] }],
 *   owner: "org",
 *   repo: "repo",
 * };
 * ```
 */

/** Supported ticket system types */
export type TicketSystemType = "linear" | "jira" | "github";

/**
 * Single ticket system configuration
 *
 * @example
 * ```typescript
 * // Match only TEAM-* and PROJ-* tickets in Linear
 * const linear: TicketSystemEntry = { type: "linear", keys: ["TEAM", "PROJ"] };
 *
 * // Match any UPPERCASE-123 pattern in Jira
 * const jira: TicketSystemEntry = { type: "jira" };
 * ```
 */
export interface TicketSystemEntry {
  /** Ticket system type */
  type: TicketSystemType;
  /** Optional key prefixes to match (e.g., ["TEAM", "PROJ"]). If omitted, matches any UPPERCASE-123 */
  keys?: string[];
}

/**
 * Full ticket configuration
 *
 * @example
 * ```typescript
 * const config: TicketConfig = {
 *   systems: [
 *     { type: "linear", keys: ["TEAM"] },
 *     { type: "jira", keys: ["CORE"] },
 *   ],
 *   owner: "myorg",
 *   repo: "myrepo",
 * };
 * ```
 */
export interface TicketConfig {
  /** Ticket systems to use (supports multiple) */
  systems: TicketSystemEntry[];
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
}

/** Environment variables for ticket system authentication */
export interface TicketEnvVars {
  /** GitHub token for PR/commit access */
  githubToken?: string;
  /** Linear API key */
  linearApiKey?: string;
  /** Jira base URL (e.g., https://company.atlassian.net) */
  jiraBaseUrl?: string;
  /** Jira user email */
  jiraEmail?: string;
  /** Jira API token */
  jiraApiToken?: string;
}

/**
 * Ticket extracted from PR/commit text before API lookup
 *
 * @see {@link TicketInfo} for fetched ticket with title
 */
export interface ExtractedTicket {
  /** Ticket ID (e.g., TEAM-123) or issue number for GitHub */
  id: string | number;
  /** Which system this ticket belongs to */
  system: TicketSystemType;
  /** Source PR number if available */
  prNumber?: number;
  /** PR author username */
  prAuthor?: string;
  /** PR URL */
  prUrl?: string;
  /** Original commit message */
  commitMessage?: string;
  /** Commit SHA */
  commitSha?: string;
}

/**
 * Full ticket information after API lookup
 *
 * @example
 * ```typescript
 * const ticket: TicketInfo = {
 *   id: "TEAM-123",
 *   title: "Add authentication",
 *   url: "https://linear.app/team/issue/TEAM-123",
 *   system: "linear",
 *   prNumber: 45,
 *   prAuthor: "developer",
 *   prUrl: "https://github.com/org/repo/pull/45",
 * };
 * ```
 */
export interface TicketInfo {
  /** Ticket ID (e.g., TEAM-123) */
  id: string;
  /** Ticket title from the system */
  title: string;
  /** Ticket description from the system */
  description?: string;
  /** Direct URL to the ticket */
  url: string;
  /** Which system this ticket is from */
  system: TicketSystemType;
  /** Source PR number if available */
  prNumber?: number;
  /** PR author username */
  prAuthor?: string;
  /** PR URL */
  prUrl?: string;
  /** Commits associated with this ticket */
  commits?: Array<{ message: string; sha: string }>;
}

/**
 * Client interface for fetching ticket details from a system
 *
 * @example
 * ```typescript
 * const client: TicketClient = createLinearClient(apiKey);
 * const ticket = await client.fetchTicket("TEAM-123");
 * const url = client.buildUrl("TEAM-123");
 * ```
 */
export interface TicketClient {
  /** System type this client handles */
  systemType: TicketSystemType;
  /** Fetch ticket details from the system */
  fetchTicket: (ticketId: string) => Promise<TicketInfo | null>;
  /** Build URL for a ticket ID */
  buildUrl: (ticketId: string) => string;
}

/** Git commit information */
export interface CommitInfo {
  /** Commit SHA */
  sha: string;
  /** Commit message */
  message: string;
  /** Extracted PR number from message (squash merge format) */
  prNumber?: number;
}

/** Pull request information from GitHub API */
export interface PullRequestInfo {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR body/description (may contain issue references like "Resolve #34") */
  body?: string;
  /** PR URL */
  url: string;
  /** Author username */
  author: string;
}

/**
 * Options for generating tickets section
 *
 * @see {@link generateTicketsSection}
 */
export interface GenerateTicketsSectionOptions {
  /** Ticket configuration */
  config: TicketConfig;
  /** Environment variables with API keys */
  env: TicketEnvVars;
  /** Working directory */
  cwd?: string;
}

/** Result of generating tickets section */
export interface GenerateTicketsSectionResult {
  /** Generated markdown section */
  markdown: string;
  /** Raw ticket data for JSON export */
  tickets: TicketInfo[];
  /** PR descriptions for AI release notes context */
  prDescriptions: PrDescription[];
  /** Warnings encountered during generation */
  warnings: string[];
}

/** PR description content for AI release notes generation */
export interface PrDescription {
  /** PR number */
  prNumber: number;
  /** PR title */
  title: string;
  /** Extracted release notes section, or truncated full body */
  content: string;
  /** PR author */
  author: string;
}
