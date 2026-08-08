/**
 * Guards the canonical branch-name regex against drift between its two encodings:
 * the `regex` input of the contributing-check CI action and the executable pattern
 * in the shared pr-title-grammar.md block that branch-create and preflight-check
 * validate against before a branch is created or committed on.
 *
 * The CI action is the enforcement of last resort — it fires only once a PR is
 * open, when a bad head branch can no longer be renamed and the PR must be
 * re-created. The grammar block is what the skills check before the branch ever
 * exists. If either encoding is edited alone, agents validate one shape and CI
 * another, reintroducing exactly the late failure the early gates exist to
 * prevent; this test makes such an edit fail in CI instead.
 *
 * Vacuous-pass defence: the extracted regex must be non-empty and above a minimum
 * length, so a reworded `regex:` line cannot extract "" and trivially match.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const contributingCheckPath = join(
  repoRoot,
  ".github/actions/contributing-check/action.yml",
);
const grammarPath = join(
  repoRoot,
  "claude-plugins/autopilot/skills/shared-rules/references/pr-title-grammar.md",
);

/** Shortest the real pattern can be; anything smaller means the extraction went wrong. */
const minRegexLength = 80;

/** The single-quoted value of the action's `regex:` input line; null when absent. */
function extractCiRegex(actionYml: string): string | null {
  return /^\s*regex:\s*'(.+)'\s*$/m.exec(actionYml)?.[1] ?? null;
}

describe("branch grammar sync", () => {
  test("pr-title-grammar.md carries the contributing-check regex verbatim", async () => {
    const [actionYml, grammar] = await Promise.all([
      readFile(contributingCheckPath, "utf8"),
      readFile(grammarPath, "utf8"),
    ]);
    const ciRegex = extractCiRegex(actionYml);
    expect(ciRegex).not.toBeNull();
    expect(ciRegex!.length).toBeGreaterThan(minRegexLength);
    // On its own line means inside the fenced canonical-regex block, not in prose.
    expect(grammar).toContain(`\n${ciRegex!}\n`);
  });
});
