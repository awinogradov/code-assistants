/**
 * Guards the contract between `explore`, which writes the durable context brief, and
 * `run-primed`, which consumes it instead of re-mapping the repository.
 *
 * Three properties are load-bearing, and each fails silently without a guard:
 *
 * 1. `run-primed` enumerates every validation verdict with an actionable message. A
 *    verdict quietly dropped turns a strict gate into a permissive one.
 * 2. `run-primed` never dispatches `run`. The whole point is that an unusable brief is
 *    visible; an automatic downgrade spends a second full context pass looking like success.
 * 3. The brief section names `run-primed` reads match the ones `explore` writes. This is the
 *    real rot: the two files have no import between them, so renaming a section in the
 *    producer breaks the consumer with nothing failing in between.
 *
 * The section names are extracted from `explore`'s own template rather than hardcoded, so
 * the guard tracks the producer instead of a copy of it.
 *
 * What this CANNOT prove: that the gate runs, or that the model honours it. CI sees text in
 * a file, nothing more — the same limit `sharedRulesInvocation.test.ts` states for its own
 * presence checks. Worse here, no workflow executes this test at all (nothing under
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

const [runPrimed, run, explore, gatherContext] = await Promise.all([
  readSkill("run-primed"),
  readSkill("run"),
  readSkill("explore"),
  readSkill("gather-context"),
]);

/** Every verdict the validation table must name, rejecting ones first. */
const rejectingVerdicts = ["missing", "malformed", "revision-mismatch", "stale"];
const allVerdicts = [...rejectingVerdicts, "valid"];

/**
 * `## <name>` rows of the brief template in `explore`, split by its own stable/volatile
 * marker. Reading the producer's template is what makes a renamed section fail here rather
 * than at runtime in a forked session.
 */
function briefSections(source: string, kind: "stable" | "volatile"): string[] {
  const rows = source.matchAll(/^##\s+(.+?)\s+<-\s+(stable|volatile)$/gm);
  return [...rows].filter((row) => row[2] === kind).map((row) => row[1].trim());
}

/**
 * `## Snapshot` is stable, yet `run-primed` must not consume it: the repomix `outputId` the
 * brief records is session-scoped and dead in a forked session, so the pack is re-attached.
 * Named here rather than filtered implicitly, so dropping a second section stays reviewable.
 */
const notConsumed = new Set(["Snapshot"]);

const stableSections = briefSections(explore, "stable");
const consumedSections = stableSections.filter((name) => !notConsumed.has(name));

/** The `Source | Section` table rows in `run-primed`, keyed by the source cell. */
function sectionTableRow(source: string, key: string): string {
  const row = source
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .find((cells) => cells.length > 2 && cells[1] === key);
  return row ? row[2] : "";
}

describe("primed brief contract", () => {
  test("the brief template still exposes a stable/volatile split", () => {
    expect(stableSections).toContain("Snapshot");
    expect(stableSections.length).toBeGreaterThan(1);
    expect(briefSections(explore, "volatile").length).toBeGreaterThan(0);
  });

  test.each(allVerdicts)("run-primed names the %s verdict", (verdict) => {
    expect(runPrimed).toContain(`**${verdict}**`);
  });

  test.each(rejectingVerdicts)("the %s verdict carries an actionable message", (verdict) => {
    const message = runPrimed
      .split("\n")
      .find((line) => line.startsWith(`- ${verdict} —`));
    expect(`${verdict}: ${message ?? "<no message line>"}`).toContain("/autopilot:run");
  });

  test("run-primed cannot silently downgrade to run", () => {
    expect(runPrimed).not.toContain("Skill(autopilot:run)");
  });

  test.each([
    [".claude/context/", "the brief is untracked, so the orchestrator must place it"],
    ["shallow clone", "the revision tests need full history"],
    ["transcript", "a transcript alone is insufficient"],
  ])("run-primed states the %s precondition", (needle) => {
    expect(runPrimed).toContain(needle);
  });

  test.each(consumedSections)("run-primed consumes `## %s` from the brief", (name) => {
    expect(sectionTableRow(runPrimed, "Brief")).toContain(`\`## ${name}\``);
  });

  test.each([...notConsumed])("`## %s` is stable but explicitly not consumed", (name) => {
    expect(sectionTableRow(runPrimed, "Brief, **unused**")).toContain(`\`## ${name}\``);
    expect(sectionTableRow(runPrimed, "Brief")).not.toContain(`\`## ${name}\``);
  });

  test("gather-context documents all three Scope values", () => {
    const scope = gatherContext.split("\n").find((line) => line.startsWith("- **Scope**"));
    for (const value of ["`task`", "`broad`", "`primed`"]) {
      expect(`Scope bullet: ${scope ?? "<absent>"}`).toContain(value);
    }
  });

  test("ordinary run is unchanged — it still gathers context and knows no brief", () => {
    expect(run).toContain("Skill(autopilot:gather-context)");
    expect(run).not.toContain("brief.md");
    expect(run).not.toContain("Scope: primed");
  });
});
