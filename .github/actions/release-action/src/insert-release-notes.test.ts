/**
 * Tests for {@link insertReleaseNotes}.
 *
 * Covers the happy path (notes spliced into both CHANGELOG.md and the per-version
 * release-notes file under the version header) and the silently-skipping paths
 * (missing source notes, empty source notes, missing version header).
 */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { insertReleaseNotes } from "./insert-release-notes.ts";
import { withTempDir } from "./testHelpers.ts";

describe("insertReleaseNotes", () => {
  test("splices notes into CHANGELOG.md and .release_notes/<v>.md under the version header", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".release_bot/release_notes.md"), "- Faster startup\n");
      await Bun.write(
        join(dir, "CHANGELOG.md"),
        "# Changelog\n\n## 1.2.0 (2026-01-01)\n\n### Features\n\n- thing\n",
      );
      await Bun.write(
        join(dir, ".release_notes/1.2.0.md"),
        "## 1.2.0 (2026-01-01)\n\n### Features\n\n- thing\n",
      );

      await insertReleaseNotes({ cwd: dir, version: "1.2.0" });

      const changelog = await Bun.file(join(dir, "CHANGELOG.md")).text();
      const noteFile = await Bun.file(join(dir, ".release_notes/1.2.0.md")).text();

      expect(changelog).toContain("## Release Notes");
      expect(changelog).toContain("Faster startup");
      expect(noteFile).toContain("## Release Notes");
      expect(noteFile).toContain("Faster startup");
    }));

  test("no-ops silently when .release_bot/release_notes.md is missing", () =>
    withTempDir(async (dir) => {
      const original = "# Changelog\n\n## 1.2.0 (2026-01-01)\n\n- thing\n";
      await Bun.write(join(dir, "CHANGELOG.md"), original);

      await insertReleaseNotes({ cwd: dir, version: "1.2.0" });

      const after = await Bun.file(join(dir, "CHANGELOG.md")).text();
      expect(after).toBe(original);
    }));

  test("no-ops silently when notes file is empty whitespace", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".release_bot/release_notes.md"), "   \n");
      const original = "# Changelog\n\n## 1.2.0 (2026-01-01)\n\n- thing\n";
      await Bun.write(join(dir, "CHANGELOG.md"), original);

      await insertReleaseNotes({ cwd: dir, version: "1.2.0" });

      const after = await Bun.file(join(dir, "CHANGELOG.md")).text();
      expect(after).toBe(original);
    }));

  test("leaves CHANGELOG.md untouched when the version header is absent", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".release_bot/release_notes.md"), "- Some notes\n");
      const original = "# Changelog\n\n## 0.9.0 (2025-12-01)\n\n- earlier\n";
      await Bun.write(join(dir, "CHANGELOG.md"), original);

      await insertReleaseNotes({ cwd: dir, version: "1.2.0" });

      const after = await Bun.file(join(dir, "CHANGELOG.md")).text();
      expect(after).toBe(original);
    }));

  test("prepends notes when the per-version file lacks the version header", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".release_bot/release_notes.md"), "- Hot fix\n");
      await Bun.write(
        join(dir, ".release_notes/1.2.0.md"),
        "### Bug Fixes\n\n- patch the thing\n",
      );

      await insertReleaseNotes({ cwd: dir, version: "1.2.0" });

      const noteFile = await Bun.file(join(dir, ".release_notes/1.2.0.md")).text();
      // No version header means the notes are prepended verbatim.
      expect(noteFile.startsWith("## Release Notes")).toBe(true);
      expect(noteFile).toContain("Hot fix");
      expect(noteFile).toContain("patch the thing");
    }));
});
