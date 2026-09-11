/**
 * Guards the autonomous-delivery completion contract in pr-monitor and its callers.
 *
 * Two rules meet here. The first: the monitor's only success exit was once approval with
 * green checks, so an autonomous `run` session kept waiting after it had done everything
 * an agent can do — human review is an asynchronous handoff, not unfinished work. The
 * monitor ends with a distinct READY_FOR_REVIEW outcome, stops with CHANGES_REQUESTED
 * when a reviewer's verdict on the head stands after every thread was answered, and keeps
 * the old wait only behind `--wait-for-approval`.
 *
 * The second: the waiting itself no longer runs in the model. The skill launches the
 * packaged watcher, which sleeps in its own process and returns one bounded event, so a
 * wakeup that decides nothing costs nothing. That is only true while the skill neither
 * sleeps nor polls nor delegates the wait to an agent that does, and while every
 * non-terminal event is acknowledged — an unacknowledged relaunch re-delivers the same
 * evidence and spins. Both are asserted below.
 *
 * Division of responsibility with prConflictContract.test.ts: that file owns the
 * merge-conflict paths and the conflict-before-approval ordering. This file asserts the
 * readiness path — that it exists, that it is proved per head rather than from the
 * aggregate `reviewDecision`, that the event handler reaches every outcome, and that the
 * callers and prose summaries name it.
 *
 * What this CANNOT prove: that a run actually launched the watcher, or that the token
 * bill fell. CI sees text in a file, nothing more — the limit every contract test here
 * states. What it can prove is that the prose still says the things a correct run depends
 * on, and that an edit which quietly restores the in-model polling loop fails first.
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

const launch = section(monitor, "## Phase 2: Launch the Watcher");
const eventContract = section(monitor, "### The Event Contract");
const handleEvent = section(monitor, "## Phase 3: Handle the Event");
const exit = section(monitor, "## Phase 4: Exit");
const description = /^description: (.+)$/m.exec(monitor)?.[1] ?? "";
const argumentHint = /^argument-hint: (.+)$/m.exec(monitor)?.[1] ?? "";

describe("extractions are substantial", () => {
  test.each([
    ["Phase 2 Launch the Watcher", launch],
    ["The Event Contract", eventContract],
    ["Phase 3 Handle the Event", handleEvent],
    ["Phase 4 Exit", exit],
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

  // The flag is a completion policy, not an execution mode: the skill hands it to
  // the watcher, which keeps waiting past readiness instead of returning.
  test("the flag reaches the watcher rather than branching in the model", () => {
    expect(launch).toContain(waitFlag);
    expect(eventContract).toContain(waitFlag);
  });

  test("the skill never merges", () => {
    expect(monitor).toContain("never merges");
  });
});

describe("the model waits by launching, never by polling", () => {
  // The defect this replaced was a `sleep 60` loop in the skill body: every tick
  // re-read the whole conversation to learn that CI was still running.
  test("the skill body runs no sleep and declares no sleep tool", () => {
    expect(monitor).not.toMatch(/```bash\nsleep /);
    expect(monitor).not.toContain("Bash(sleep *)");
  });

  test("the watcher is launched in the background and awaited by notification", () => {
    expect(launch).toContain("lib/github/watch-pr.ts");
    expect(launch).toContain("run_in_background: true");
    expect(launch).toContain("completion notification");
  });

  // A fallback to timer-based waiting would restore the cost silently, so the
  // unsupported case has to fail loudly instead.
  test("a runtime without completion delivery fails loudly rather than polling", () => {
    expect(launch).toContain("fail loudly");
    expect(launch).toMatch(/never|Never/);
  });

  // Without the ack, the watcher re-delivers the same pending event immediately
  // and the caller spins on evidence it already handled.
  test("every non-terminal event is acknowledged on relaunch", () => {
    expect(eventContract).toContain("--ack <event-id>");
    expect(handleEvent.match(/--ack <event-id>/g) ?? []).toHaveLength(4);
    expect(handleEvent).toContain("Relaunching without `--ack` is a bug");
  });
});

describe("readiness is proved per head, by the watcher", () => {
  // GitHub's aggregate reviewDecision carries approvals and change requests from
  // superseded commits, so it can neither prove nor block readiness for this head.
  // The watcher re-reads the head after collecting, which is what makes a stale
  // green impossible rather than merely unlikely.
  test("evidence is bound to a verified head", () => {
    expect(eventContract).toContain("headSha");
    expect(eventContract).toContain("headVerified");
    expect(eventContract).toContain("stale green");
  });

  test("the event contract names every outcome the callers branch on", () => {
    for (const event of [
      "merged",
      "closed",
      "conflict",
      "checks_failed",
      "review_action_required",
      "blocked",
      "approved",
      "ready_for_review",
    ]) {
      expect(eventContract).toContain(`\`${event}\``);
    }
  });

  test("the handler routes to both non-ready terminal exits", () => {
    expect(handleEvent).toMatch(/exit to \[Phase 4\]\(#phase-4-exit\) with status "changes-requested"/);
    expect(handleEvent).toMatch(/exit to \[Phase 4\]\(#phase-4-exit\) with status "conflicted"/);
  });

  test("Phase 4 has the ready, changes-requested and blocked exits", () => {
    expect(exit).toContain("Status: READY_FOR_REVIEW");
    expect(exit).toContain("Status: CHANGES_REQUESTED");
    expect(exit).toContain("Status: BLOCKED");
  });

  test("background mode returns the ready exit and reports blockers", () => {
    expect(backgroundDoc).toContain("READY_FOR_REVIEW");
    expect(backgroundDoc).toContain("Status: BLOCKED");
  });
});

describe("the callers and prose summaries stay in step", () => {
  test("run's chain ends at the handoff and reports it distinctly", () => {
    expect(run).toContain("READY_FOR_REVIEW");
    expect(run).toContain("approval and merge are asynchronous follow-ups");
    expect(run).not.toContain("Status: <approved/merged>");
    expect(run).toContain("packaged watcher");
  });

  test("the docs Monitor bullet names the handoff, the watcher and the Conflict Sweep", () => {
    expect(docs).toContain("ready for human review");
    expect(docs).toContain("it runs the Conflict Sweep");
    expect(docs).toContain("packaged watcher");
    expect(docs).not.toContain("Monitor until approved/merged");
  });

  test("the README pr-monitor entry names the handoff, the flag, and the conflict clause", () => {
    expect(readme).toContain("ready for human review");
    expect(readme).toContain(waitFlag);
    expect(readme).toContain("Detects a conflicting branch and rebases it onto its base");
  });
});
