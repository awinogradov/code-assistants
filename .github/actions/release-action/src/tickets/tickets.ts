/**
 * Ticket system integration orchestrator
 *
 * Coordinates extraction of ticket IDs from commits/PRs and fetching
 * ticket details from configured systems (Linear, Jira, GitHub Issues).
 *
 * @example
 * ```typescript
 * import { generateTicketsSection } from "./tickets.ts";
 *
 * const result = await generateTicketsSection({
 *   config: {
 *     systems: [{ type: "linear", keys: ["TEAM"] }],
 *     owner: "org",
 *     repo: "repo",
 *   },
 *   env: { githubToken: "ghp_xxx", linearApiKey: "lin_xxx" },
 * });
 *
 * console.log(result.markdown);
 * // ## Linear
 * //
 * // | Issue | PR | Author |
 * // | --- | --- | --- |
 * // | [TEAM-123: Add auth](url) | [#10](pr_url) | @author |
 * ```
 */

import type {
  ExtractedTicket,
  GenerateTicketsSectionOptions,
  GenerateTicketsSectionResult,
  PrDescription,
  PullRequestInfo,
  TicketClient,
  TicketConfig,
  TicketEnvVars,
  TicketInfo,
  TicketSystemEntry,
  TicketSystemType,
} from "./tickets.types.ts";
import { extractTicketIds, getAllKeys, mapTicketToSystem } from "./ticketExtractor.ts";
import { extractGithubIssueNumbers } from "./githubIssuesClient.ts";
import { fetchPullRequestsForCommits, getCommitsSinceLastTag } from "./githubClient.ts";
import { createLinearClient } from "./linearClient.ts";
import { createJiraClient } from "./jiraClient.ts";
import { createGithubIssuesClient } from "./githubIssuesClient.ts";

/**
 * Create a ticket client for a system based on environment variables
 *
 * @param system - System configuration
 * @param env - Environment variables with API keys
 * @param config - Full ticket configuration (for GitHub Issues)
 * @returns TicketClient or null if credentials missing
 */
export function createTicketClient(
  system: TicketSystemEntry,
  env: TicketEnvVars,
  config: TicketConfig
): TicketClient | null {
  switch (system.type) {
    case "linear": {
      if (!env.linearApiKey) {
        return null;
      }
      return createLinearClient(env.linearApiKey);
    }
    case "jira": {
      if (!env.jiraBaseUrl || !env.jiraEmail || !env.jiraApiToken) {
        return null;
      }
      return createJiraClient(env.jiraBaseUrl, env.jiraEmail, env.jiraApiToken);
    }
    case "github": {
      if (!env.githubToken) {
        return null;
      }
      return createGithubIssuesClient(config.owner, config.repo, env.githubToken);
    }
  }
}

/**
 * Format tickets into a markdown table
 *
 * Formatting differs by system type:
 * - Linear/Jira: Uses markdown links since GitHub doesn't auto-link these IDs
 * - GitHub Issues: Uses bare #N since GitHub auto-links and shows preview
 *
 * @param tickets - Array of ticket info
 * @param systemName - Display name for the system
 * @param _owner - GitHub repository owner (unused, kept for API compatibility)
 * @param _repo - GitHub repository name (unused, kept for API compatibility)
 * @returns Formatted markdown string
 *
 * @example Linear/Jira
 * ```markdown
 * ## Linear
 *
 * | Issue | PR | Author |
 * | --- | --- | --- |
 * | [ARCH-90: Title](https://linear.app/...) | [#44](https://github.com/org/repo/pull/44) | @author |
 * ```
 *
 * @example GitHub Issues
 * ```markdown
 * ## GitHub Issues
 *
 * | Issue | PR | Author |
 * | --- | --- | --- |
 * | #40 | [#42](https://github.com/org/repo/pull/42) | @developer |
 * ```
 */
