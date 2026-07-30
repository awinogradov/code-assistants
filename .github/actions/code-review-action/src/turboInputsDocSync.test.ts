/**
 * Guards the Turbo task-graph table in `docs/01-workspace-structure.md` against
 * `turbo.json`, which it restates.
 *
 * A doc that repeats configuration drifts from it, and this one already did: the `test`
 * task gained root-relative markdown globs while the table eight lines below still listed
 * the TypeScript-only inputs, contradicting the section that explained them. The same
 * failure shape — a second copy of a contract nobody re-reads — has now been fixed three
 * separate times in this repository, so the copy is pinned rather than trusted.
 *
 * The check is deliberately loose about glob syntax and strict about coverage: for each
 * root-relative input, the directory or filename it targets must be named in the table
 * row. Asserting the literal glob would fail on harmless rewording of the row; asserting
 * nothing would let a whole input disappear from the documentation unnoticed.
 *
 * What this CANNOT prove: that the inputs are correct, only that the documentation matches
 * them. Whether a docs-only change actually busts the cache is a Turbo behaviour, verified
 * by running it rather than by reading either file.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");

const [turboRaw, chapter] = await Promise.all([
  readFile(join(repoRoot, "turbo.json"), "utf8"),
  readFile(join(repoRoot, "docs/01-workspace-structure.md"), "utf8"),
]);

const turbo = JSON.parse(turboRaw) as {
  tasks: Record<string, { inputs?: string[] }>;
};

const testInputs = turbo.tasks.test?.inputs ?? [];
const rootPrefix = "$TURBO_ROOT$/";

/** Root-relative inputs, reduced to the directory or filename each one targets. */
const rootTargets = testInputs
  .filter((input) => input.startsWith(rootPrefix))
  .map((input) =>
    input
      .slice(rootPrefix.length)
      .replace(/\*\*\/\*\.md$/, "")
      .replace(/\*\.md$/, ""),
  );

/**
 * The `| \`test\` |` row of the Turbo task-graph table.
 *
 * Scoped to that section first: the chapter's Workspace-scripts table also has a `test`
 * row and appears earlier, so an unscoped search matches the wrong one and the assertions
 * below check a row that never mentions inputs at all.
 */
const taskGraphSection = chapter.split("### Turbo task graph")[1] ?? "";
const testRow =
  taskGraphSection.split("\n").find((line) => /^\|\s*`test`\s*\|/.test(line)) ?? "<row absent>";

describe("turbo inputs doc sync", () => {
  test("the test task declares root-relative markdown inputs", () => {
    // If this fails the cache gap has been reintroduced, not merely undocumented.
    expect(rootTargets.length).toBeGreaterThan(0);
  });

  test("the task-graph table row exists", () => {
    expect(testRow).not.toBe("<row absent>");
  });

  test.each(rootTargets)("the table row names the %s input", (target) => {
    expect(testRow).toContain(target);
  });

  test("the table row still names the package-relative inputs", () => {
    for (const input of testInputs.filter((i) => !i.startsWith(rootPrefix))) {
      expect(testRow).toContain(input);
    }
  });
});
