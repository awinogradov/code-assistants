/**
 * Tests for automerge.ts pure helpers.
 *
 * The API-driven flow (`run`, octokit calls, merge) is exercised end-to-end in
 * CI against real release PRs; only the deterministic gate helpers are unit-tested
 * here. Self-exclusion of the action's own check is covered by checkStatus.test.ts.
 */
import { describe, expect, test } from "bun:test";

import {
  isApprovedDecision,
  parseAutomerge,
  pickReleasePr,
  releaseMemberDir,
  resolveAutomergeOptIn,
  selectMergeMethod,
} from "./automerge.ts";

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
    expect(selectMergeMethod({ allowRebase: true, allowSquash: true, allowMerge: true })).toBe(
      "rebase",
    );
  });

  test("falls back to squash when rebase disabled", () => {
    expect(selectMergeMethod({ allowRebase: false, allowSquash: true, allowMerge: true })).toBe(
      "squash",
    );
  });

  test("falls back to merge when only merge allowed", () => {
    expect(selectMergeMethod({ allowRebase: false, allowSquash: false, allowMerge: true })).toBe(
      "merge",
    );
  });

  test("returns null when no method allowed", () => {
    expect(
      selectMergeMethod({ allowRebase: false, allowSquash: false, allowMerge: false }),
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

describe("parseAutomerge", () => {
  const source = "owner/repo:package.json@abc1234";

  test("undefined when raw content is null (missing file)", () => {
    expect(parseAutomerge(null, source)).toBeUndefined();
  });

  test("true when release.automerge is true", () => {
    expect(parseAutomerge(JSON.stringify({ release: { automerge: true } }), source)).toBe(true);
  });

  test("false when release.automerge is false", () => {
    expect(parseAutomerge(JSON.stringify({ release: { automerge: false } }), source)).toBe(false);
  });

  test("undefined when release.automerge is absent", () => {
    expect(
      parseAutomerge(JSON.stringify({ release: { type: "github-action" } }), source),
    ).toBeUndefined();
  });

  test("undefined when there is no release field", () => {
    expect(parseAutomerge(JSON.stringify({ name: "x" }), source)).toBeUndefined();
  });

  test("throws naming the source when JSON is malformed", () => {
    expect(() => parseAutomerge("{ not json", source)).toThrow(
      /Failed to read auto-merge opt-in from owner\/repo:package\.json@abc1234/,
    );
  });

  test("throws when release.automerge is not a boolean", () => {
    expect(() => parseAutomerge(JSON.stringify({ release: { automerge: "yes" } }), source)).toThrow(
      /'release\.automerge'.*must be a boolean/,
    );
  });
});

describe("resolveAutomergeOptIn", () => {
  test("member true enables regardless of root", () => {
    expect(resolveAutomergeOptIn(true, undefined)).toBe(true);
    expect(resolveAutomergeOptIn(true, false)).toBe(true);
  });

  test("member false overrides an enabled root", () => {
    expect(resolveAutomergeOptIn(false, true)).toBe(false);
  });

  test("unset member inherits the root default", () => {
    expect(resolveAutomergeOptIn(undefined, true)).toBe(true);
    expect(resolveAutomergeOptIn(undefined, false)).toBe(false);
  });

  test("disabled when both member and root are unset", () => {
    expect(resolveAutomergeOptIn(undefined, undefined)).toBe(false);
  });
});

describe("releaseMemberDir", () => {
  test("returns the member directory from its release-notes file", () => {
    expect(
      releaseMemberDir([
        "packages/actions-core/.release_notes/0.0.1.md",
        "packages/actions-core/package.json",
      ]),
    ).toBe("packages/actions-core/");
  });

  test("returns empty string for a standalone repo (notes at root)", () => {
    expect(releaseMemberDir([".release_notes/1.0.0.md", "CHANGELOG.md"])).toBe("");
  });

  test("null when no release-notes file is present", () => {
    expect(releaseMemberDir(["packages/actions-core/package.json"])).toBeNull();
  });

  test("null when multiple distinct members are referenced", () => {
    expect(
      releaseMemberDir([
        "packages/a/.release_notes/1.0.0.md",
        "packages/b/.release_notes/2.0.0.md",
      ]),
    ).toBeNull();
  });
});
