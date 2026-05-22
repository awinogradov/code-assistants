/**
 * Tests for release preparation utilities
 */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { withTempDir } from "./testHelpers.ts";

import { ensureGitignoreEntry, updateUvLockVersion, updateVersionFiles } from "./prepareRelease.ts";

describe("ensureGitignoreEntry", () => {
  test("creates .gitignore with entry when file does not exist", () =>
    withTempDir(async (dir) => {
      const result = await ensureGitignoreEntry(".release_bot", dir);

      expect(result).toBe(true);
      const content = await Bun.file(join(dir, ".gitignore")).text();
      expect(content).toBe(".release_bot\n");
    }));

  test("adds entry to existing .gitignore", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".gitignore"), "node_modules\n");

      const result = await ensureGitignoreEntry(".release_bot", dir);

      expect(result).toBe(true);
      const content = await Bun.file(join(dir, ".gitignore")).text();
      expect(content).toBe("node_modules\n.release_bot\n");
    }));

  test("returns false when entry already exists", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".gitignore"), "node_modules\n.release_bot\n");

      const result = await ensureGitignoreEntry(".release_bot", dir);

      expect(result).toBe(false);
    }));

  test("does not duplicate entry with surrounding whitespace", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".gitignore"), "  .release_bot  \n");

      const result = await ensureGitignoreEntry(".release_bot", dir);

      expect(result).toBe(false);
    }));
});

describe("updateVersionFiles", () => {
  test("updates package.json version", () =>
    withTempDir(async (dir) => {
      await Bun.write(
        join(dir, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }, null, 2)
      );

      const updated = await updateVersionFiles("2.0.0", dir);

      expect(updated).toEqual(["package.json"]);
      const pkg = (await Bun.file(join(dir, "package.json")).json()) as { version: string };
      expect(pkg.version).toBe("2.0.0");
    }));

  test("updates pyproject.toml version", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, "pyproject.toml"), '[project]\nname = "test"\nversion = "1.0.0"\n');

      const updated = await updateVersionFiles("2.0.0", dir);

      expect(updated).toEqual(["pyproject.toml"]);
      const content = await Bun.file(join(dir, "pyproject.toml")).text();
      expect(content).toContain('version = "2.0.0"');
    }));

  test("only updates the [project] version, not other sections with a version key", () =>
    withTempDir(async (dir) => {
      const original = [
        '[project]',
        'name = "test"',
        'version = "1.0.0"',
        '',
        '[tool.uv.workspace]',
        'version = "9.9.9"',
        '',
        '[[tool.poetry.source]]',
        'name = "internal"',
        'version = "0.1.0"',
        '',
      ].join("\n");
      await Bun.write(join(dir, "pyproject.toml"), original);

      await updateVersionFiles("2.0.0", dir);

      const content = await Bun.file(join(dir, "pyproject.toml")).text();
      expect(content).toContain('[project]\nname = "test"\nversion = "2.0.0"');
      expect(content).toContain('[tool.uv.workspace]\nversion = "9.9.9"');
      expect(content).toContain('version = "0.1.0"');
    }));

  test("updates plugin.json version", () =>
    withTempDir(async (dir) => {
      const pluginDir = join(dir, "my-plugin", ".claude-plugin");
      await Bun.write(
        join(pluginDir, "plugin.json"),
        JSON.stringify({ name: "my-plugin", version: "1.0.0" }, null, 2),
        { createPath: true }
      );

      const updated = await updateVersionFiles("2.0.0", dir);

      expect(updated).toContainEqual("my-plugin/.claude-plugin/plugin.json");
      const plugin = (await Bun.file(join(pluginDir, "plugin.json")).json()) as { version: string };
      expect(plugin.version).toBe("2.0.0");
    }));

  test("updates multiple files at once", () =>
    withTempDir(async (dir) => {
      await Bun.write(
        join(dir, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }, null, 2)
      );
      await Bun.write(join(dir, "pyproject.toml"), '[project]\nname = "test"\nversion = "1.0.0"\n');

      const updated = await updateVersionFiles("3.0.0", dir);

      expect(updated).toContain("package.json");
      expect(updated).toContain("pyproject.toml");
    }));

  test("returns empty array when no version files exist", () =>
    withTempDir(async (dir) => {
      const updated = await updateVersionFiles("1.0.0", dir);

      expect(updated).toEqual([]);
    }));

  test("updates uv.lock alongside pyproject.toml", () =>
    withTempDir(async (dir) => {
      await Bun.write(
        join(dir, "pyproject.toml"),
        '[project]\nname = "my-service"\nversion = "1.0.0"\n'
      );
      await Bun.write(
        join(dir, "uv.lock"),
        [
          "version = 1",
          "",
          "[[package]]",
          'name = "my-service"',
          'version = "1.0.0"',
          'source = { virtual = "." }',
          "",
          "[[package]]",
          'name = "requests"',
          'version = "2.31.0"',
          'source = { registry = "https://pypi.org/simple" }',
          "",
        ].join("\n")
      );

      const updated = await updateVersionFiles("2.0.0", dir);

      expect(updated).toContain("uv.lock");
      const lockContent = await Bun.file(join(dir, "uv.lock")).text();
      expect(lockContent).toContain('name = "my-service"\nversion = "2.0.0"');
      expect(lockContent).toContain('name = "requests"\nversion = "2.31.0"');
    }));

  test("skips uv.lock when pyproject.toml is missing", () =>
    withTempDir(async (dir) => {
      await Bun.write(
        join(dir, "uv.lock"),
        '[[package]]\nname = "my-service"\nversion = "1.0.0"\nsource = { virtual = "." }\n'
      );

      const updated = await updateVersionFiles("2.0.0", dir);

      expect(updated).not.toContain("uv.lock");
    }));
});

