/**
 * Tests for MIGRATING.md section rendering and append.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { $ } from "bun";

import { withTempDir, withTempRepo } from "../testHelpers.ts";
import {
  appendMigratingSection,
  readBreakingNotes,
  renderMigratingSection,
} from "./migratingAppend.ts";

describe("renderMigratingSection", () => {
  test("renders from->to heading and breaking notes", () => {
    const section = renderMigratingSection({
      memberPath: "/x",
      previousVersion: "1.4.0",
      newVersion: "2.0.0",
      breakingNotes: ["release.type renamed to release.kind"],
    });
    expect(section).toContain("## From 1.4.0 to 2.0.0");
    expect(section).toContain("### Breaking changes");
    expect(section).toContain("- release.type renamed to release.kind");
  });

  test("falls back to a placeholder bullet when no breaking notes are present", () => {
    const section = renderMigratingSection({
      memberPath: "/x",
      previousVersion: "1.0.0",
      newVersion: "2.0.0",
      breakingNotes: [],
    });
    expect(section).toContain("- _Document migration steps here._");
  });

  test("uses a bare version heading when there is no previous release", () => {
    const section = renderMigratingSection({
      memberPath: "/x",
      previousVersion: null,
      newVersion: "1.0.0",
      breakingNotes: [],
    });
    expect(section).toMatch(/^## 1\.0\.0/);
  });
});

describe("appendMigratingSection", () => {
  test("creates the file with a top-level header when missing", () =>
    withTempDir(async (dir) => {
      await appendMigratingSection({
        memberPath: dir,
        previousVersion: "0.9.0",
        newVersion: "1.0.0",
        breakingNotes: ["renamed `foo` to `bar`"],
      });
      const text = await Bun.file(join(dir, "MIGRATING.md")).text();
      expect(text.startsWith("# MIGRATING\n\n")).toBe(true);
      expect(text).toContain("## From 0.9.0 to 1.0.0");
    }));

  test("appends with exactly one blank line between sections", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, "MIGRATING.md"), "# MIGRATING\n\n## From 0.1.0 to 0.2.0\n\n");
      await appendMigratingSection({
        memberPath: dir,
        previousVersion: "0.2.0",
        newVersion: "1.0.0",
        breakingNotes: ["dropped Node 18 support"],
      });
      const text = await Bun.file(join(dir, "MIGRATING.md")).text();
      const sections = text.match(/^## /gm) ?? [];
      expect(sections.length).toBe(2);
      expect(text).toContain("## From 0.2.0 to 1.0.0");
      expect(text).not.toMatch(/\n\n\n+/);
    }));
});

describe("readBreakingNotes", () => {
  async function commit(
    repo: string,
    relPath: string,
    file: string,
    message: string,
  ): Promise<void> {
    await mkdir(join(repo, relPath), { recursive: true });
    await Bun.write(join(repo, relPath, file), `${Date.now()}\n`);
    await $`git add ${join(relPath, file)}`.cwd(repo).quiet();
    await $`git commit -m ${message}`.cwd(repo).quiet();
  }

  test("extracts BREAKING CHANGE footer from a commit touching the member path", () =>
    withTempRepo(async (repo) => {
      await commit(
        repo,
        "packages/lib",
        "f.txt",
        "feat(lib): rework api\n\nBREAKING CHANGE: dropped legacy callback form.",
      );
      const notes = await readBreakingNotes({
        cwd: repo,
        path: "packages/lib",
        since: null,
      });
      expect(notes).toEqual(["dropped legacy callback form."]);
    }));

  test("ignores commits that did not touch the member path", () =>
    withTempRepo(async (repo) => {
      await commit(
        repo,
        "packages/other",
        "f.txt",
        "feat(other): boom\n\nBREAKING CHANGE: unrelated.",
      );
      const notes = await readBreakingNotes({
        cwd: repo,
        path: "packages/lib",
        since: null,
      });
      expect(notes).toEqual([]);
    }));
});
