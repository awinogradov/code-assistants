/**
 * Pins the review-thread helper's Bash allow rules in action.yml. The helper
 * (claude-plugins/autopilot/lib/github/fetch-pr-reviews.mjs) tunnels a read-only
 * `gh api graphql` reviewThreads query past the Bash-layer graphql disallow — a
 * deliberate exception that stays safe only while the allow rules keep the script
 * path anchored directly after `node`, so `node -e`/`--require` flag injection
 * cannot ride the wildcard. A future "loosen the glob" edit fails here first.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionYmlPath = join(import.meta.dirname, "..", "action.yml");
const actionYml = await readFile(actionYmlPath, "utf8");

const allowedToolsLines = actionYml
  .split("\n")
  .filter((line) => line.includes("CLAUDE_ALLOWED_TOOLS:"));

/** The exact anchored rules — the script path follows `node` with no wildcard between. */
const pinnedHelperRules = [
  'Bash(node "${CLAUDE_PLUGIN_ROOT}/lib/github/fetch-pr-reviews.mjs":*)',
  "Bash(node /*lib/github/fetch-pr-reviews.mjs:*)",
  'Bash(node "/*lib/github/fetch-pr-reviews.mjs":*)',
];

describe("review-thread helper allowlist", () => {
  test("both Claude steps declare an allowlist", () => {
    expect(allowedToolsLines).toHaveLength(2);
  });

  test.each(allowedToolsLines.map((line, index) => [index, line] as const))(
    "allowlist %d carries exactly the pinned helper rules",
    (_index, line) => {
      for (const rule of pinnedHelperRules) {
        expect(line).toContain(rule);
      }
    },
  );

  test("no broader node rule exists in any tools declaration", () => {
    const toolsLines = actionYml
      .split("\n")
      .filter((line) => line.includes("CLAUDE_ALLOWED_TOOLS:") || line.includes("CLAUDE_DISALLOWED_TOOLS:"));
    const nodeRules = toolsLines.flatMap((line) => line.match(/Bash\(node[^)]*\)/g) ?? []);
    for (const rule of nodeRules) {
      expect(pinnedHelperRules).toContain(rule);
    }
    // Every node rule anchors the helper path right after `node ` — a wildcard
    // there would re-open arbitrary `node -e` execution.
    for (const rule of nodeRules) {
      expect(rule).toMatch(/^Bash\(node ["/$]/);
    }
  });
});
