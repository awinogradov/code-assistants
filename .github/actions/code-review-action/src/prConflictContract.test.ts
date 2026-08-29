/**
 * Guards the merge-conflict contract in pr-monitor and pr-resolve.
 *
 * The rule exists because both skills polled a pull request without ever
 * requesting GitHub's `mergeable` field, so a CONFLICTING pull request was
 * indistinguishable from one merely awaiting review: the monitor printed
 * "Still waiting for review" every minute against an exit condition it could
 * never reach. A conflicted pull request cannot be approved with all checks
 * passing, so the loop had no terminal state at all.
 *
 * Division of responsibility with gitHistoryPolicy.test.ts: that file owns the
 * canonical forbidden-command regex and asserts that both these skills *load*
 * the history block. It keeps both jobs. This file asserts what the skills do
 * with the block once loaded — that the sweep names the explicit lease form,
 * that every conflict path terminates, and that the two callers stay in step.
 * The forbidden-command regex is imported from the block rather than restated,
 * so the two files cannot disagree about what a forbidden command is.
 *
 * What this CANNOT prove: that a skill actually ran the sweep, aborted a real
 * rebase, or honoured the cap. CI sees text in a file, nothing more — the same
 * limit sharedRulesInvocation.test.ts states for its own presence guard. What
 * it can prove is that the prose still says the things a correct run depends
 * on, and that a reorder which would silently break the fix fails here first.
 *
 * Vacuous-pass defences: every extracted region must be non-empty and above a
 * minimum length, so a renamed heading or a dropped fence cannot extract "" and
 * satisfy a `toContain` against it.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const monitorPath = join(skillsDir, "pr-monitor/SKILL.md");
const resolvePath = join(skillsDir, "pr-resolve/SKILL.md");
const historyBlockPath = join(skillsDir, "shared-rules/references/git-history-policy.md");
const docsPath = join(repoRoot, "docs/05-plan-run-skills.md");
const readmePath = join(repoRoot, "claude-plugins/autopilot/README.md");

/** Shortest a real extraction can be; anything smaller means it went wrong. */
const minExtractionLength = 40;

/** The run-scoped sweep cap. Asserted as a literal — "a digit appears" would survive any edit. */
const sweepCap = "capped at **2 per `pr-monitor` invocation**";

const [monitor, resolve, historyBlock] = await Promise.all([
  readFile(monitorPath, "utf8"),
  readFile(resolvePath, "utf8"),
  readFile(historyBlockPath, "utf8"),
]);

/** Extract a `### `/`## ` section by heading, up to the next heading of the same or higher level. */
const section = (source: string, heading: string): string =>
  new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$[\\s\\S]*?(?=^#{1,3} )`, "m").exec(
    source,
  )?.[0] ?? "";

const sweep = section(monitor, "### Conflict Sweep (shared procedure)");
const earlyExit = section(monitor, "### 1.1 Early Exit Checks");
const perCycle = section(monitor, "### 2.2 Check PR State");
const backgroundMode = section(monitor, "### Background Mode");
const detectPr = section(resolve, "### 1.1 Detect PR");

/** The block's own forbidden-command pattern, so this file cannot disagree with it. */
const forbiddenCommand = /#### Canonical forbidden-command regex[\s\S]*?```text\n(.+)\n```/.exec(
  historyBlock,
)?.[1];

describe("extractions are substantial", () => {
  test.each([
    ["Conflict Sweep", sweep],
    ["§1.1 Early Exit Checks", earlyExit],
    ["§2.2 Check PR State", perCycle],
    ["Background Mode", backgroundMode],
    ["pr-resolve §1.1 Detect PR", detectPr],
    ["forbidden-command regex", forbiddenCommand ?? ""],
  ])("%s extracts a real region", (_name, extracted) => {
    expect(extracted.length).toBeGreaterThan(minExtractionLength);
  });
});

