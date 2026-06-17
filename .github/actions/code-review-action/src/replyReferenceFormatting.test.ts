/**
 * Structural guard (issues #259, #334): asserts the reply-composition steps of the
 * pr:resolve and pr:answer skills carry the reference-formatting instructions, so
 * review-thread replies and PR comments render references per RFC-0001 v3 — commit
 * SHAs AND any file/doc/skill/agent/section they cite as links rather than bare text.
 * The canonical standard lives in rfc/0001-reference-formatting.md and is inlined
 * verbatim into every skill (guarded by referenceFormattingSync); this test checks only
 * that the actionable instructions are PRESENT — the distinctive phrases below — not that
 * the model applies them at runtime, which CI cannot verify.
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

  test.each(replySkillFiles)("%s instructs replies to link doc and section references", async (file) => {
    const content = await readFile(file, "utf8");
    expect(content).toContain("link any file, doc, skill, agent, or section you cite");
  });
});
