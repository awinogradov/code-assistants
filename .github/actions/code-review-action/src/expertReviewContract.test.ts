/**
 * Guards the contract between the `expert-review` agent, which returns a scored plan
 * review, and `pipeline.md`, which aggregates a panel of them into the plan's single score.
 *
 * The reason this guard exists: the agent repeatedly returned confident reviews built on
 * file contents it had never read, reporting no tool use, and its own prose prohibition
 * against doing so did not stop it. The fix is not a stronger instruction — it is a
 * declared `grounding` field the parent can screen, and a parent that discards rather
 * than averages a review that fails the screen. Both halves have to stay in place for
 * either to be worth anything, and they live in two prompt files with no import between
 * them, so nothing but a test relates them.
 *
 * Three properties are load-bearing:
 *
 * 1. The field list the agent emits matches the one the pipeline says it receives. The
 *    field names are parsed from the agent's own output table rather than hardcoded, so
 *    renaming one fails here instead of silently dropping from the screen.
 * 2. The pipeline states the discard rule and every condition that triggers it. A
 *    condition quietly deleted turns the screen back into an average-everything step.
 * 3. The pipeline refuses to present a shrunken panel as a consensus. Two of five
 *    reviewers failing is the observed case, and reporting the survivor's score as a
 *    panel aggregate is how that becomes invisible.
 *
 * What this CANNOT prove: that the screen runs, or that a reviewer declares its grounding
 * honestly — a fabricated `grounding` entry is still possible and is exactly why the
 * pipeline also screens for the no-tool-use contradiction rather than trusting the field
 * alone. CI sees text in a file, nothing more.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const autopilotDir = join(repoRoot, "claude-plugins/autopilot");

const [agent, pipeline, chapter] = await Promise.all([
  readFile(join(autopilotDir, "agents/expert-review.md"), "utf8"),
  readFile(join(autopilotDir, "skills/plan/references/pipeline.md"), "utf8"),
  readFile(join(repoRoot, "docs/05-plan-run-skills.md"), "utf8"),
]);

/**
 * The `| \`field\` |` rows of the agent's Phase 4 output table, sliced to that section so
 * the five-dimension rubric table above it does not leak in.
 */
function outputFields(source: string): string[] {
  const section = source.split("## Phase 4: Output")[1]?.split("Example (illustrative")[0] ?? "";
  return [...section.matchAll(/^\|\s*`(\w+)`/gm)].map((row) => row[1]);
}

/** The backticked names on the pipeline's "Each returns JSON (…)" line. */
function pipelineFields(source: string): string[] {
  const line = source.split("\n").find((l) => l.startsWith("Each returns JSON ("));
  return [...(line ?? "").matchAll(/`(\w+)`/g)].map((m) => m[1]);
}

/**
 * Top-level keys of the `expert-review` payload sketch in chapter 5's sub-agent contract
 * list — a third copy of the same contract, and the one that already drifted once.
 * Nested keys inside `dimensions{…}` are stripped so only the outer shape is compared.
 */
function chapterFields(source: string): string[] {
  const line = source.split("\n").find((l) => l.startsWith("- `expert-review` →"));
  const body = (line ?? "").replace(/(\w)\{[^{}]*\}/g, "$1");
  return [...body.matchAll(/[{,]\s*(\w+)/g)].map((m) => m[1]);
}

const declared = outputFields(agent);

describe("expert review contract", () => {
  test("the agent's output table is parseable and non-trivial", () => {
    expect(declared.length).toBeGreaterThan(4);
    expect(declared).toContain("findings");
  });

  test("the agent declares a grounding field", () => {
    expect(declared).toContain("grounding");
  });

  test("grounding is required, not optional", () => {
    const row = agent.split("\n").find((l) => /^\|\s*`grounding`/.test(l)) ?? "";
    expect(`grounding row: ${row}`).toContain("Never empty");
  });

  test("the example payload carries grounding, so the shape is copyable", () => {
    const example = agent.split("```json")[1]?.split("```")[0] ?? "";
    expect(example).toContain('"grounding"');
  });

  test("the pipeline receives exactly the fields the agent emits", () => {
    expect(pipelineFields(pipeline).sort()).toEqual([...declared].sort());
  });

  test("chapter 5 documents exactly the fields the agent emits", () => {
    expect(chapterFields(chapter).sort()).toEqual([...declared].sort());
  });

  test("chapter 5 records that an ungrounded review is discarded, not averaged", () => {
    expect(chapter).toContain("discarded rather than averaged");
  });

  test.each([
    ["empty grounding", "`grounding` is absent or empty"],
    ["unparseable report", "not parseable as the JSON contract"],
    ["no-tool-use contradiction", "reported no tool use"],
  ])("the pipeline names the %s discard condition", (_label, needle) => {
    expect(pipeline).toContain(needle);
  });

  test("the pipeline discards rather than averages", () => {
    const [, screen = ""] = pipeline.split("Discard an ungrounded review");
    expect(screen).toContain("Name every discard");
    expect(screen).toContain("never silently shrink the panel");
  });

  test("a shrunken panel is not reported as a consensus", () => {
    expect(pipeline).toContain("single surviving reviewer is a single opinion");
    expect(pipeline).toContain("report that the plan is unreviewed");
  });

  test("the agent still forbids asserting unread file contents", () => {
    expect(agent).toContain("an inferred file listing is a fabrication");
    expect(agent).toContain("Do not list a file you did not open");
  });
});
