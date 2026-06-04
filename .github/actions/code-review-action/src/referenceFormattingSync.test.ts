/**
 * Guards that the canonical "Reference formatting & readability" block defined in
 * rfc/0001-reference-formatting.md stays byte-identical everywhere it is inlined: every
 * autopilot skill (claude-plugins/autopilot/skills/*\/SKILL.md) and the
 * release-action release-notes systemPrompt. The skills run standalone, so each
 * carries its own copy of the block; silent drift between the copies would let one
 * surface format file/section/commit references differently from the rest, with no
 * other signal. The block is delimited by `<!-- ref-format:start -->` /
 * `<!-- ref-format:end -->` sentinels in each file so it can be extracted and compared.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const rfcPath = join(repoRoot, "rfc/0001-reference-formatting.md");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const releasePrompt = join(repoRoot, ".github/actions/release-action/src/releaseNotesPrompt.ts");

const blockPattern = /<!-- ref-format:start -->([\s\S]*?)<!-- ref-format:end -->/;

/** Extract the sentinel-delimited block from `content`, trimmed; null when absent. */
function extractBlock(content: string): string | null {
  return blockPattern.exec(content)?.[1].trim() ?? null;
}

const canonical = extractBlock(await readFile(rfcPath, "utf8"));

const skillEntries = await readdir(skillsDir, { withFileTypes: true });
const skillFiles = skillEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(skillsDir, entry.name, "SKILL.md"));

describe("reference-formatting block sync", () => {
  test("rfc/0001-reference-formatting.md defines the canonical block", () => {
    expect(canonical).not.toBeNull();
    expect(canonical).toContain("### Reference formatting & readability");
  });

  test.each(skillFiles)("%s inlines the canonical block verbatim", async (file) => {
    expect(extractBlock(await readFile(file, "utf8"))).toBe(canonical);
  });

  test("release-notes systemPrompt inlines the canonical block verbatim", async () => {
    // The block lives inside a backtick template literal, so its backticks are
    // escaped as \` in source — un-escape before comparing to the canonical.
    const source = (await readFile(releasePrompt, "utf8")).replaceAll("\\`", "`");
    expect(extractBlock(source)).toBe(canonical);
  });
});
