/**
 * Tests for automerge.ts pure helpers.
 *
 * The API-driven flow (`run`, octokit calls, merge) is exercised end-to-end in
 * CI against real release PRs; only the deterministic gate helpers are unit-tested
 * here. Self-exclusion of the action's own check is covered by checkStatus.test.ts.
 */
import { describe, expect, test } from "bun:test";

import { isApprovedDecision, pickReleasePr, selectMergeMethod } from "./automerge.ts";

describe("pickReleasePr", () => {
  test("picks the open release PR", () => {
    const prs = [
      { number: 1, state: "closed", head: { ref: "release-1.0.0" } },
      { number: 2, state: "open", head: { ref: "release-1.1.0" } },
    ];
    expect(pickReleasePr(prs)?.number).toBe(2);
  });

  test("ignores non-release branches", () => {
    const prs = [{ number: 3, state: "open", head: { ref: "feature-x" } }];
    expect(pickReleasePr(prs)).toBeNull();
  });

  test("ignores closed release PRs", () => {
    const prs = [{ number: 4, state: "closed", head: { ref: "release-2.0.0" } }];
    expect(pickReleasePr(prs)).toBeNull();
  });

  test("returns null for no associated PRs", () => {
    expect(pickReleasePr([])).toBeNull();
  });
});

describe("selectMergeMethod", () => {
  test("prefers rebase when allowed", () => {
    expect(
      selectMergeMethod({ allowRebase: true, allowSquash: true, allowMerge: true })
    ).toBe("rebase");
  });

  test("falls back to squash when rebase disabled", () => {
    expect(
      selectMergeMethod({ allowRebase: false, allowSquash: true, allowMerge: true })
    ).toBe("squash");
  });

  test("falls back to merge when only merge allowed", () => {
    expect(
      selectMergeMethod({ allowRebase: false, allowSquash: false, allowMerge: true })
    ).toBe("merge");
  });

  test("returns null when no method allowed", () => {
    expect(
      selectMergeMethod({ allowRebase: false, allowSquash: false, allowMerge: false })
    ).toBeNull();
  });
});

describe("isApprovedDecision", () => {
  test("true only for APPROVED", () => {
    expect(isApprovedDecision("APPROVED")).toBe(true);
  });

  test("false for other decisions and null", () => {
    expect(isApprovedDecision("CHANGES_REQUESTED")).toBe(false);
    expect(isApprovedDecision("REVIEW_REQUIRED")).toBe(false);
    expect(isApprovedDecision(null)).toBe(false);
  });
});
