/**
 * Guards the Graphify evidence contract inside the repomix-snapshot shared block
 * (claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md), added for
 * issue #597: `context-source: graphify` used to be a label anyone could write. Availability
 * made the tier eligible, and eligibility read as selection — so a holder could declare the
 * graph, query nothing, and traverse the tree exactly as before, which is the run #586
 * audited. The tier now has to earn its label with a query that happened, hand on a bounded
 * shortlist rather than a source name, and record every exit from itself.
 *
 * The contract carries its OWN nested sentinel (`graphify-evidence`) inside the outer block,
 * for the reason graphifyRefinementContract.test.ts states about its own: the surrounding
 * text already contains "shortlist", "queries", and "graphify", so whole-block substring
 * checks would pass before a word of this contract was written. Extracting the inner
 * sentinel makes the assertions mean what they say, and the block is asserted present and
 * substantial first — the vacuous-pass defence both sibling guards use, since a missing
 * sentinel extracts nothing and every substring check on "" succeeds.
 *
 * Record lines and transition reasons are explicit test data, one assertion per token, so
 * dropping a line from the record or a reason from the taxonomy fails loudly instead of
 * shrinking the contract in silence.
 *
 * What this CANNOT prove: that a session honours any of it. This file reads text, exactly
 * like the two guards beside it. The executable half of issue #597 lives in
 * graphifyEvidence.test.ts (the contract as runnable code) and graphifyEvidenceFixture.test.ts
 * (a conformance harness driving a real stubbed CLI); neither executes a Claude session
 * either, and each says so in its own header. Evidence that production runs comply comes
 * from the post-merge canary — and now from a durable place to look for it, since the
 * selection is recorded in the plan file rather than only in a transcript.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Depth mirrors contextSourceContract.test.ts in this directory — a move of the
// action updates all three in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");

const blockPath = join(
  repoRoot,
  "claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md",
);
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

/** Shortest the contract can be; anything smaller means the extraction went wrong. */
const minBlockLength = 80;

/**
 * The three lines that make up the evidence record. A consumer receiving fewer than all
 * three received a claim rather than an artifact, so each is pinned separately.
 */
const recordLines = ["context-source: graphify", "graphify-trace:", "graphify-shortlist:"];

/**
 * Why a holder left tier 1. Distinct from the six `context-fallback:` reasons, which
 * explain one read outside a selection that is still live.
 *
 * Kept local rather than imported from graphifyEvidence.ts on purpose: this guard must be
 * able to fail on the markdown alone, and importing the validator would make a missing
 * module — not a missing contract — the reason it goes red.
 */
const transitionReasons = ["unavailable", "error", "refinement-exhausted"];

/** Read a file, failing with its absolute path rather than a bare ENOENT at module load. */
async function readContract(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(`Cannot read contract file: ${path}`, { cause });
  }
}

/** Extract the named sentinel-delimited block from `content`, trimmed; null when absent. */
function extractBlock(content: string, sentinel: string): string | null {
  const pattern = new RegExp(`<!-- ${sentinel}:start -->([\\s\\S]*?)<!-- ${sentinel}:end -->`);
  return pattern.exec(content)?.[1].trim() ?? null;
}

const [blockSource, gatherContext, linearRun, pipeline, run, packDoc, linearRunDoc, planRunDoc] =
  await Promise.all([
    readContract(blockPath),
    readContract(join(skillsDir, "gather-context/SKILL.md")),
    readContract(join(skillsDir, "linear-run/SKILL.md")),
    readContract(join(skillsDir, "plan/references/pipeline.md")),
    readContract(join(skillsDir, "run/SKILL.md")),
    readContract(join(repoRoot, "docs/09-repomix-pack.md")),
    readContract(join(repoRoot, "docs/17-linear-run-skill.md")),
    readContract(join(repoRoot, "docs/05-plan-run-skills.md")),
  ]);

const evidence = extractBlock(blockSource, "graphify-evidence");

/**
 * The Context Map template's `**Snapshot**` row — the only channel by which a selection
 * reaches a calling skill, so it is extracted rather than substring-matched, as
 * contextSourceContract.test.ts does for the same row.
 */
const snapshotField =
  gatherContext.split("\n").find((line) => line.startsWith("**Snapshot** —")) ?? "";

/** The literal stop linear-run emits when a graphify label arrives with nothing behind it. */
const unevidencedSelection =
  "Context phase failed on <LINEAR-ID>: gather-context declared graphify with no query evidence.";

/** Both plan modes must consume the record; a stored plan is not a licence to skip it. */
const planModes = ["stored-plan", "fresh-plan"];

