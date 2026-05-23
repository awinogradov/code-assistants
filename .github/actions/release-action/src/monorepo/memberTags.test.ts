/**
 * Tests for per-member git tag helpers.
 */
import { describe, expect, test } from "bun:test";

import { $ } from "bun";

import { withTempRepo } from "../testHelpers.ts";
import {
  getLatestMemberTagReachable,
  getLatestMemberVersion,
  memberMajorTag,
  memberTagPattern,
  memberTagPrefix,
  memberVersionTag,
  parseMemberTag,
} from "./memberTags.ts";

describe("tag builders", () => {
  test("memberTagPrefix returns the <name>@v form", () => {
    expect(memberTagPrefix("release-action")).toBe("release-action@v");
  });

  test("memberTagPattern returns the glob used by git tag -l", () => {
    expect(memberTagPattern("release-action")).toBe("release-action@v*");
  });

  test("memberVersionTag composes the full tag", () => {
    expect(memberVersionTag("release-action", "1.2.0")).toBe("release-action@v1.2.0");
  });

  test("memberMajorTag uses the parsed major number", () => {
    expect(memberMajorTag("release-action", "1.2.0")).toBe("release-action@v1");
  });

  test("memberMajorTag throws for invalid versions", () => {
    expect(() => memberMajorTag("release-action", "not-a-version")).toThrow(
      /Invalid semver/,
    );
  });
});

describe("parseMemberTag", () => {
  test("extracts a valid version", () => {
    expect(parseMemberTag("release-action", "release-action@v1.2.0")).toBe("1.2.0");
  });

  test("returns null when the prefix does not match", () => {
    expect(parseMemberTag("release-action", "autopilot@v1.0.0")).toBeNull();
  });

  test("returns null when the version segment is not valid semver", () => {
    expect(parseMemberTag("release-action", "release-action@vNOT")).toBeNull();
  });
});

async function tagAtHead(cwd: string, tag: string): Promise<void> {
  await $`git tag ${tag}`.cwd(cwd).quiet();
}

async function emptyCommit(cwd: string, message: string): Promise<void> {
  await $`git commit --allow-empty -m ${message}`.cwd(cwd).quiet();
}

describe("getLatestMemberVersion", () => {
  test("returns the highest semver tag for a member", () =>
    withTempRepo(async (repo) => {
      await emptyCommit(repo, "init");
      await tagAtHead(repo, "release-action@v0.1.0");
      await emptyCommit(repo, "second");
      await tagAtHead(repo, "release-action@v0.2.1");
      await tagAtHead(repo, "autopilot@v1.0.0");

      expect(await getLatestMemberVersion("release-action", repo)).toBe("0.2.1");
      expect(await getLatestMemberVersion("autopilot", repo)).toBe("1.0.0");
    }));

  test("returns null when the member has no tags", () =>
    withTempRepo(async (repo) => {
      await emptyCommit(repo, "init");
      expect(await getLatestMemberVersion("release-action", repo)).toBeNull();
    }));
});

describe("getLatestMemberTagReachable", () => {
  test("returns the most recent member tag reachable from HEAD", () =>
    withTempRepo(async (repo) => {
      await emptyCommit(repo, "init");
      await tagAtHead(repo, "release-action@v0.1.0");
      await emptyCommit(repo, "later");
      expect(await getLatestMemberTagReachable("release-action", repo)).toBe(
        "release-action@v0.1.0",
      );
    }));
});