describe("both skills ask GitHub for mergeability", () => {
  // Detection is the whole fix: without the field, every branch below is dead
  // code. The pre-loop read also needs headRepositoryOwner, which is how the
  // sweep recognises a fork it cannot push to.
  //
  // Only the two fenced state reads count. The Input-resolution section names a
  // third `gh pr view` in prose that fetches the PR number alone, and widening
  // that one to carry mergeability would say the skill re-reads state where it
  // does not.
  test("pr-monitor requests mergeable on both state reads", () => {
    const reads = monitor.match(/```bash\ngh pr view[^\n]*--json[^\n]*/g) ?? [];
    expect(reads.length).toBe(2);
    for (const read of reads) expect(read).toContain("mergeable");
  });

  test("pr-monitor's pre-loop read requests headRepositoryOwner", () => {
    expect(section(monitor, "## Phase 1: Detect PR")).toContain("headRepositoryOwner");
  });

  test("pr-resolve requests mergeable", () => {
    expect(detectPr).toMatch(/gh pr view[^\n]*--json[^\n]*mergeable/);
  });
});

describe("the sweep rewrites history only the sanctioned way", () => {
  // A bare --force-with-lease anchors to whatever the local tracking ref holds,
  // so an unrelated fetch degrades it to the unleased --force the policy bans.
  // The explicit ref:sha form is the whole point; asserting only the flag name
  // would pass on the degraded version.
  test("pins the lease to the recorded pre-rebase SHA", () => {
    expect(sweep).toContain("git push --force-with-lease=<headRefName>:<preRebaseSha>");
    expect(sweep).toContain("preRebaseSha");
  });

  test("takes base changes by rebase, never by merge", () => {
    expect(sweep).toContain("git rebase origin/<baseRefName>");
    expect(new RegExp(forbiddenCommand!, "m").test(sweep)).toBe(false);
  });

  test("reads the history policy before running anything", () => {
    expect(sweep).toContain("shared-rules/references/git-history-policy.md");
  });

  test("aborts a halted rebase instead of leaving the tree mid-rebase", () => {
    expect(sweep).toContain("git rebase --abort");
    expect(sweep).toContain("git diff --name-only --diff-filter=U");
  });

  // Resolution is a judgement call about intent. Unattended, it force-pushes a
  // guess; the abort-then-ask ordering is what keeps a human in front of it.
  test("offers resolution only in foreground, only after the abort", () => {
    expect(sweep).toContain("Only in foreground mode");
    expect(sweep.indexOf("git rebase --abort")).toBeLessThan(sweep.indexOf("AskUserQuestion"));
  });

  test("refuses on a branch the agent does not own", () => {
    expect(sweep).toContain("gh api user --jq .login");
    expect(sweep).toContain("headRepositoryOwner");
  });
});

describe("every conflict path terminates", () => {
  // The original defect was an unreachable exit condition. A cap that is not
  // run-scoped is refunded by every new commit to the base, which reintroduces
  // the same unbounded loop one layer up.
  test("the sweep cap is run-scoped and stated as a literal", () => {
    expect(monitor).toContain(sweepCap);
    expect(monitor).toContain("not** keyed to the base SHA");
  });

  test("Phase 3 has a conflicted exit", () => {
    expect(section(monitor, "## Phase 3: Exit")).toContain("Status: CONFLICTED");
  });

  test.each([
    ["§1.1", earlyExit],
    ["§2.2", perCycle],
  ])("%s routes a failed sweep to the Phase 3 exit", (_name, branch) => {
    expect(branch).toContain("Conflict Sweep");
    expect(branch).toMatch(/exit to \[Phase 3\]\(#phase-3-exit\) with status "conflicted"/);
  });

  // §2.2's APPROVED branch exits "already approved with all checks passing"
  // without consulting mergeability, so a conflicted-but-approved PR would exit
  // clean if the conflict branch were ever moved below it.
  test.each([
    ["§1.1", earlyExit],
    ["§2.2", perCycle],
  ])("%s checks CONFLICTING before reviewDecision", (_name, branch) => {
    expect(branch.indexOf("CONFLICTING")).toBeLessThan(branch.indexOf("`APPROVED`"));
  });

  test("background mode reports the conflict instead of acting", () => {
    expect(backgroundMode).toContain("Status: CONFLICTING");
    expect(backgroundMode).toContain("Do NOT rebase, resolve, or push");
  });
});

describe("UNKNOWN is pending, not a conflict", () => {
  // GitHub computes mergeability asynchronously, so UNKNOWN is the normal
  // reading right after a push. Treating it as a conflict would sweep on noise.
  test("pr-monitor leaves UNKNOWN to the next poll", () => {
    expect(sweep).toContain("`UNKNOWN` is a pending state");
  });

  // pr-resolve reads once, with no loop to re-read for it, so without an
  // explicit re-read the guard passes vacuously on exactly the cold PRs it is
  // meant to stop.
  test("pr-resolve re-reads before trusting UNKNOWN", () => {
    expect(detectPr).toContain("Re-read it once");
  });
});

describe("pr-resolve refuses a conflicting branch", () => {
  test("aborts and names the sweep as the fix", () => {
    expect(detectPr).toContain("cannot merge. Resolve the conflict first");
    expect(detectPr).toContain("../pr-monitor/SKILL.md#conflict-sweep-shared-procedure");
  });

  // Phase 1's later subsections are anchor targets across the document; the
  // check was folded into §1.1 precisely so none of them shifted.
  test.each(["### 1.2 Check Working Tree", "### 1.3 Load PR Diff", "### 1.5 Project Rules"])(
    "%s keeps its number",
    (heading) => {
      expect(resolve).toContain(heading);
    },
  );
});

describe("the three prose summaries stay in step", () => {
  // The frontmatter description, the plugin README entry, and the docs Monitor
  // bullet all restate the same contract. Nothing but this test stops one of
  // them from drifting on the next edit.
  test("pr-monitor's frontmatter description names conflicts", () => {
    const description = /^description: (.+)$/m.exec(monitor)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(minExtractionLength);
    expect(description).toContain("merge conflicts");
  });

  test("the docs Monitor bullet names the Conflict Sweep", async () => {
    expect(await readFile(docsPath, "utf8")).toContain("it runs the Conflict Sweep");
  });

  test.each([
    ["pr-monitor", "Detects a conflicting branch and rebases it onto its base"],
    ["pr-resolve", "Aborts when the pull request conflicts with its base"],
  ])("the README %s entry names the new behaviour", async (_name, clause) => {
    expect(await readFile(readmePath, "utf8")).toContain(clause);
  });
});
