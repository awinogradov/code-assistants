/**
 * Structural guard for issue #259: asserts the reply-composition steps of the
 * pr:resolve and pr:answer skills carry the reference-formatting instruction, so
 * review-thread replies and PR comments render references per the standard — most
 * visibly, commit SHAs as links rather than bare text. The canonical standard lives
 * in docs/output-formatting.md and is inlined verbatim into every skill (guarded by
 * referenceFormattingSync); this test checks only that the actionable instruction is
 * PRESENT — the distinctive phrase "render the SHA as a markdown link" — not that the
 * model applies it at runtime, which CI cannot verify.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

const replySkillFiles = [
  join(skillsDir, "pr:resolve", "SKILL.md"),
  join(skillsDir, "pr:answer", "SKILL.md"),
];

describe("reply reference-formatting wiring", () => {
  test.each(replySkillFiles)("%s instructs replies to link commit SHAs", async (file) => {
    const content = await readFile(file, "utf8");
    expect(content).toContain("render the SHA as a markdown link");
  });
});
