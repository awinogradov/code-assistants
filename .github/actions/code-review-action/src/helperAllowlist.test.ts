/**
 * Pins the review-thread helper's Bash allow rule in action.yml. The helper
 * (claude-plugins/autopilot/lib/github/fetch-pr-reviews.mjs) tunnels a read-only
 * `gh api graphql` reviewThreads query past the Bash-layer graphql disallow — a
 * deliberate exception that stays safe only while the single allow rule pins the
 * script to the literal `${CLAUDE_PLUGIN_ROOT}` path (the trusted installed
 * plugin, set from steps.plugin.outputs.dir). An absolute-path wildcard such as
 * `node /*…/fetch-pr-reviews.mjs` would also match the reviewed PR's own untrusted
 * checkout of that file, granting arbitrary Node execution with secrets in scope
 * (CHECK-SEC-003); this test fails the moment such a rule reappears.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionYmlPath = join(import.meta.dirname, "..", "action.yml");
const actionYml = await readFile(actionYmlPath, "utf8");

const allowedToolsLines = actionYml
  .split("\n")
  .filter((line) => line.includes("CLAUDE_ALLOWED_TOOLS:"));

/** The one safe rule — the script is pinned to the literal ${CLAUDE_PLUGIN_ROOT} path. */
const pinnedHelperRule =
  'Bash(node "${CLAUDE_PLUGIN_ROOT}/lib/github/fetch-pr-reviews.mjs":*)';

describe("review-thread helper allowlist", () => {
  test("both Claude steps declare an allowlist", () => {
    expect(allowedToolsLines).toHaveLength(2);
  });

  test.each(allowedToolsLines.map((line, index) => [index, line] as const))(
    "allowlist %d carries the pinned helper rule",
    (_index, line) => {
      expect(line).toContain(pinnedHelperRule);
    },
  );

  test("every step that allows the helper also exports CLAUDE_PLUGIN_ROOT", () => {
    // The literal ${CLAUDE_PLUGIN_ROOT} in the rule only resolves to the trusted
    // installed plugin when the env var is set; without it the helper path would
    // fall back to an untrusted location.
    const rootExports = actionYml
      .split("\n")
      .filter((line) => line.includes("CLAUDE_PLUGIN_ROOT:")).length;
    expect(rootExports).toBe(allowedToolsLines.length);
  });

  test("no absolute-path or wildcard node rule exists in any tools declaration", () => {
    const toolsLines = actionYml
      .split("\n")
      .filter(
        (line) =>
          line.includes("CLAUDE_ALLOWED_TOOLS:") || line.includes("CLAUDE_DISALLOWED_TOOLS:"),
      );
    const nodeRules = toolsLines.flatMap((line) => line.match(/Bash\(node[^)]*\)/g) ?? []);
    // The ONLY permitted node rule is the ${CLAUDE_PLUGIN_ROOT}-anchored one. An
    // absolute-path (`node /…`) or wildcard (`node /*…`) rule would also match the
    // reviewed PR's own checkout of the helper file — CHECK-SEC-003.
    for (const rule of nodeRules) {
      expect(rule).toBe(pinnedHelperRule);
    }
  });
});
