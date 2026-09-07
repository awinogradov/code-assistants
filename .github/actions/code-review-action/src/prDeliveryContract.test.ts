/**
 * Guards the autonomous-delivery completion contract in pr-monitor and its callers.
 *
 * The rule exists because the monitor's only success exit was approval with green
 * checks, so an autonomous `run` session kept polling every minute after it had done
 * everything an agent can do: human review is an asynchronous handoff, not unfinished
 * work. The monitor now ends with a distinct READY_FOR_REVIEW outcome once the current
 * head's obligations are complete, stops with CHANGES_REQUESTED when a reviewer's
 * verdict on that head stands after every thread was answered, and keeps the old wait
 * only behind `--wait-for-approval`.
 *
 * Division of responsibility with prConflictContract.test.ts: that file owns the
 * merge-conflict paths and the CONFLICTING-before-APPROVED ordering. This file asserts
 * the readiness path — that it exists, that it is proved per head rather than from the
 * aggregate `reviewDecision`, that both the initial inspection and the polling loop
 * reach it, and that the callers and prose summaries name the new outcome.
 *
 * What this CANNOT prove: that a run actually took two check readings or exited on the
 * right head. CI sees text in a file, nothing more — the limit every contract test here
 * states. What it can prove is that the prose still says the things a correct run
 * depends on, and that an edit which quietly restores the indefinite wait fails first.
 *
 * Vacuous-pass defences: every extracted region must be non-empty and above a minimum
 * length, so a renamed heading cannot extract "" and satisfy a `toContain` against it.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const monitorPath = join(skillsDir, "pr-monitor/SKILL.md");
const backgroundPath = join(skillsDir, "pr-monitor/references/background-mode.md");
const runPath = join(skillsDir, "run/SKILL.md");
const docsPath = join(repoRoot, "docs/05-plan-run-skills.md");
const readmePath = join(repoRoot, "claude-plugins/autopilot/README.md");

/** Shortest a real extraction can be; anything smaller means it went wrong. */
const minExtractionLength = 40;

/** The completion-policy flag, asserted as a literal wherever the policy is described. */
const waitFlag = "--wait-for-approval";

const [monitor, backgroundDoc, run, docs, readme] = await Promise.all([
  readFile(monitorPath, "utf8"),
  readFile(backgroundPath, "utf8"),
  readFile(runPath, "utf8"),
  readFile(docsPath, "utf8"),
  readFile(readmePath, "utf8"),
]);

/** Extract a `### `/`## ` section by heading, up to the next heading of the same or higher level. */
const section = (source: string, heading: string): string =>
  new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$[\\s\\S]*?(?=^#{1,3} )`, "m").exec(
    source,
  )?.[0] ?? "";

const readiness = section(monitor, "### Readiness Check (shared procedure)");
const earlyExit = section(monitor, "### 1.1 Early Exit Checks");
const reviewers = section(monitor, "### 1.2 Check for Reviewers");
const perCycle = section(monitor, "### 2.2 Check PR State");
const actOnFindings = section(monitor, "### 2.5 Act on Findings");
const exit = section(monitor, "## Phase 3: Exit");
const description = /^description: (.+)$/m.exec(monitor)?.[1] ?? "";
const argumentHint = /^argument-hint: (.+)$/m.exec(monitor)?.[1] ?? "";

describe("extractions are substantial", () => {
  test.each([
    ["Readiness Check", readiness],
    ["§1.1 Early Exit Checks", earlyExit],
    ["§1.2 Check for Reviewers", reviewers],
    ["§2.2 Check PR State", perCycle],
    ["§2.5 Act on Findings", actOnFindings],
    ["Phase 3 Exit", exit],
    ["frontmatter description", description],
  ])("%s extracts a real region", (_name, extracted) => {
    expect(extracted.length).toBeGreaterThan(minExtractionLength);
  });
});

describe("the completion policy is a flag, separate from execution mode", () => {
  test("the frontmatter names the handoff, the flag, and the trigger", () => {
    expect(description).toContain("ready for human review");
    expect(description).toContain("merge conflicts");
    expect(description).toContain("Use when");
    expect(argumentHint).toContain("--background");
    expect(argumentHint).toContain(waitFlag);
  });

  // The old prompt offered "wait or cancel" to a session that could have finished on
  // its own. It keeps its purpose only when the caller asked to wait for a human.
  test("the no-reviewers prompt applies only under the flag", () => {
    expect(reviewers).toContain(waitFlag);
  });

  test("the readiness check keeps polling under the flag instead of exiting", () => {
    expect(readiness).toContain(waitFlag);
  });

  test("the skill never merges", () => {
    expect(monitor).toContain("never merges");
  });
});

describe("readiness is proved per head", () => {
  // GitHub's aggregate reviewDecision carries approvals and change requests from
  // superseded commits, so it can neither prove nor block readiness for this head.
  test("evidence is bound to the head, never the aggregate decision", () => {
    expect(readiness).toContain("headRefOid");
    expect(readiness).toContain("commit_id");
    expect(readiness).toContain("never the aggregate `reviewDecision`");
  });

  test("feedback state comes from the review-thread helper", () => {
    expect(readiness).toContain("fetch-pr-reviews.ts");
    expect(readiness).toContain("authorReplied");
  });

  // One reading can pass while the review workflow's check run does not exist yet:
  // a fast workflow registers and finishes first. Two readings apart close that race.
  test("checks settle only across two readings", () => {
    expect(readiness).toContain("two consecutive readings");
    expect(readiness).toContain("no checks reported");
  });

  test("the check routes to both terminal exits", () => {
    expect(readiness).toMatch(/exit to \[Phase 3\]\(#phase-3-exit\) with status "ready-for-review"/);
    expect(readiness).toMatch(/exit to \[Phase 3\]\(#phase-3-exit\) with status "changes-requested"/);
  });
});

describe("both inspection points reach the readiness check", () => {
  test.each([
    ["§1.1", earlyExit],
    ["§2.5", actOnFindings],
  ])("%s runs the Readiness Check", (_name, branch) => {
    expect(branch).toContain("Readiness Check");
  });

  // The per-cycle CHANGES_REQUESTED branch used to re-invoke pr-resolve every minute
  // on a verdict nothing could change; the readiness check owns that path now.
  test("§2.2 no longer owns a CHANGES_REQUESTED branch", () => {
    expect(perCycle).not.toContain("`CHANGES_REQUESTED`");
  });

  test("Phase 3 has the ready and changes-requested exits", () => {
    expect(exit).toContain("Status: READY_FOR_REVIEW");
    expect(exit).toContain("Status: CHANGES_REQUESTED");
  });

  test("background mode returns the ready exit", () => {
    expect(backgroundDoc).toContain("READY_FOR_REVIEW");
  });
});

describe("the callers and prose summaries stay in step", () => {
  test("run's chain ends at the handoff and reports it distinctly", () => {
    expect(run).toContain("READY_FOR_REVIEW");
    expect(run).toContain("approval and merge are asynchronous follow-ups");
    expect(run).not.toContain("Status: <approved/merged>");
  });

  test("the docs Monitor bullet names the handoff and keeps the Conflict Sweep", () => {
    expect(docs).toContain("ready for human review");
    expect(docs).toContain("it runs the Conflict Sweep");
    expect(docs).not.toContain("Monitor until approved/merged");
  });

  test("the README pr-monitor entry names the handoff, the flag, and the conflict clause", () => {
    expect(readme).toContain("ready for human review");
    expect(readme).toContain(waitFlag);
    expect(readme).toContain("Detects a conflicting branch and rebases it onto its base");
  });
});