export function formatTicketsMarkdown(
  tickets: TicketInfo[],
  systemName: string,
  _owner: string,
  _repo: string
): string {
  if (tickets.length === 0) {
    return "";
  }

  const lines = [`## ${systemName}`, "", "| Issue | PR | Author |", "| --- | --- | --- |"];

  for (const ticket of tickets) {
    let issueCell: string;

    if (ticket.system === "github") {
      const issueId = String(ticket.id).replace(/^#/, "");
      issueCell = `#${issueId}`;
    } else {
      issueCell = `[${ticket.id}: ${ticket.title}](${ticket.url})`;
    }

    let prCell = "—";
    if (ticket.prUrl && ticket.prNumber) {
      prCell = `[#${ticket.prNumber}](${ticket.prUrl})`;
    } else if (ticket.prNumber) {
      prCell = `#${ticket.prNumber}`;
    }

    const authorCell = ticket.prAuthor ? `@${ticket.prAuthor}` : "—";

    lines.push(`| ${issueCell} | ${prCell} | ${authorCell} |`);
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Get display name for a ticket system
 */
function getSystemDisplayName(systemType: TicketSystemType): string {
  switch (systemType) {
    case "linear":
      return "Linear";
    case "jira":
      return "Jira";
    case "github":
      return "GitHub Issues";
  }
}

/** Extract tickets from a single commit/PR */
function extractTicketsFromCommit(
  textToSearch: string,
  systems: TicketSystemEntry[],
  allKeys: string[],
  hasGithubIssueSystem: boolean,
  prInfo: { prNumber?: number; prAuthor?: string; prUrl?: string },
  knownPrNumbers: Set<number>
): ExtractedTicket[] {
  const extracted: ExtractedTicket[] = [];

  // Extract PREFIX-123 style tickets
  const ticketIds = extractTicketIds(textToSearch, allKeys.length > 0 ? allKeys : undefined);

  for (const ticketId of ticketIds) {
    const system = mapTicketToSystem(ticketId, systems);
    if (!system) continue;

    extracted.push({
      id: ticketId,
      system,
      prNumber: prInfo.prNumber,
      prAuthor: prInfo.prAuthor,
      prUrl: prInfo.prUrl,
    });
  }

  // Extract #123 style GitHub issues
  if (!hasGithubIssueSystem) {
    return extracted;
  }

  const issueNumbers = extractGithubIssueNumbers(textToSearch, knownPrNumbers);
  for (const issueNumber of issueNumbers) {
    extracted.push({
      id: issueNumber,
      system: "github",
      prNumber: prInfo.prNumber,
      prAuthor: prInfo.prAuthor,
      prUrl: prInfo.prUrl,
    });
  }

  return extracted;
}

/** Fetch ticket info and add to results map */
async function fetchAndStoreTicket(
  extracted: ExtractedTicket,
  commits: CommitEntry[],
  client: TicketClient,
  ticketsBySystem: Map<TicketSystemType, TicketInfo[]>,
  warnings: string[]
): Promise<void> {
  try {
    const ticketId = String(extracted.id);
    const ticketInfo = await client.fetchTicket(ticketId);
    if (!ticketInfo) return;

    const enriched: TicketInfo = {
      ...ticketInfo,
      prNumber: extracted.prNumber,
      prAuthor: extracted.prAuthor,
      prUrl: extracted.prUrl,
      commits: commits.length > 0 ? commits : undefined,
    };

    const existing = ticketsBySystem.get(extracted.system) ?? [];
    existing.push(enriched);
    ticketsBySystem.set(extracted.system, existing);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Failed to fetch ${extracted.id}: ${message}`);
  }
}

/** Initialize ticket clients for configured systems */
function initializeClients(
  config: TicketConfig,
  env: TicketEnvVars,
  warnings: string[]
): Map<TicketSystemType, TicketClient> {
  const clients = new Map<TicketSystemType, TicketClient>();

  for (const system of config.systems) {
    const client = createTicketClient(system, env, config);
    if (client) {
      clients.set(system.type, client);
    } else {
      warnings.push(`Missing credentials for ${getSystemDisplayName(system.type)}`);
    }
  }

  return clients;
}

/** Commit with message and SHA */
interface CommitEntry {
  message: string;
  sha: string;
}

/** Group extracted tickets by system:id key, collecting commit messages and SHAs */
function groupTicketsByKey(
  tickets: ExtractedTicket[]
): Map<string, { ticket: ExtractedTicket; commits: CommitEntry[] }> {
  const grouped = new Map<string, { ticket: ExtractedTicket; commits: CommitEntry[] }>();

  for (const ticket of tickets) {
    const key = `${ticket.system}:${ticket.id}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ticket,
        commits:
          ticket.commitMessage && ticket.commitSha
            ? [{ message: ticket.commitMessage, sha: ticket.commitSha }]
            : [],
      });
      continue;
    }

    // Add commit if present and not already included
    const { commitMessage, commitSha } = ticket;
    if (!commitMessage || !commitSha) {
      continue;
    }

    const alreadyExists = existing.commits.some((c) => c.sha === commitSha);
    if (!alreadyExists) {
      existing.commits.push({ message: commitMessage, sha: commitSha });
    }
  }

  return grouped;
}