/** Anchor for the consumption obligation, for the reason `boundsBothModes` is anchored. */
const consumesRecord = "**Both modes consume the evidence record before traversal.**";

describe("graphify evidence contract", () => {
  test("the nested sentinel block exists and is substantial", () => {
    expect(evidence).not.toBeNull();
    expect(evidence?.length ?? 0).toBeGreaterThan(minBlockLength);
  });

  test("it lives inside the repomix-snapshot block it constrains", () => {
    const outer = extractBlock(blockSource, "repomix-snapshot");
    expect(outer).not.toBeNull();
    expect(outer).toContain("graphify-evidence:start");
  });

  test("the label follows a query that actually ran", () => {
    expect(evidence).toContain("exited zero");
    expect(evidence).toContain("at least one");
  });

  test("eligibility is distinguished from selection", () => {
    expect(evidence).toContain("Availability is not evidence");
  });

  test.each(recordLines)("the record carries %s", (line) => {
    expect(evidence).toContain(line);
  });

  test("a shortlist entry carries the relationship that justifies it", () => {
    expect(evidence).toContain("relationship");
    expect(evidence).toMatch(/^- \S.* — .+$/m);
  });

  test("an incomplete record is an unrecorded selection, not a weak one", () => {
    expect(evidence).toContain("queries=0");
    expect(evidence).toContain("not a selection");
  });

  test("a successor is a full selection, not a bare tier name", () => {
    expect(evidence).toContain("superseding graphify (");
    expect(evidence).toContain("repomix <outputId>");
    expect(evidence).toContain("default <reason>");
  });

  test.each(transitionReasons)("the transition taxonomy names %s", (reason) => {
    expect(evidence).toContain(reason);
  });

  test("transition reasons are told apart from fallback reasons", () => {
    expect(evidence).toContain("context-fallback:");
    expect(evidence).toContain("still live");
  });

  test("the pre-taxonomy hand-over wording is gone from the whole block", () => {
    // The spaced form cannot be matched by a machine-readable reason token, so it must be
    // rewritten rather than left beside its replacement in the refinement block.
    expect(blockSource).not.toContain("(refinement exhausted)");
  });
});

describe("gather-context emits the record", () => {
  test("the graph label waits for a query to return", () => {
    expect(gatherContext).toContain("exited zero");
  });

  test("a pass that cannot produce a record leaves through the transition line", () => {
    expect(gatherContext).toContain("superseding graphify");
  });

  test.each(recordLines)("the Snapshot field carries %s", (line) => {
    expect(snapshotField).toContain(line.replace("context-source: graphify", "context-source:"));
  });
});

describe("linear-run rejects an unevidenced selection", () => {
  test("the literal stop exists", () => {
    expect(linearRun).toContain(unevidencedSelection);
  });

  test("the stop is fatal and names what was missing", () => {
    const [, gate = ""] = linearRun.split(unevidencedSelection);
    expect(gate).toContain("fatal");
    expect(gate).toContain("shortlist");
  });

  test("the gated perimeter is stated rather than left implied", () => {
    expect(linearRun).toContain("ungated");
  });

  test("the consumption obligation is present", () => {
    expect(linearRun).toContain(consumesRecord);
  });

  test.each(planModes)("the consumption obligation binds %s mode", (mode) => {
    const obligation = linearRun.split(consumesRecord)[1]?.split("\n\n")[0] ?? "";
    expect(`${mode}: ${obligation.includes(`\`${mode}\``)}`).toBe(`${mode}: true`);
  });
});

describe("the plan file carries the handoff", () => {
  test("the template gains a context-source section", () => {
    expect(pipeline).toContain("## Context source");
  });

  test("a plan written before this change is not a stop", () => {
    expect(pipeline).toContain("unrecorded source");
  });

  test("implementation serves repository questions from the recorded section", () => {
    expect(run).toContain("## Context source");
  });
});

describe("the documentation matches the contract", () => {
  test("the pack chapter documents the evidence record", () => {
    expect(packDoc).toContain("graphify-shortlist:");
  });

  test("the pack chapter states what the new tests cannot prove", () => {
    expect(packDoc).toContain("graphifyEvidenceFixture.test.ts");
    expect(packDoc).toContain("does not execute a session");
  });

  test("the pack chapter no longer prints the pre-taxonomy hand-over", () => {
    expect(packDoc).not.toContain("(refinement exhausted)");
  });

  test("the linear-run chapter documents the second gate", () => {
    expect(linearRunDoc).toContain("graphifyEvidenceContract.test.ts");
    expect(linearRunDoc).toContain("no query evidence");
  });

  test("the plan/run chapter lists the new template section", () => {
    expect(planRunDoc).toContain("## Context source");
  });
});
