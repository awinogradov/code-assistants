/**
 * Guards the contract between `linear:plan`, which stores an implementation plan in a
 * Linear issue's description, and `linear:run`, which executes a valid stored plan
 * verbatim or falls back to a run-local fresh plan when the artifact is unusable.
 *
 * Five properties are load-bearing, and each fails silently without a guard:
 *
 * 1. The stored-plan section names `linear:run` reads match the ones `linear:plan` writes.
 *    This is the real rot: the two files have no import between them, so renaming a
 *    section in the producer breaks the consumer with nothing failing in between.
 * 2. `linear:run` enumerates every validation verdict and maps it to an execution mode.
 *    A verdict quietly dropped can turn an unusable artifact into executable instructions.
 * 3. `linear:run` never dispatches `linear:plan` or rewrites the ticket. Its fresh-plan
 *    path must remain a run-local fallback rather than silently replacing the artifact.
 * 4. The two skills agree on the stored format version. `Format:` is the only thing that
 *    keeps "written under an older template" apart from "corrupt", and a version the
 *    producer writes but the consumer does not read collapses that distinction.
 * 5. Expert review is an enhancement, never a gate. The pipeline states no scoring
 *    threshold and no revision budget, and `linear:plan` stores unconditionally with
 *    no plan-mode transition — a re-introduced gate would silently start losing plans.
 * 6. Expert review is opt-in for `plan` alone. The pipeline names `plan` as the only
 *    caller that may skip the step and records an explicit skipped score; the
 *    `--experts-review` flag lives in `plan` and nowhere else, so no other caller can
 *    quietly grow the skip.
 *
 * The section names are extracted from the producer's own text rather than hardcoded,
 * so the guard tracks the source instead of a copy of it.
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

/** Every verdict `linear:run`'s validation table must name, fallback ones first. */
const fallbackVerdicts = ["missing", "version-mismatch", "malformed", "unverifiable"];
const allVerdicts = [...fallbackVerdicts, "valid"];

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

describe("linear plan contract", () => {
  test("the stored-plan template still exposes a required/caller-owned split", () => {
    expect(requiredSections.length).toBeGreaterThan(1);
    expect(callerOwnedSections.length).toBeGreaterThan(0);
  });

  test.each(allVerdicts)("linear:run names the %s verdict", (verdict) => {
    expect(linearRun).toContain(`**${verdict}**`);
  });

  test.each(fallbackVerdicts)("the %s verdict selects a fresh plan", (verdict) => {
    const message = linearRun.split("\n").find((line) => line.startsWith(`- ${verdict} —`));
    expect(`${verdict}: ${message ?? "<no message line>"}`).toContain(
      "drafting a fresh implementation plan",
    );
  });

  test("the verdict table maps valid to stored-plan and every other verdict to fresh-plan", () => {
    const validRow = linearRun
      .split("\n")
      .find((line) => line.includes("| **valid**") && line.includes("`stored-plan`"));
    const fallbackRow = linearRun
      .split("\n")
      .find(
        (line) =>
          line.includes("`fresh-plan`") &&
          fallbackVerdicts.every((verdict) => line.includes(`**${verdict}**`)),
      );
    expect(validRow).toContain("`stored-plan`");
    expect(fallbackRow).toContain("`fresh-plan`");
  });

  test("linear:run never invokes the producer or overwrites the stored artifact", () => {
    expect(linearRun).not.toContain("Skill(autopilot:linear-plan)");
    expect(linearRun).toContain("never writes or repairs a stored plan");
    expect(linearRun).toContain("Do not store it on the Linear issue");
  });

  test.each([
    ["admission", "Only the Linear issue is required"],
    ["snapshot", "The plan is a snapshot, not a live view"],
  ])("linear:run states the %s contract", (_label, needle) => {
    expect(linearRun).toContain(needle);
  });

  test("linear:run uses the shared planning pipeline for its fresh-plan path", () => {
    expect(linearRun).toContain("[pipeline.md](../plan/references/pipeline.md)");
    expect(linearRun).toContain('task 4 ("Establish plan")');
    expect(linearRun).toContain('task 5 ("Validate plan")');
    expect(linearRun).toContain('task 6 ("Finalize plan")');
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

  test("the pipeline states no scoring threshold and no revision budget", () => {
    expect(pipeline).not.toContain("Scoring target");
    expect(pipeline).not.toMatch(/at most \w+ passes/);
    expect(pipeline).toContain("not a gate for any caller");
  });

  test("linear:plan stores unconditionally, with no plan-mode transition", () => {
    expect(linearPlan).toContain("Storing is unconditional");
    expect(linearPlan).toContain("Do not add a separate approval step");
    expect(linearPlan).not.toContain("ExitPlanMode");
    expect(linearPlan).not.toContain("EnterPlanMode");
    expect(linearPlan).not.toContain("Decide whether to store");
  });

  test("linear:run treats the stored plan as a durable artifact, not proof of approval", () => {
    expect(linearRun).toContain("checkable durable artifact");
    expect(linearRun).not.toContain("approval already happened when the plan was stored");
    expect(linearRun).not.toContain("plan somebody approved");
  });

  test.each([
    ["revision", "Stored plan was drafted against"],
    ["path", "path(s) that no longer exist"],
  ])("linear:run reports %s drift", (_label, needle) => {
    expect(linearRun).toContain(needle);
  });

  test("both drift reports stay advisory rather than becoming verdicts", () => {
    const [, drift = ""] = linearRun.split("report how far the plan has aged");
    expect(drift).toContain("advisory and never a verdict");
    // A drift report must not be smuggled in as a sixth plan-source verdict.
    for (const verdict of fallbackVerdicts) {
      expect(`drift section names ${verdict}: ${drift.includes(`**${verdict}**`)}`).toBe(
        `drift section names ${verdict}: false`,
      );
    }
  });

  /**
   * Both carve-outs guard the same failure: the plan template stores an existing file as
   * `path/to/file.ts:NN` and a planned one with a `(new)` suffix, so a literal existence
   * test on the raw entry reports every file as missing — the cry-wolf outcome that would
   * make the report worthless.
   */
  test.each([
    ["files it intends to create", "absent by design"],
    ["a trailing line number", "Strip a trailing"],
  ])("the path check handles %s", (_label, needle) => {
    const [, drift = ""] = linearRun.split("**Path drift.**");
    expect(drift).toContain(needle);
  });

  test("the pipeline gates the review step on plan alone", () => {
    expect(pipeline).toContain("the only caller that may skip");
    expect(pipeline).toContain("Score: skipped");
  });

  test("plan's argument-hint carries the --experts-review flag", () => {
    expect(plan).toMatch(/argument-hint:.*--experts-review/);
  });

  test.each([
    ["linear:plan", linearPlan],
    ["linear:run", linearRun],
    ["run", run],
    ["run-primed", runPrimed],
  ])("%s does not claim the --experts-review flag", (name, source) => {
    expect(`${name}: ${source.includes("--experts-review")}`).toBe(`${name}: false`);
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
