/**
 * Guards that the body-generation phases of the pr:create and pr:update autopilot
 * skills explicitly instruct the model to apply the inlined reference-formatting
 * rules (RFC-0001). Both skills already inline the canonical block — the
 * referenceFormattingSync test guards that copy stays byte-identical — but inlining
 * alone never made the generators apply it, so generated PR bodies escaped the
 * standard (issue #279).
 *
 * This is a presence-guard: it asserts the apply-instruction survives in the
 * instructions ABOVE the inlined block, so the wiring cannot be silently dropped. It
 * reads only the text before the `<!-- ref-format:start -->` sentinel — the inlined
 * block itself contains reference-formatting prose, so including it would let the
 * block satisfy the assertion by accident. A missing sentinel fails loudly rather
 * than degrading the slice into a near-whole-file match.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Depth mirrors referenceFormattingSync.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

const startSentinel = "<!-- ref-format:start -->";
// Load-bearing phrase: the apply-instruction each skill carries in its body-
// generation phase. Reword it only alongside this test.
const applyInstruction = "reference-formatting rules inlined at the end";

const skills = ["pr:create", "pr:update"];

describe("PR body reference-formatting wiring", () => {
  test.each(skills)("%s instructs the body generator to apply RFC-0001", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    const blockStart = content.indexOf(startSentinel);
    expect(blockStart).toBeGreaterThan(-1);
    expect(content.slice(0, blockStart)).toContain(applyInstruction);
  });
});
