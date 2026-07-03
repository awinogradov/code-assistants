/**
 * Guards that the output-generating autopilot skills explicitly instruct the model to
 * apply the inlined reference-formatting rules (RFC-0001): pr:create and pr:update (PR
 * bodies, issue #279) plus plan, plan-bun, plan-nodejs-react, run, and issue:create
 * (plan files and issue bodies, issue #334), and pr:review (review verdict bodies —
 * wefortis/fortune-os PR 93 review 4619732611 cited files and standards as backticked
 * dead text). Each already inlines the canonical block —
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

const skills = ["pr:create", "pr:update", "plan", "plan-bun", "plan-nodejs-react", "run", "issue:create", "linear:create", "pr:review"];

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

// wefortis/fortune-os PR 93 review 4619732611: review bodies cited files and standards
// as backticked dead text — the body templates demonstrated the backticked form, so the
// inlined mandate lost (the same dynamic issue #387 recorded for reply templates). These
// pin the linked-form templates and the `<pr-blob-url>` recipe. Links pin the reviewed
// headRefOid — valid for fork PRs too, whose head commits stay reachable in the base
// repo via refs/pull/N/head.
describe("review body file links", () => {
  const reviewSkill = join(skillsDir, "pr:review", "SKILL.md");

  test("defines the PR blob base from the reviewed head commit", async () => {
    const content = await readFile(reviewSkill, "utf8");
    expect(content).toContain("https://github.com/<REPO>/blob/<headRefOid>");
    expect(content).toContain("reviewDecision,headRefOid");
  });

  test("templates demonstrate the linked finding-location and anchor forms", async () => {
    const content = await readFile(reviewSkill, "utf8");
    expect(content).toContain("[src/path/to/file.ts:NN](<pr-blob-url>/src/path/to/file.ts#LNN)");
    expect(content).toContain("?plain=1#L");
    expect(content).toContain("#<heading-anchor>");
  });

  test("scopes linking to resolvable targets with a pre-emit self-check", async () => {
    const content = await readFile(reviewSkill, "utf8");
    expect(content).toContain("NEVER linked by guess");
    expect(content).toContain("bare 7–40-char hex token");
  });

  // Negative guards pinned to the exact pre-fix tokens; the intentionally retained
  // backticked forms (inline-comment own anchor, the NOT `processor.ts:66` contrast)
  // must not trip them.
  test("the backticked finding-location templates do not resurface", async () => {
    const content = await readFile(reviewSkill, "utf8");
    expect(content).not.toContain("- `src/path/to/file.ts:NN` -");
    expect(content).not.toContain("`src/webhooks/payment.ts:45`");
    expect(content).not.toContain("`src/webhooks/payment.ts:62`");
  });

  // wefortis/fortune-os PR 116 review 4627462294: finding LOCATIONS linked, but file/doc
  // mentions in the prose and summary sentence (apps/.../steps.ts, docs/03-playwright.md,
  // RFC-0002) stayed backticked — the self-check only flagged paths WITH a line number and
  // no example modeled an in-prose mention. These pin the broadened self-check plus a worked
  // example that links a no-line mention while sparing a glob code specimen.
  test("links no-line prose/summary mentions while sparing code-specimen paths", async () => {
    const content = await readFile(reviewSkill, "utf8");
    // self-check broadened: covers no-line mentions and the summary sentence
    expect(content).toContain("with OR without a line number");
    expect(content).toContain("including the summary sentence");
    // example models a linked doc in the summary + a linked no-line file mention in prose
    expect(content).toContain("[docs/webhooks.md](<pr-blob-url>/docs/webhooks.md)");
    expect(content).toContain("[src/webhooks/config.ts](<pr-blob-url>/src/webhooks/config.ts)");
    // globs/keys stay backticked, not linked
    expect(content).toContain("code specimen, not a reference");
  });
});