/** Collect all tickets from all systems into a flat array */
function collectAllTickets(
  systems: TicketSystemEntry[],
  ticketsBySystem: Map<TicketSystemType, TicketInfo[]>
): TicketInfo[] {
  const allTickets: TicketInfo[] = [];
  for (const system of systems) {
    const tickets = ticketsBySystem.get(system.type) ?? [];
    allTickets.push(...tickets);
  }
  return allTickets;
}

/** Collect all unique PR numbers from PR details map */
function collectPrNumbers(prDetailsBySha: Map<string, PullRequestInfo>): Set<number> {
  return new Set([...prDetailsBySha.values()].map((pr) => pr.number));
}

/** Format all systems into markdown sections */
function formatAllSystems(
  systems: TicketSystemEntry[],
  ticketsBySystem: Map<TicketSystemType, TicketInfo[]>,
  owner: string,
  repo: string
): string {
  const sections: string[] = [];

  for (const system of systems) {
    const tickets = ticketsBySystem.get(system.type) ?? [];
    const markdown = formatTicketsMarkdown(tickets, getSystemDisplayName(system.type), owner, repo);
    if (markdown) {
      sections.push(markdown);
    }
  }

  return sections.join("\n");
}

/** PR titles created by release-action workflows that should be excluded from ticket extraction */
export const releasePrTitlePattern = /^Release\s/;

/** Maximum characters per PR description content */
const maxDescriptionLength = 2000;

