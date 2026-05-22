/**
 * Parse fields from `platform.meta.yml` content.
 *
 * Lightweight line-by-line parsing for flat YAML structures.
 * No YAML parser dependency needed.
 *
 * @example
 * ```typescript
 * import { parseReleaseType, parseSlackRelease } from "../platformMeta/platformMeta.ts";
 *
 * const content = await Bun.file("platform.meta.yml").text();
 * const type = parseReleaseType(content);     // "github-action"
 * const channel = parseSlackRelease(content);  // "#platform-engineering"
 * ```
 */

/**
 * Extract `release` field value from platform.meta.yml content.
 *
 * Matches the first line starting with `release:` and returns the value.
 *
 * @param content - Raw platform.meta.yml file content
 * @returns Release type string or null if not found
 */
export function parseReleaseType(content: string): string | null {
  for (const line of content.split("\n")) {
    if (line.startsWith("release:")) {
      const value = line.slice("release:".length).trim();
      return value || null;
    }
  }
  return null;
}

/**
 * Parse `slack.release` channel from platform.meta.yml content.
 *
 * Walks lines to find the `slack:` block, then extracts the `release:` value.
 *
 * @param content - Raw platform.meta.yml file content
 * @returns Slack channel string or null if not found
 */
export function parseSlackRelease(content: string): string | null {
  const lines = content.split("\n");
  let inSlack = false;

  for (const line of lines) {
    if (line === "slack:") {
      inSlack = true;
      continue;
    }
    if (inSlack && line.length > 0 && !line.startsWith(" ")) {
      break;
    }
    if (inSlack && line.trim().startsWith("release:")) {
      return line
        .trim()
        .replace(/^release:\s+/, "")
        .replace(/"/g, "");
    }
  }

  return null;
}
