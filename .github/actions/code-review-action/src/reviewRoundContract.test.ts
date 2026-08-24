/**
 * Guards the review-round contract (issue #622) across its three holders: the
 * substantive-anchor predicate (`buildReviewContext.ts`), the pr-review skill
 * prose that owns round policy (SKILL.md §1.3 plus the §1.0 routing bullet and
 * the Graphify boundary), and the publication binding (`submitReview.ts`
 * `commit_id`). The predicate is pinned twice on purpose — behaviorally via
 * `isSubstantiveReview` and textually via the §1.3 prose — because the two
 * encodings live in different files and either drifting alone silently splits
 * anchor selection between the builder and the skill, which is the exact
 * failure the issue exists to remove.
 *
 * Mirrors reviewContextBundleContract.test.ts: guarded documents are asserted
 * non-empty first (vacuous-pass defence), and each taxonomy entry is explicit
 * test data so dropping one fails loudly. Like that file, the text assertions
 * prove prose, not runtime behavior; the behavioral half runs the real
 * predicate.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { isSubstantiveReview } from "./buildReviewContext.ts";

// Depth mirrors sharedBlockSync.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillPath = join(repoRoot, "claude-plugins/autopilot/skills/pr-review/SKILL.md");
const submitPath = join(actionDir, "src", "submitReview.ts");

/** Shortest either guarded document can plausibly be. */
const minDocLength = 1000;

/**
 * The substantive-anchor taxonomy: [state, body, substantive]. §1.3 prose and
 * the builder predicate must agree on every row.
 */
const anchorTaxonomy: Array<[string, string | null, boolean]> = [
  ["APPROVED", "", true],
  ["APPROVED", null, true],
  ["CHANGES_REQUESTED", "", true],
  ["COMMENTED", "Found a real issue in src/a.ts", true],
  ["COMMENTED", "", false],
  ["COMMENTED", "  \n  ", false],
  ["COMMENTED", null, false],
  ["DISMISSED", "old blocker text", false],
];

/** The four state-machine arms §1.3 must name, one guarded phrase each. */
const stateMachineArms = [
  "No substantive prior review",
  "Review skipped: no commits since the reviewed head",
  "compare status `ahead`",
  "rewritten history is untrusted",
];

/** Delta reasons the §1.0 routing bullet must route explicitly. */
const deltaReasons = [
  "compare-status-identical",
  "compare-status-diverged",
  "compare-status-behind",
  "ref-missing",
];

const skill = await readFile(skillPath, "utf8");
const submitSource = await readFile(submitPath, "utf8");

describe("substantive-anchor predicate", () => {
  test("both guarded documents exist and are substantial", () => {
    expect(skill.length).toBeGreaterThan(minDocLength);
    expect(submitSource.length).toBeGreaterThan(minDocLength);
  });

  test.each(anchorTaxonomy)(
    "state %s with body %p is substantive: %p",
    (state, body, substantive) => {
      expect(isSubstantiveReview({ state, body })).toBe(substantive);
    },
  );

  test("the skill prose defines the same predicate it delegates to the builder", () => {
    expect(skill).toContain("**The substantive anchor.**");
    expect(skill).toContain("never a SHA parsed from review prose");
    expect(skill).toContain("never advance the anchor");
    expect(skill).toContain("`DISMISSED`");
    expect(skill).toContain("isSubstantiveReview");
  });
});

describe("round state machine", () => {
  test.each(stateMachineArms)("§1.3 names the arm: %s", (arm) => {
    expect(skill).toContain(arm);
  });

  test.each(deltaReasons)("the §1.0 routing bullet routes %s", (reason) => {
    expect(skill).toContain(reason);
  });

  test("force-push is never inferred from object existence", () => {
    expect(skill).toContain("Never infer a force-push");
  });

  test("the incremental surface is trace-recorded with a degrade arm", () => {
    expect(skill).toContain("round-surface:");
    expect(skill).toContain("round-surface-fallback:");
    expect(skill).toContain("never review a silently truncated patch");
  });
});

describe("graphify boundary", () => {
  test("Graphify is context-only, never review-surface discovery", () => {
    expect(skill).toContain("**Graphify is context, never surface.**");
    expect(skill).toContain("never expand an incremental round");
  });
});

describe("publication binding", () => {
  test("submitReview binds the review to the expected head SHA", () => {
    expect(submitSource).toContain("commit_id: expectedHeadSha");
  });

  test("an empty PR_HEAD_SHA warns instead of silently submitting unbound", () => {
    expect(submitSource).toContain(
      "PR_HEAD_SHA is empty; submitting review without commit_id binding",
    );
  });
});
