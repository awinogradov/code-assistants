/**
 * Tests for Release CLI
 *
 * Uses isolated temporary git repositories for integration tests
 * to test git-dependent functionality.
 */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { $ } from "bun";

import {
  bumpVersion,
  changelogHeader,
  generateChangelog,
  getCurrentVersion,
  main,
  startOfLastReleasePattern,
} from "./release.ts";
import { createCommit, createInitialCommitAndTag, withTempRepo } from "./testHelpers.ts";

/** Creates a package.json in the test repo */
async function createPackageJson(repoPath: string, version = "1.0.0"): Promise<void> {
  const pkg = { name: "test-pkg", version };
  await Bun.write(join(repoPath, "package.json"), JSON.stringify(pkg, null, 2));
}

/** Creates a version file in the test repo */
async function createVersionFile(repoPath: string, version = "1.0.0"): Promise<void> {
  await Bun.write(join(repoPath, "version"), version);
}

/** Creates a plugin.json in the test repo */
async function createPluginJson(
  repoPath: string,
  pluginName: string,
  version = "1.0.0"
): Promise<void> {
  const pluginDir = join(repoPath, pluginName, ".claude-plugin");
  await $`mkdir -p ${pluginDir}`.quiet();
  await Bun.write(
    join(pluginDir, "plugin.json"),
    JSON.stringify({ name: pluginName, version }, null, 2)
  );
}

/** Creates a pyproject.toml in the test repo */
async function createPyprojectToml(repoPath: string, version = "1.0.0"): Promise<void> {
  await Bun.write(
    join(repoPath, "pyproject.toml"),
    `[project]\nname = "test-pkg"\nversion = "${version}"\n`
  );
}

