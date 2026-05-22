/**
 * Ticket ID extraction utilities
 *
 * Extracts ticket IDs (like TEAM-123, PROJ-456) from PR titles and commit messages.
 * Supports both generic pattern matching and specific key filtering.
 *
 * @example
 * ```typescript
 * import { extractTicketIds, extractPrNumber } from "./ticketExtractor.ts";
 *
 * // Extract all ticket-like patterns
 * const tickets = extractTicketIds("feat: TEAM-123 add auth");
 * // → ["TEAM-123"]
 *
 * // Extract with specific keys
 * const filtered = extractTicketIds("TEAM-1 PROJ-2 OTHER-3", ["TEAM", "PROJ"]);
 * // → ["TEAM-1", "PROJ-2"]
 *
 * // Extract PR number from squash merge
 * const prNumber = extractPrNumber("feat: add auth (#45)");
 * // → 45
 * ```
 */

import type { TicketSystemEntry, TicketSystemType } from "./tickets.types.ts";

/** Generic pattern matching any UPPERCASE-123 format */
export const genericTicketPattern = /\b([A-Z][A-Z0-9]*-\d+)\b/g;

/** Pattern to extract PR number from squash merge format (#123) */
export const prNumberPattern = /\(#(\d+)\)$/;

/**
 * Build a regex pattern for specific ticket key prefixes
 *
 * @param keys - Array of key prefixes (e.g., ["TEAM", "PROJ"])
 * @returns RegExp matching only those prefixes
 *
 * @example
 * ```typescript
 * const pattern = buildTicketPattern(["TEAM", "PROJ"]);
 * "TEAM-123".match(pattern); // → ["TEAM-123"]
 * "OTHER-456".match(pattern); // → null
 * ```
 */
export function buildTicketPattern(keys: string[]): RegExp {
  if (keys.length === 0) {
    return genericTicketPattern;
  }
  const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b((?:${escaped.join("|")})-\\d+)\\b`, "g");
}

/**
 * Extract ticket IDs from text
 *
 * @param text - Text to search (PR title, commit message, etc.)
 * @param keys - Optional array of key prefixes to filter. If omitted, matches any UPPERCASE-123
 * @returns Array of unique ticket IDs found
 *
 * @example
 * ```typescript
 * // Match any pattern
 * extractTicketIds("feat: TEAM-123 PROJ-456 fix");
 * // → ["TEAM-123", "PROJ-456"]
 *
 * // Match only specific keys
 * extractTicketIds("TEAM-1 PROJ-2 OTHER-3", ["TEAM"]);
 * // → ["TEAM-1"]
 * ```
 */
export function extractTicketIds(text: string, keys?: string[]): string[] {
  const pattern = keys && keys.length > 0 ? buildTicketPattern(keys) : genericTicketPattern;
  const matches = text.match(pattern) ?? [];
  return [...new Set(matches)];
}

/**
 * Extract PR number from commit message (squash merge format)
 *
 * GitHub squash merges append (#123) to commit messages.
 *
 * @param commitMessage - Commit message text
 * @returns PR number or undefined if not found
 *
 * @example
 * ```typescript
 * extractPrNumber("feat: add auth (#45)"); // → 45
 * extractPrNumber("chore: update deps"); // → undefined
 * ```
 */
export function extractPrNumber(commitMessage: string): number | undefined {
  const match = commitMessage.trim().match(prNumberPattern);
  const prNumber = match?.[1];
  if (!prNumber) {
    return undefined;
  }
  return Number.parseInt(prNumber, 10);
}

/**
 * Map a ticket ID to its system based on configuration
 *
 * @param ticketId - Ticket ID (e.g., TEAM-123)
 * @param systems - Array of system configurations
 * @returns The system type that owns this ticket, or undefined if no match
 *
 * @example
 * ```typescript
 * const systems = [
 *   { type: "linear", keys: ["TEAM"] },
 *   { type: "jira", keys: ["JIRA", "CORE"] },
 * ];
 *
 * mapTicketToSystem("TEAM-123", systems); // → "linear"
 * mapTicketToSystem("CORE-456", systems); // → "jira"
 * mapTicketToSystem("OTHER-789", systems); // → undefined
 * ```
 */
export function mapTicketToSystem(
  ticketId: string,
  systems: TicketSystemEntry[]
): TicketSystemType | undefined {
  const [prefix] = ticketId.split("-");
  if (!prefix) {
    return undefined;
  }

  // Check systems with specific keys first
  const matchingSystem = systems.find(
    (system) => system.keys && system.keys.length > 0 && system.keys.includes(prefix)
  );

  if (matchingSystem) {
    return matchingSystem.type;
  }

  // If only one system has no keys (generic matching), return it
  const genericSystems = systems.filter((s) => !s.keys || s.keys.length === 0);
  const [singleGeneric] = genericSystems;
  if (genericSystems.length === 1 && singleGeneric) {
    return singleGeneric.type;
  }

  // When multiple generic systems exist, prefer non-GitHub systems
  // PREFIX-123 patterns are Linear/Jira style, not GitHub (#123)
  if (genericSystems.length > 1) {
    const nonGithubGeneric = genericSystems.find((s) => s.type !== "github");
    return nonGithubGeneric?.type ?? genericSystems[0]?.type;
  }

  return undefined;
}

/**
 * Get all unique key prefixes from system configurations
 *
 * @param systems - Array of system configurations
 * @returns Array of all key prefixes, or empty if any system uses generic matching
 *
 * @example
 * ```typescript
 * getAllKeys([
 *   { type: "linear", keys: ["TEAM", "PROJ"] },
 *   { type: "jira", keys: ["CORE"] },
 * ]);
 * // → ["TEAM", "PROJ", "CORE"]
 *
 * getAllKeys([{ type: "linear" }]); // → [] (generic matching)
 * ```
 */
export function getAllKeys(systems: TicketSystemEntry[]): string[] {
  const hasGenericSystem = systems.some((s) => !s.keys || s.keys.length === 0);
  if (hasGenericSystem) {
    return [];
  }

  const keys: string[] = [];
  for (const system of systems) {
    if (system.keys) {
      keys.push(...system.keys);
    }
  }
  return [...new Set(keys)];
}