/** Pattern to find release notes section in PR body */
const releaseNotesPattern = /\*\*Release notes?:\*\*\s*([\s\S]*?)(?=\n---|\n\*\*[A-Z]|\n##|$)/i;

/**
 * Extract PR descriptions from fetched PR details
 *
 * Prefers explicit "Release notes:" sections when present.
 * Truncates content to avoid oversized AI prompts.
 *
 * @param prDetailsBySha - Map of commit SHA to PR info
 * @returns Deduplicated PR descriptions with content
 */
export function extractPrDescriptions(
  prDetailsBySha: Map<string, PullRequestInfo>
): PrDescription[] {
  const seen = new Set<number>();
  const descriptions: PrDescription[] = [];

  for (const pr of prDetailsBySha.values()) {
    if (seen.has(pr.number) || !pr.body?.trim()) continue;
    seen.add(pr.number);

    const releaseNotesMatch = pr.body.match(releaseNotesPattern);
    const content = releaseNotesMatch?.[1]?.trim() ?? pr.body.trim();
    if (!content) continue;

    const truncated =
      content.length > maxDescriptionLength
        ? `${content.slice(0, maxDescriptionLength)}...`
        : content;

    descriptions.push({
      prNumber: pr.number,
      title: pr.title,
      content: truncated,
      author: pr.author,
    });
  }

  return descriptions;
}

/**
 * Serialize PR descriptions to YAML format
 *
 * Uses YAML block scalar (`|`) for multiline content.
 * No library needed — the structure is flat and predictable.
 *
 * @param descriptions - PR descriptions to serialize
 * @returns YAML string
 */
export function serializePrDescriptionsToYaml(descriptions: PrDescription[]): string {
  return descriptions
    .map((d) => {
      const escapedTitle = d.title.replace(/"/g, '\\"');
      const indentedContent = d.content
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      return `- prNumber: ${d.prNumber}\n  title: "${escapedTitle}"\n  author: ${d.author}\n  content: |\n${indentedContent}`;
    })
    .join("\n");
}

/**
 * Generate tickets section for changelog
 *
 * @param options - Configuration and environment
 * @returns Generated markdown and any warnings
 *
 * @example
 * ```typescript
 * const result = await generateTicketsSection({
 *   config: {
 *     systems: [{ type: "linear" }],
 *     owner: "org",
 *     repo: "repo",
 *   },
 *   env: { githubToken: "ghp_xxx", linearApiKey: "lin_xxx" },
 * });
 * ```
 */
export async function generateTicketsSection(
  options: GenerateTicketsSectionOptions
): Promise<GenerateTicketsSectionResult> {
  const { config, env, cwd = process.cwd() } = options;
  const warnings: string[] = [];
  const ticketsBySystem = new Map<TicketSystemType, TicketInfo[]>();

  // When multiple key-pattern systems (Linear, Jira) are configured, keys are
  // required to route each ticket to the right system — without them, a `TEAM-123`
  // could go to either. GitHub Issues uses `#N` so it never collides.
  const keyPatternSystems = config.systems.filter((s) => s.type !== "github");
  if (keyPatternSystems.length > 1) {
    const missingKeys = keyPatternSystems.filter((s) => !s.keys || s.keys.length === 0);
    if (missingKeys.length > 0) {
      const types = missingKeys.map((s) => s.type).join(", ");
      warnings.push(
        `Multiple ticket systems configured but ${types} has no keys set. Tickets may be routed to the wrong system. Set ${missingKeys.map((s) => `${s.type.toUpperCase()}_KEYS`).join(" / ")} to disambiguate.`
      );
    }
  }

  const clients = initializeClients(config, env, warnings);
  if (clients.size === 0) {
    return { markdown: "", tickets: [], prDescriptions: [], warnings };
  }

  // Get commits and fetch associated PRs by commit SHA
  // This works for all merge strategies (squash, rebase, merge commit)
  const commits = await getCommitsSinceLastTag(cwd);
  const commitShas = commits.map((c) => c.sha);

  let prDetailsBySha = new Map<string, PullRequestInfo>();
  if (commitShas.length > 0 && env.githubToken) {
    prDetailsBySha = await fetchPullRequestsForCommits(
      commitShas,
      config.owner,
      config.repo,
      env.githubToken
    );
  }

  // Filter release PRs — their bodies contain changelogs with ticket IDs
  // that would be incorrectly re-attributed to the release PR author
  prDetailsBySha = new Map(
    [...prDetailsBySha].filter(([, pr]) => !releasePrTitlePattern.test(pr.title))
  );

  // Collect PR descriptions for AI release notes context
  const prDescriptions = extractPrDescriptions(prDetailsBySha);

  // Extract tickets from each commit/PR
  const allKeys = getAllKeys(config.systems);
  const hasGithubIssueSystem = config.systems.some((s) => s.type === "github");
  const knownPrNumbers = collectPrNumbers(prDetailsBySha);
  const extractedTickets: ExtractedTicket[] = [];

  for (const commit of commits) {
    const pr = prDetailsBySha.get(commit.sha);
    // Always include the commit message so ticket IDs that appear only in the
    // commit text (not the PR title/body) still get picked up. Concatenating
    // is safe — extractTicketIds dedupes by id+system.
    const textToSearch = pr
      ? `${pr.title} ${pr.body ?? ""} ${commit.message}`
      : commit.message;
    const prInfo = { prNumber: pr?.number, prAuthor: pr?.author, prUrl: pr?.url };

    const tickets = extractTicketsFromCommit(
      textToSearch,
      config.systems,
      allKeys,
      hasGithubIssueSystem,
      prInfo,
      knownPrNumbers
    );

    // Attach commit message and SHA to each extracted ticket
    for (const ticket of tickets) {
      ticket.commitMessage = commit.message;
      ticket.commitSha = commit.sha;
    }

    extractedTickets.push(...tickets);
  }

  // Group tickets by key and fetch details
  const groupedTickets = groupTicketsByKey(extractedTickets);
  for (const { ticket, commits } of groupedTickets.values()) {
    const client = clients.get(ticket.system);
    if (!client) continue;
    await fetchAndStoreTicket(ticket, commits, client, ticketsBySystem, warnings);
  }

  return {
    markdown: formatAllSystems(config.systems, ticketsBySystem, config.owner, config.repo),
    tickets: collectAllTickets(config.systems, ticketsBySystem),
    prDescriptions,
    warnings,
  };
}

/**
 * Parse CLI arguments into ticket configuration
 *
 * @param args - CLI arguments
 * @returns Parsed ticket system entries or null if no --tickets args
 *
 * @example
 * ```typescript
 * parseTicketArgs(["--tickets=linear", "--tickets=jira:CORE,INFRA"]);
 * // → [{ type: "linear" }, { type: "jira", keys: ["CORE", "INFRA"] }]
 * ```
 */
export function parseTicketArgs(args: string[]): TicketSystemEntry[] | null {
  const systems: TicketSystemEntry[] = [];

  for (const arg of args) {
    if (!arg.startsWith("--tickets=")) {
      continue;
    }

    const value = arg.slice("--tickets=".length);
    const colonIndex = value.indexOf(":");

    if (colonIndex === -1) {
      // Format: --tickets=linear
      systems.push({ type: value as TicketSystemType });
    } else {
      // Format: --tickets=linear:TEAM,PROJ
      const systemType = value.slice(0, colonIndex) as TicketSystemType;
      const keys = value.slice(colonIndex + 1).split(",");
      systems.push({ type: systemType, keys });
    }
  }

  return systems.length > 0 ? systems : null;
}

/**
 * Load ticket environment variables
 *
 * @returns TicketEnvVars from process.env
 */
export function loadTicketEnv(): TicketEnvVars {
  return {
    githubToken: process.env.GH_TOKEN,
    linearApiKey: process.env.LINEAR_API_KEY,
    jiraBaseUrl: process.env.JIRA_BASE_URL,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraApiToken: process.env.JIRA_API_TOKEN,
  };
}

/**
 * Auto-detect ticket systems from environment variables
 *
 * Enables ticket systems based on available credentials:
 * - LINEAR_API_KEY → enables Linear
 * - JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN → enables Jira
 *
 * Optional key filtering via environment variables:
 * - LINEAR_KEYS=TEAM,PROJ → filter Linear tickets
 * - JIRA_KEYS=CORE,INFRA → filter Jira tickets
 *
 * @param env - Environment variables with API credentials
 * @returns Array of detected ticket system entries
 *
 * @example
 * ```typescript
 * // With LINEAR_API_KEY and LINEAR_KEYS=TEAM,PROJ set:
 * const systems = autoDetectTicketSystems(loadTicketEnv());
 * // → [{ type: "linear", keys: ["TEAM", "PROJ"] }]
 * ```
 */
export function autoDetectTicketSystems(env: TicketEnvVars): TicketSystemEntry[] {
  const systems: TicketSystemEntry[] = [];

  if (env.linearApiKey) {
    const keys = process.env.LINEAR_KEYS?.split(",").filter(Boolean);
    systems.push({ type: "linear", keys: keys?.length ? keys : undefined });
  }

  if (env.jiraBaseUrl && env.jiraEmail && env.jiraApiToken) {
    const keys = process.env.JIRA_KEYS?.split(",").filter(Boolean);
    systems.push({ type: "jira", keys: keys?.length ? keys : undefined });
  }

  if (env.githubToken) {
    systems.push({ type: "github" });
  }

  return systems;
}
