/**
 * Tests for path-scoped member commit listing.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { $ } from "bun";

import { withTempRepo } from "../testHelpers.ts";
import { listMemberCommits, memberHasChanges } from "./memberDiff.ts";

async function commitInPath(
  repo: string,
  relPath: string,
  fileName: string,
  message: string,
): Promise<void> {
  await mkdir(join(repo, relPath), { recursive: true });
  await Bun.write(join(repo, relPath, fileName), `${Date.now()}\n`);
  await $`git add ${join(relPath, fileName)}`.cwd(repo).quiet();
  await $`git commit -m ${message}`.cwd(repo).quiet();
}

describe("listMemberCommits", () => {
  test("returns only commits that touched the member path since the given tag", () =>
    withTempRepo(async (repo) => {
      await commitInPath(repo, "packages/lib-a", "f1.txt", "feat(lib-a): seed");
      await $`git tag lib-a@v0.1.0`.cwd(repo).quiet();
      await commitInPath(repo, "packages/lib-a", "f2.txt", "feat(lib-a): add foo");
      await commitInPath(repo, "packages/lib-b", "f3.txt", "feat(lib-b): unrelated");

      const commits = await listMemberCommits({
        cwd: repo,
        path: "packages/lib-a",
        since: "lib-a@v0.1.0",
      });
      expect(commits).toEqual(["feat(lib-a): add foo"]);
    }));

  test("returns all matching commits when no lower bound is set", () =>
    withTempRepo(async (repo) => {
      await commitInPath(repo, "packages/lib-a", "f1.txt", "feat(lib-a): one");
      await commitInPath(repo, "packages/lib-a", "f2.txt", "feat(lib-a): two");

      const commits = await listMemberCommits({
        cwd: repo,
        path: "packages/lib-a",
        since: null,
      });
      expect(commits).toEqual(["feat(lib-a): two", "feat(lib-a): one"]);
    }));
});

describe("listMemberCommits failure", () => {
  test("throws when git log exits non-zero (e.g. invalid range)", () =>
    withTempRepo(async (repo) => {
      await commitInPath(repo, "packages/lib", "f.txt", "feat(lib): seed");
      await expect(
        listMemberCommits({
          cwd: repo,
          path: "packages/lib",
          since: "does-not-exist@v999.0.0",
        }),
      ).rejects.toThrow(/git log failed/);
    }));
});

describe("memberHasChanges", () => {
  test("is true when at least one commit touched the path", () =>
    withTempRepo(async (repo) => {
      await commitInPath(repo, "packages/lib-a", "f1.txt", "feat(lib-a): seed");
      expect(
        await memberHasChanges({ cwd: repo, path: "packages/lib-a", since: null }),
      ).toBe(true);
    }));

  test("is false when no commits touched the path in the range", () =>
    withTempRepo(async (repo) => {
      await commitInPath(repo, "packages/lib-a", "f1.txt", "feat(lib-a): seed");
      await $`git tag lib-a@v0.1.0`.cwd(repo).quiet();
      await commitInPath(repo, "packages/lib-b", "f2.txt", "feat(lib-b): elsewhere");

      expect(
        await memberHasChanges({
          cwd: repo,
          path: "packages/lib-a",
          since: "lib-a@v0.1.0",
        }),
      ).toBe(false);
    }));
});
