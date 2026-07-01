/**
 * Guards that the output-generating autopilot skills explicitly instruct the model to
 * apply the inlined reference-formatting rules (RFC-0001): pr:create and pr:update (PR
 * bodies, issue #279) plus plan, plan-bun, plan-nodejs-react, run, and issue:create
 * (plan files and issue bodies, issue #334). Each already inlines the canonical block —
 * the referenceFormattingSync test guards that copy stays byte-identical — but inlining
 * alone never made the generators apply it, so generated output escaped the standard.
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

const skills = ["pr:create", "pr:update", "plan", "plan-bun", "plan-nodejs-react", "run", "issue:create", "linear:create"];

describe("output reference-formatting wiring", () => {
  test.each(skills)("%s instructs the body generator to apply RFC-0001", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    const blockStart = content.indexOf(startSentinel);
    expect(blockStart).toBeGreaterThan(-1);
    expect(content.slice(0, blockStart)).toContain(applyInstruction);
  });
});

// Issue #387: bare Linear ids in generated output are dead text on GitHub. The PR-body
// skills must prescribe the plain issue URL on magic-word lines (the form Linear's
// parser and GitHub's autolinker both accept), pr:review must link the ticket it
// cites, and the producing agent contracts must expose the issue `url` the skills
// build those links from. Presence-guards in the style of the wiring test above.
describe("linear issue linking (issue #387)", () => {
  const prBodySkills = ["pr:create", "pr:update"];

  test.each(prBodySkills)("%s prescribes the Linear issue URL on magic-word lines", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    expect(content).toContain("Closes https://linear.app");
    // Negative guard: the pre-#387 prescription must not resurface.
    expect(content).not.toContain("`**Issues:**` uses `Closes ENG-123`");
  });

  test.each(prBodySkills)("%s instructs a bare-reference self-check on the drafted body", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    expect(content).toContain("self-check the drafted body");
  });

  test("pr:review cites the linked ticket as a link built from the issue url", async () => {
    const content = await readFile(join(skillsDir, "pr:review", "SKILL.md"), "utf8");
    expect(content).toContain("cite it as a markdown link built from");
  });

  test.each([
    join(repoRoot, "claude-plugins/autopilot/agents/resolve-issue-context.md"),
    join(repoRoot, "claude-plugins/autopilot/agents/analyze-pr-commits.md"),
  ])("%s exposes the issue url in its output contract", async (file) => {
    const content = await readFile(file, "utf8");
    expect(content).toContain("`url`");
  });
});
