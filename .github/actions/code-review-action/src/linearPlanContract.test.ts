/**
 * Guards the contract between `linear:plan`, which stores an implementation plan in a
 * Linear issue's description, and `linear:run`, which executes that stored plan verbatim.
 *
 * Five properties are load-bearing, and each fails silently without a guard:
 *
 * 1. The stored-plan section names `linear:run` reads match the ones `linear:plan` writes.
 *    This is the real rot: the two files have no import between them, so renaming a
 *    section in the producer breaks the consumer with nothing failing in between.
 * 2. `linear:run` enumerates every validation verdict with an actionable message. A
 *    verdict quietly dropped turns a strict gate into a permissive one.
 * 3. `linear:run` never dispatches `linear:plan`. An automatic re-plan discards the human
 *    review the stored plan represents and substitutes an unreviewed one, looking like
 *    success — the opposite of what a strict consumer is for.
 * 4. The two skills agree on the stored format version. `Format:` is the only thing that
 *    keeps "written under an older template" apart from "corrupt", and a version the
 *    producer writes but the consumer does not read collapses that distinction.
 * 5. One scoring threshold governs every caller. The threshold is read out of
 *    `pipeline.md` rather than asserted as a literal, so tuning it stays a one-file
 *    change — but a caller that restates it must restate the same number.
 *
 * The section names and the threshold are extracted from the producer's own text rather
 * than hardcoded, so the guard tracks the source instead of a copy of it.
 *
 * What this CANNOT prove: that the gate runs, or that the model honours it. CI sees text
 * in a file, nothing more — the same limit `sharedRulesInvocation.test.ts` states for its
 * own presence checks. Worse here, no workflow executes this test at all (nothing under
 * `.github/workflows/` runs `bun test`), so it gates locally and in review, not in CI.
 * Runtime evidence comes from the dry-run recorded on the PR.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

const readSkill = (name: string): Promise<string> =>
  readFile(join(skillsDir, name, "SKILL.md"), "utf8");

const [linearPlan, linearRun, plan, run, runPrimed, pipeline] = await Promise.all([
  readSkill("linear:plan"),
  readSkill("linear:run"),
  readSkill("plan"),
  readSkill("run"),
  readSkill("run-primed"),
  readFile(join(skillsDir, "plan/references/pipeline.md"), "utf8"),
]);

/** Every verdict `linear:run`'s validation table must name, rejecting ones first. */
const rejectingVerdicts = ["missing", "version-mismatch", "malformed", "unverifiable"];
const allVerdicts = [...rejectingVerdicts, "valid"];

/**
 * `### <name>` rows of the stored-plan template in `linear:plan`, split by its own
 * required/caller-owned marker. Reading the producer's template is what makes a renamed
 * section fail here rather than at runtime against a live ticket.
 */
function storedSections(source: string, kind: "required" | "caller-owned"): string[] {
  const rows = source.matchAll(/^###\s+(.+?)\s+<-\s+(required|caller-owned)$/gm);
  return [...rows].filter((row) => row[2] === kind).map((row) => row[1].trim());
}

const requiredSections = storedSections(linearPlan, "required");
const callerOwnedSections = storedSections(linearPlan, "caller-owned");

/** The `Source | Section` table rows in `linear:run`, keyed by the source cell. */
function sectionTableRow(source: string, key: string): string {
  const row = source
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .find((cells) => cells.length > 2 && cells[1] === key);
  return row ? row[2] : "";
}

/** The scoring threshold the shared pipeline states, e.g. `98` from `Scoring target: 98+`. */
const threshold = pipeline.match(/Scoring target:\s*(\d+)\+/)?.[1] ?? "";

/** The revision budget the shared pipeline states, e.g. `three` from `at most three passes`. */
const passBudget = pipeline.match(/at most (\w+) passes/)?.[1] ?? "";

describe("linear plan contract", () => {
  test("the stored-plan template still exposes a required/caller-owned split", () => {
    expect(requiredSections.length).toBeGreaterThan(1);
    expect(callerOwnedSections.length).toBeGreaterThan(0);
  });

  test.each(allVerdicts)("linear:run names the %s verdict", (verdict) => {
    expect(linearRun).toContain(`**${verdict}**`);
  });

  test.each(rejectingVerdicts)("the %s verdict carries an actionable message", (verdict) => {
    const message = linearRun.split("\n").find((line) => line.startsWith(`- ${verdict} —`));
    expect(`${verdict}: ${message ?? "<no message line>"}`).toContain("/autopilot:linear-plan");
  });

  test("linear:run cannot silently re-plan", () => {
    expect(linearRun).not.toContain("Skill(autopilot:linear-plan)");
  });

  test.each([
    ["stored", "This skill reads; it never writes a plan"],
    ["snapshot", "The plan is a snapshot, not a live view"],
  ])("linear:run states the %s precondition", (_label, needle) => {
    expect(linearRun).toContain(needle);
  });

  test.each(requiredSections)("linear:run consumes `### %s` from the stored plan", (name) => {
    expect(sectionTableRow(linearRun, "Stored plan")).toContain(`\`### ${name}\``);
  });

  test.each(callerOwnedSections)("`### %s` is stored but explicitly not consumed", (name) => {
    expect(sectionTableRow(linearRun, "Stored plan, **unused**")).toContain(`\`### ${name}\``);
    expect(sectionTableRow(linearRun, "Stored plan")).not.toContain(`\`### ${name}\``);
  });

  test("both skills agree on the stored format version", () => {
    const written = linearPlan.match(/Format:\s*(v\d+)/)?.[1];
    expect(written).toBeTruthy();
    expect(linearRun).toContain(`\`${written}\``);
  });

  test("the shared pipeline states one threshold and one revision budget", () => {
    expect(threshold).not.toBe("");
    expect(passBudget).not.toBe("");
    for (const rule of ["is below", "still scores below"]) {
      const line = pipeline.split("\n").find((l) => l.includes(rule));
      expect(`${rule}: ${line ?? "<absent>"}`).toContain(threshold);
    }
  });

  test("linear:plan restates the pipeline's threshold and budget, not its own", () => {
    expect(linearPlan).toContain(`${threshold} or above`);
    expect(linearPlan).toContain(`Below ${threshold}`);
    expect(linearPlan).toContain(`${passBudget}-pass`);
  });

  test("the pipeline reconciles below-threshold behaviour per caller", () => {
    const [, belowThreshold = ""] = pipeline.split("Report honestly");
    for (const caller of ["`plan`", "`run`", "`run-primed`", "`linear:plan`"]) {
      expect(belowThreshold).toContain(caller);
    }
  });

  test("linear:plan refuses to store below the threshold without discarding the plan", () => {
    expect(linearPlan).toContain("emit the full plan text into the transcript");
  });

  test("the unchanged callers state no threshold of their own", () => {
    for (const [name, source] of [
      ["plan", plan],
      ["run", run],
      ["run-primed", runPrimed],
    ] as const) {
      expect(`${name}: ${source.includes("Scoring target")}`).toBe(`${name}: false`);
    }
  });

  test("ordinary plan and run know nothing of the stored plan", () => {
    for (const [name, source] of [
      ["plan", plan],
      ["run", run],
      ["run-primed", runPrimed],
    ] as const) {
      expect(`${name}: ${source.includes("## Implementation plan")}`).toBe(`${name}: false`);
    }
  });
});