describe("updateUvLockVersion", () => {
  const baseLock = [
    "version = 1",
    "",
    "[[package]]",
    'name = "my-service"',
    'version = "1.0.0"',
    'source = { virtual = "." }',
    "",
    "[[package]]",
    'name = "requests"',
    'version = "2.31.0"',
    'source = { registry = "https://pypi.org/simple" }',
    "",
  ].join("\n");

  test("updates version in project package block", () => {
    const result = updateUvLockVersion(baseLock, "2.0.0");

    expect(result).toContain('name = "my-service"\nversion = "2.0.0"');
  });

  test("does not modify other packages", () => {
    const result = updateUvLockVersion(baseLock, "2.0.0");

    expect(result).toContain('name = "requests"\nversion = "2.31.0"');
  });

  test("handles editable source", () => {
    const lock = baseLock.replace('virtual = "."', 'editable = "."');
    const result = updateUvLockVersion(lock, "2.0.0");

    expect(result).toContain('name = "my-service"\nversion = "2.0.0"');
  });

  test("returns content unchanged when no local source block", () => {
    const lock = [
      "version = 1",
      "",
      "[[package]]",
      'name = "requests"',
      'version = "2.31.0"',
      'source = { registry = "https://pypi.org/simple" }',
      "",
    ].join("\n");

    const result = updateUvLockVersion(lock, "2.0.0");

    expect(result).toBe(lock);
  });

  test("returns content unchanged when version already matches", () => {
    const result = updateUvLockVersion(baseLock, "1.0.0");

    expect(result).toBe(baseLock);
  });

  test("ignores workspace members whose source is not the project root", () => {
    const lock = [
      "version = 1",
      "",
      "[[package]]",
      'name = "my-service"',
      'version = "1.0.0"',
      'source = { virtual = "." }',
      "",
      "[[package]]",
      'name = "shared-utils"',
      'version = "0.5.0"',
      'source = { virtual = "packages/utils" }',
      "",
      "[[package]]",
      'name = "shared-types"',
      'version = "0.5.0"',
      'source = { editable = "packages/types" }',
      "",
    ].join("\n");

    const result = updateUvLockVersion(lock, "2.0.0");

    expect(result).toContain('name = "my-service"\nversion = "2.0.0"');
    expect(result).toContain('name = "shared-utils"\nversion = "0.5.0"');
    expect(result).toContain('name = "shared-types"\nversion = "0.5.0"');
  });
});
