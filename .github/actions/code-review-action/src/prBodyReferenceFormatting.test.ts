/**
 * Guards that the output-generating autopilot skills explicitly instruct the model to
 * apply the reference-formatting rules (RFC-0001): pr-create and pr-update (PR
 * bodies, issue #279) plus plan, gather-context, run, and issue-create
 * (plan files, Context Maps, and issue bodies, issue #334), and pr-review (review verdict bodies —
 * wefortis/fortune-os PR 93 review 4619732611 cited files and standards as backticked
 * dead text). Inlining the rules alone never made the generators apply them, so generated
 * output escaped the standard; this asserts the apply-instruction itself survives.
 *
 * Issue #479 moved the rules out of each skill into the shared-rules skill, so the
 * instruction and the rules are now one sentence: a skill reaches the rules ONLY by being
 * told to read them. That fuses this guard's two former halves. The old positional trick —
 * slicing the text before `<!-- ref-format:start -->` so the inlined block could not
 * satisfy the assertion by accident — is therefore gone, and safely: no consumer contains
 * the block any more (sharedRulesInvocation.test.ts asserts that), so the only possible
 * match is the directive itself. The defect this guarded, "rules present but nothing says
 * to apply them", is now unrepresentable rather than merely tested for.
 *
 * Still a presence-guard: CI sees text in a file and cannot prove the model reads the
 * block at runtime.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Depth mirrors sharedBlockSync.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const sharedReferences = join(skillsDir, "shared-rules/references");

// Load-bearing phrase: the apply-instruction each skill carries in its body-
// generation phase. Reword it only alongside this test.
const applyInstruction = "reference-formatting rules in [`reference-formatting.md`]";

const skills = ["pr-create", "pr-update", "plan", "gather-context", "run", "issue-create", "linear-create", "pr-review"];

describe("output reference-formatting wiring", () => {
  test.each(skills)("%s instructs the body generator to apply RFC-0001", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    expect(content).toContain(applyInstruction);
  });
});

// Issue #387: bare Linear ids in generated output are dead text on GitHub. The PR-body
// skills must prescribe the plain issue URL on magic-word lines (the form Linear's
// parser and GitHub's autolinker both accept), pr-review must link the ticket it
// cites, and the producing agent contracts must expose the issue `url` the skills
// build those links from. Presence-guards in the style of the wiring test above.
describe("linear issue linking (issue #387)", () => {
  const prBodySkills = ["pr-create", "pr-update"];

  // The magic-word grammar itself moved into the shared block (issue #479), so it is
  // asserted once at its canonical home rather than twice in the consuming skills —
  // asserting it per-skill would reward re-inlining the very copy #479 removed.
  test("the shared PR-body grammar prescribes the Linear issue URL on magic-word lines", async () => {
    const content = await readFile(join(sharedReferences, "pr-body-grammar.md"), "utf8");
    expect(content).toContain("Closes https://linear.app");
    // Negative guard: the pre-#387 prescription must not resurface.
    expect(content).not.toContain("`**Issues:**` uses `Closes ENG-123`");
  });

  test.each(prBodySkills)("%s points at the shared PR-body grammar", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    expect(content).toContain("shared-rules/references/pr-body-grammar.md");
  });

  test.each(prBodySkills)("%s instructs a bare-reference self-check on the drafted body", async (skill) => {
    const content = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    expect(content).toContain("self-check the drafted body");
  });

  test("pr-review cites the linked ticket as a link built from the issue url", async () => {
    const content = await readFile(join(skillsDir, "pr-review", "SKILL.md"), "utf8");
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
  const reviewSkill = join(skillsDir, "pr-review", "SKILL.md");

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
