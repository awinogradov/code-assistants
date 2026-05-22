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
});
