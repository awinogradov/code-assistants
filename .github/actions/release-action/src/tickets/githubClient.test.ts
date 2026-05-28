/**
 * Tests for GitHub client
 *
 * Tests the git-based commit retrieval using real git repos.
 * API calls are tested with mocked fetch in integration tests.
 */
import { $ } from "bun";
import { describe, expect, test } from "bun:test";

import { createCommit, withTempRepo } from "../testHelpers.ts";

import { getCommitsSinceLastTag } from "./githubClient.ts";

describe("githubClient", () => {
  describe("getCommitsSinceLastTag()", () => {
    test("returns all commits when no tags exist", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "feat: first commit");
        await createCommit(testRepo, "fix: second commit", "file2.txt");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits).toHaveLength(2);
        expect(commits[0]?.message).toBe("fix: second commit");
        expect(commits[1]?.message).toBe("feat: first commit");
      }));

    test("returns only commits after tag", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "chore: initial");
        await $`git tag v1.0.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: new feature", "file2.txt");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits).toHaveLength(1);
        expect(commits[0]?.message).toBe("feat: new feature");
      }));

    test("extracts PR number from squash merge format", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "feat: add auth (#45)");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits[0]?.prNumber).toBe(45);
      }));

    test("returns undefined prNumber for non-squash commits", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "feat: add auth");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits[0]?.prNumber).toBeUndefined();
      }));

    test("uses latest tag when multiple exist", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "chore: initial");
        await $`git tag v1.0.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: middle feature", "file2.txt");
        await $`git tag v1.1.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: latest feature", "file3.txt");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits).toHaveLength(1);
        expect(commits[0]?.message).toBe("feat: latest feature");
      }));

    test("includes commit SHA", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "feat: test commit");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits[0]?.sha).toMatch(/^[a-f0-9]{40}$/);
      }));

    test("uses topologically closest tag, not highest version number", () =>
      withTempRepo(async (testRepo) => {
        // Reproduce: v1.0.0 tagged on old commit, v0.16.1 tagged later.
        // Without the fix, version sort picks v1.0.0 as "latest" and
        // git log v1.0.0..HEAD includes commits already in v0.16.0/v0.16.1.
        await createCommit(testRepo, "chore: ancient");
        await $`git tag v1.0.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: in 0.16.0", "a.txt");
        await $`git tag v0.16.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: in 0.16.1", "b.txt");
        await $`git tag v0.16.1`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: new for 0.16.2", "c.txt");

        const commits = await getCommitsSinceLastTag(testRepo);

        expect(commits).toHaveLength(1);
        expect(commits[0]?.message).toBe("feat: new for 0.16.2");
      }));
  });

  describe("getCommitsSinceLastTag() scoping", () => {
    test("scopes the since-point to a member tag glob", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "chore: base");
        await $`git tag lib-a@v1.0.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: after member tag", "file2.txt");

        const scoped = await getCommitsSinceLastTag(testRepo, { tagPattern: "lib-a@v*" });
        expect(scoped).toHaveLength(1);
        expect(scoped[0]?.message).toBe("feat: after member tag");

        // No `v*` tag exists, so the default pattern finds none and walks all history.
        const unscoped = await getCommitsSinceLastTag(testRepo);
        expect(unscoped).toHaveLength(2);
      }));

    test("restricts the range to commits touching a path", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "feat: lib-a change", "packages/lib-a/x.txt");
        await createCommit(testRepo, "feat: lib-b change", "packages/lib-b/y.txt");

        const commits = await getCommitsSinceLastTag(testRepo, { path: "packages/lib-a" });

        expect(commits).toHaveLength(1);
        expect(commits[0]?.message).toBe("feat: lib-a change");
      }));

    test("combines member tag glob and path filter", () =>
      withTempRepo(async (testRepo) => {
        await createCommit(testRepo, "chore: base");
        await $`git tag lib-a@v1.0.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: lib-a after tag", "packages/lib-a/a.txt");
        await createCommit(testRepo, "feat: lib-b after tag", "packages/lib-b/b.txt");

        const commits = await getCommitsSinceLastTag(testRepo, {
          tagPattern: "lib-a@v*",
          path: "packages/lib-a",
        });

        expect(commits).toHaveLength(1);
        expect(commits[0]?.message).toBe("feat: lib-a after tag");
      }));

    test("a non-glob prefix matches no tag and falls back to full history", () =>
      withTempRepo(async (testRepo) => {
        // `git describe --match` treats the pattern as an fnmatch glob: the
        // prefix form `lib-a@v` (no `*`) matches no tag, so callers must pass the
        // glob `lib-a@v*` (memberTagPattern), not the prefix `lib-a@v`.
        await createCommit(testRepo, "chore: base");
        await $`git tag lib-a@v1.0.0`.cwd(testRepo).quiet();
        await createCommit(testRepo, "feat: after", "file2.txt");

        const prefix = await getCommitsSinceLastTag(testRepo, { tagPattern: "lib-a@v" });
        expect(prefix).toHaveLength(2);

        const glob = await getCommitsSinceLastTag(testRepo, { tagPattern: "lib-a@v*" });
        expect(glob).toHaveLength(1);
      }));
  });
});
