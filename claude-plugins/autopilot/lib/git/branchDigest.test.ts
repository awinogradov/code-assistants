import { describe, expect, test } from "bun:test";

import {
  buildBranchDigest,
  deriveIsStaleMerged,
  maxCommits,
  maxFiles,
  parseCherryUpstream,
  parseNumstat,
  parseOnelineLog,
} from "./branchDigest.ts";
import type { GitReadResults } from "./branchDigest.ts";

const healthyReads: GitReadResults = {
  branch: "issue-42-jwt-refresh\n",
  gitDir: "/repo/.git\n",
  gitCommonDir: "/repo/.git\n",
  log: "",
  numstat: "",
  cherry: "",
  baseAhead: "0\n",
};

describe("parseOnelineLog", () => {
  test("splits sha and subject on the first space", () => {
    const parsed = parseOnelineLog("b8bb4b2 revert(code-review): restore pull_request trigger\n");
    expect(parsed).toEqual([
      { sha: "b8bb4b2", subject: "revert(code-review): restore pull_request trigger" },
    ]);
  });

  test("returns no commits for empty output", () => {
    expect(parseOnelineLog("")).toEqual([]);
  });
});

describe("parseCherryUpstream / deriveIsStaleMerged", () => {
  test("collects only minus-marked SHAs", () => {
    const cherry = "- aaaa111122223333\n+ bbbb444455556666\n";
    expect(parseCherryUpstream(cherry)).toEqual(["aaaa111122223333"]);
  });

  test("all minus lines mean stale-merged", () => {
    expect(deriveIsStaleMerged("- aaaa\n- bbbb\n")).toBe(true);
  });

  test("any plus line means genuine unmerged work", () => {
    expect(deriveIsStaleMerged("- aaaa\n+ bbbb\n")).toBe(false);
  });

  test("empty output means level with base, not stale", () => {
    expect(deriveIsStaleMerged("")).toBe(false);
  });
});

describe("parseNumstat", () => {
  test("parses counts and keeps binary files with null counts", () => {
    const parsed = parseNumstat("12\t3\tsrc/a.ts\n-\t-\tassets/logo.png\n");
    expect(parsed).toEqual([
      { path: "src/a.ts", additions: 12, deletions: 3 },
      { path: "assets/logo.png", additions: null, deletions: null },
    ]);
  });
});

describe("buildBranchDigest", () => {
  test("level branch: no commits, not stale, base current", () => {
    const digest = buildBranchDigest(healthyReads);
    expect(digest.branch).toBe("issue-42-jwt-refresh");
    expect(digest.commits).toEqual([]);
    expect(digest.isStaleMerged).toBe(false);
    expect(digest.baseAhead).toBe(0);
    expect(digest.isWorktree).toBe(false);
    expect(digest.truncated).toBe(false);
  });

  test("unmerged work: upstream flags come from cherry prefix matches", () => {
    const digest = buildBranchDigest({
      ...healthyReads,
      log: "aaaa111 landed upstream\nbbbb222 still local\n",
      cherry: "- aaaa111122223333\n+ bbbb222233334444\n",
    });
    expect(digest.commits).toEqual([
      { sha: "aaaa111", subject: "landed upstream", upstream: true },
      { sha: "bbbb222", subject: "still local", upstream: false },
    ]);
    expect(digest.isStaleMerged).toBe(false);
  });

  test("stale-merged branch: all cherry lines are minus", () => {
    const digest = buildBranchDigest({
      ...healthyReads,
      log: "aaaa111 landed upstream\n",
      cherry: "- aaaa111122223333\n",
      baseAhead: "3\n",
    });
    expect(digest.isStaleMerged).toBe(true);
    expect(digest.baseAhead).toBe(3);
  });

  test("detached HEAD: empty branch name survives", () => {
    const digest = buildBranchDigest({ ...healthyReads, branch: "\n" });
    expect(digest.branch).toBe("");
  });

  test("worktree: differing git dirs set isWorktree", () => {
    const digest = buildBranchDigest({
      ...healthyReads,
      gitDir: "/repo/.git/worktrees/wt\n",
      gitCommonDir: "/repo/.git\n",
    });
    expect(digest.isWorktree).toBe(true);
  });

  test("caps commit and file lists and flags truncation", () => {
    const log = Array.from({ length: maxCommits + 1 }, (_, i) => `sha${i} subject ${i}`).join("\n");
    const numstat = Array.from({ length: maxFiles + 1 }, (_, i) => `1\t1\tsrc/f${i}.ts`).join("\n");
    const digest = buildBranchDigest({ ...healthyReads, log, numstat });
    expect(digest.commits).toHaveLength(maxCommits);
    expect(digest.files).toHaveLength(maxFiles);
    expect(digest.truncated).toBe(true);
  });

  test("degraded cherry and rev-list reads yield null tri-states, never confident negatives", () => {
    const digest = buildBranchDigest({
      ...healthyReads,
      log: "aaaa111 local work\n",
      cherry: null,
      baseAhead: null,
    });
    expect(digest.isStaleMerged).toBeNull();
    expect(digest.baseAhead).toBeNull();
    expect(digest.commits).toEqual([{ sha: "aaaa111", subject: "local work", upstream: false }]);
  });
});