describe("release CLI", () => {
  describe("startOfLastReleasePattern", () => {
    test("matches markdown header with bracketed version", () => {
      const content = "## [1.0.0] (2025-01-01)\n\n### Features";
      const match = content.search(startOfLastReleasePattern);
      expect(match).toBe(0);
    });

    test("matches markdown header with plain version", () => {
      const content = "## 1.0.0 (2025-01-01)\n\n### Features";
      const match = content.search(startOfLastReleasePattern);
      expect(match).toBe(0);
    });

    test("matches anchor tag format", () => {
      const content = '<a name="1.0.0"></a>\n## 1.0.0';
      const match = content.search(startOfLastReleasePattern);
      expect(match).toBe(0);
    });

    test("returns -1 for non-release content", () => {
      const content = "# Changelog\n\nSome description text without version";
      const match = content.search(startOfLastReleasePattern);
      expect(match).toBe(-1);
    });

    test("finds version after header text", () => {
      const content = "# Changelog\n\nSome text\n\n## [2.0.0] Release";
      const match = content.search(startOfLastReleasePattern);
      expect(match).toBeGreaterThan(0);
      expect(content.substring(match)).toStartWith("## [2.0.0]");
    });
  });

  describe("changelogHeader", () => {
    test("starts with # Changelog", () => {
      expect(changelogHeader).toStartWith("# Changelog");
    });

    test("contains conventional commits link", () => {
      expect(changelogHeader).toContain("conventionalcommits.org");
    });
  });

  describe("getCurrentVersion()", () => {
    test("reads from version file first", () =>
      withTempRepo(async (testRepo) => {
        await createVersionFile(testRepo, "2.0.0");
        await createPackageJson(testRepo, "1.0.0");

        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("2.0.0");
        expect(result.source).toBe("version-file");
      }));

    test("falls back to package.json when no version file", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo, "1.5.0");

        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("1.5.0");
        expect(result.source).toBe("package-json");
      }));

    test("falls back to plugin.json when no package.json", () =>
      withTempRepo(async (testRepo) => {
        await createPluginJson(testRepo, "my-plugin", "3.0.0");

        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("3.0.0");
        expect(result.source).toBe("plugin-json");
      }));

    test("falls back to pyproject.toml when nothing else exists", () =>
      withTempRepo(async (testRepo) => {
        await createPyprojectToml(testRepo, "0.5.0");

        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("0.5.0");
        expect(result.source).toBe("pyproject-toml");
      }));

    test("creates version file with 0.0.0 when no version source and no tags", () =>
      withTempRepo(async (testRepo) => {
        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("0.0.0");
        expect(result.source).toBe("version-file");
        expect(await Bun.file(join(testRepo, "version")).text()).toBe("0.0.0");
      }));

    test("creates version file from latest git tag when no version source", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo, "1.2.3");
        await createInitialCommitAndTag(testRepo, "1.2.3");
        // Remove package.json so no manifest exists, but v1.2.3 tag remains
        await $`rm ${join(testRepo, "package.json")}`.quiet();

        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("1.2.3");
        expect(result.source).toBe("version-file");
        expect(await Bun.file(join(testRepo, "version")).text()).toBe("1.2.3");
      }));

    test("skips invalid semver in version file", () =>
      withTempRepo(async (testRepo) => {
        await createVersionFile(testRepo, "not-a-version");
        await createPackageJson(testRepo, "1.0.0");

        const result = await getCurrentVersion(testRepo);

        expect(result.version).toBe("1.0.0");
        expect(result.source).toBe("package-json");
      }));
  });

  describe("bumpVersion()", () => {
    test("feat commit returns minor bump", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: add new feature");

        const result = await bumpVersion("1.0.0", testRepo);

        expect(result.type).toBe("minor");
        expect(result.newVersion).toBe("1.1.0");
        expect(result.newTag).toBe("v1.1.0");
      }));

    test("fix commit returns patch bump", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "fix: resolve bug");

        const result = await bumpVersion("1.0.0", testRepo);

        expect(result.type).toBe("patch");
        expect(result.newVersion).toBe("1.0.1");
        expect(result.newTag).toBe("v1.0.1");
      }));

    test("breaking change returns major bump", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat!: breaking API change");

        const result = await bumpVersion("1.0.0", testRepo);

        expect(result.type).toBe("major");
        expect(result.newVersion).toBe("2.0.0");
        expect(result.newTag).toBe("v2.0.0");
      }));

    test("BREAKING CHANGE in footer returns major bump", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await Bun.write(join(testRepo, "breaking.txt"), "content");
        await $`git add breaking.txt`.cwd(testRepo).quiet();
        await $`git commit -m ${"feat: new feature\n\nBREAKING CHANGE: removed old API"}`
          .cwd(testRepo)
          .quiet();

        const result = await bumpVersion("1.0.0", testRepo);

        expect(result.type).toBe("major");
        expect(result.newVersion).toBe("2.0.0");
      }));

    test("returns patch bump when only non-breaking commits", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "docs: update readme");

        const result = await bumpVersion("1.0.0", testRepo);

        expect(result.type).toBe("patch");
        expect(result.newVersion).toBe("1.0.1");
      }));

    test("multiple feat commits still returns minor", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: first feature", "file1.txt");
        await createCommit(testRepo, "feat: second feature", "file2.txt");
        await createCommit(testRepo, "feat: third feature", "file3.txt");

        const result = await bumpVersion("1.0.0", testRepo);

        expect(result.type).toBe("minor");
        expect(result.newVersion).toBe("1.1.0");
      }));
  });

  describe("generateChangelog()", () => {
    test("creates CHANGELOG.md if missing", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        await generateChangelog("1.1.0", testRepo);

        expect(await Bun.file(join(testRepo, "CHANGELOG.md")).exists()).toBe(true);
      }));

    test("release contains version number", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        const result = await generateChangelog("1.1.0", testRepo);

        expect(result.release).toContain("1.1.0");
      }));

    test("release contains commit message", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: add awesome feature");

        const result = await generateChangelog("1.1.0", testRepo);

        expect(result.release).toContain("add awesome feature");
      }));

    test("preserves existing changelog history", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);

        // Create existing changelog with history
        const existingContent = "## [1.0.0] (2025-01-01)\n\n### Features\n\n* initial release";
        await Bun.write(join(testRepo, "CHANGELOG.md"), existingContent);

        await createCommit(testRepo, "feat: new feature");

        const result = await generateChangelog("1.1.0", testRepo);

        expect(result.history).toContain("[1.0.0]");
        expect(result.history).toContain("initial release");
      }));

    test("header is the standard changelog header", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        const result = await generateChangelog("1.1.0", testRepo);

        expect(result.header).toBe(changelogHeader);
      }));
  });

  describe("main()", () => {
    test("creates version file with correct content", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo, "1.0.0");
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        await main({ cwd: testRepo });

        const version = await Bun.file(join(testRepo, "version")).text();
        expect(version).toBe("1.1.0");
      }));

    test("creates .release_bot/body file", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        await main({ cwd: testRepo });

        expect(await Bun.file(join(testRepo, ".release_bot/body")).exists()).toBe(true);
      }));

    test("summary body contains release type badge", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        await main({ cwd: testRepo });

        const body = await Bun.file(join(testRepo, ".release_bot/body")).text();
        expect(body).toContain(
          "![release:minor](https://img.shields.io/badge/release-minor-brightgreen)"
        );
        expect(body).not.toContain("## Summary");
        expect(body).not.toContain("breaking%20changes");
      }));

    test("summary body contains breaking changes badge for major release", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat!: breaking API change");

        await main({ cwd: testRepo });

        const body = await Bun.file(join(testRepo, ".release_bot/body")).text();
        expect(body).toContain("![release:major](https://img.shields.io/badge/release-major-red)");
        expect(body).toContain("breaking%20changes-1-red");
      }));

    test("creates release notes file", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo, "1.0.0");
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: new feature");

        await main({ cwd: testRepo });

        expect(await Bun.file(join(testRepo, ".release_notes/1.1.0.md")).exists()).toBe(true);
      }));

    test("updates CHANGELOG.md", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo, "1.0.0");
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "feat: awesome feature");

        await main({ cwd: testRepo });

        const changelog = await Bun.file(join(testRepo, "CHANGELOG.md")).text();
        expect(changelog).toContain("# Changelog");
        expect(changelog).toContain("1.1.0");
        expect(changelog).toContain("awesome feature");
      }));

    test("includes chore commits in changelog", () =>
      withTempRepo(async (testRepo) => {
        await createPackageJson(testRepo);
        await createInitialCommitAndTag(testRepo);
        await createCommit(testRepo, "chore: update readme");

        const version = await main({ cwd: testRepo });

        expect(version).toBe("1.0.1"); // patch bump for chore
        const changelog = await Bun.file(join(testRepo, "CHANGELOG.md")).text();
        expect(changelog).toContain("### Chores");
        expect(changelog).toContain("update readme");
      }));
  });
});
