/**
 * Tests for git tag listing utility
 */
import { $ } from "bun";
import { describe, expect, test } from "bun:test";

import { getLatestReachableTag, listTags } from "./gitTags.ts";
import { createCommit, withTempRepo } from "./testHelpers.ts";

describe("listTags", () => {
  test("returns empty array when no tags exist", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");

      const tags = await listTags("v*", repo);

      expect(tags).toEqual([]);
    }));

  test("returns single tag", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");
      await $`git tag v1.0.0`.cwd(repo).quiet();

      const tags = await listTags("v*", repo);

      expect(tags).toEqual(["v1.0.0"]);
    }));

  test("returns tags sorted newest first", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "first");
      await $`git tag v1.0.0`.cwd(repo).quiet();
      await createCommit(repo, "second", "file2.txt");
      await $`git tag v2.0.0`.cwd(repo).quiet();
      await createCommit(repo, "third", "file3.txt");
      await $`git tag v1.1.0`.cwd(repo).quiet();

      const tags = await listTags("v*", repo);

      expect(tags).toEqual(["v2.0.0", "v1.1.0", "v1.0.0"]);
    }));

  test("filters by pattern", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");
      await $`git tag v1.0.0`.cwd(repo).quiet();
      await $`git tag rc-1.0.0`.cwd(repo).quiet();

      const vTags = await listTags("v*", repo);
      const rcTags = await listTags("rc-*", repo);

      expect(vTags).toEqual(["v1.0.0"]);
      expect(rcTags).toEqual(["rc-1.0.0"]);
    }));
});

describe("getLatestReachableTag", () => {
  test("returns null when no tags exist", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");

      const tag = await getLatestReachableTag("v*", repo);

      expect(tag).toBeNull();
    }));

  test("returns the only tag", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");
      await $`git tag v1.0.0`.cwd(repo).quiet();

      const tag = await getLatestReachableTag("v*", repo);

      expect(tag).toBe("v1.0.0");
    }));

  test("returns topologically closest tag, not highest version", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "first");
      await $`git tag v1.0.0`.cwd(repo).quiet();
      await createCommit(repo, "second", "file2.txt");
      await $`git tag v0.16.0`.cwd(repo).quiet();
      await createCommit(repo, "third", "file3.txt");
      await $`git tag v0.16.1`.cwd(repo).quiet();
      await createCommit(repo, "fourth", "file4.txt");

      const tag = await getLatestReachableTag("v*", repo);

      // v0.16.1 is closer to HEAD than v1.0.0, even though v1.0.0 is a higher version
      expect(tag).toBe("v0.16.1");
    }));

  test("respects pattern filter", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");
      await $`git tag v1.0.0`.cwd(repo).quiet();
      await $`git tag rc-1.0.0`.cwd(repo).quiet();

      expect(await getLatestReachableTag("v*", repo)).toBe("v1.0.0");
      expect(await getLatestReachableTag("rc-*", repo)).toBe("rc-1.0.0");
    }));

  test("respects custom ref", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "first");
      await $`git tag v1.0.0`.cwd(repo).quiet();
      await createCommit(repo, "second", "file2.txt");
      await $`git tag v1.1.0`.cwd(repo).quiet();
      await createCommit(repo, "third", "file3.txt");

      const tag = await getLatestReachableTag("v*", repo, "v1.1.0");

      expect(tag).toBe("v1.1.0");
    }));

  test("returns null for non-existent ref", () =>
    withTempRepo(async (repo) => {
      await createCommit(repo, "init");
      await $`git tag v1.0.0`.cwd(repo).quiet();

      const tag = await getLatestReachableTag("v*", repo, "nonexistent-ref");

      expect(tag).toBeNull();
    }));
});

