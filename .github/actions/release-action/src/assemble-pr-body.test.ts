/**
 * Tests for PR body assembly and truncation
 *
 * Verifies that release notes are read from file, the enhanced body
 * is assembled correctly with changelog link, and large bodies are
 * truncated with a link to the release notes file.
 */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { $ } from "bun";

import { withTempDir } from "./testHelpers.ts";

/** Base env stripped of GitHub CI variables that affect URL generation */
const ciVarKeys = ["GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "INPUT_BRANCH"];
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !ciVarKeys.includes(key))
) as Record<string, string>;

/** GitHub env vars for tests that verify absolute URL generation */
const githubEnv = {
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "test-owner/test-repo",
};

/** Run the assemble-pr-body script in a temp directory */
async function runAssemblePrBody(
  cwd: string,
  extraEnv?: Record<string, string>
): Promise<{ exitCode: number; output: string }> {
  const scriptPath = join(import.meta.dirname, "assemble-pr-body.ts");
  const result = await $`bun ${scriptPath}`
    .cwd(cwd)
    .env({ ...cleanEnv, ...extraEnv })
    .quiet()
    .nothrow();
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

/** Create .release_bot/body with a simple changelog */
async function createBody(cwd: string, content: string): Promise<void> {
  await Bun.write(join(cwd, ".release_bot/body"), content, { createPath: true });
}

/** Create .release_bot/release_notes.md */
async function createReleaseNotes(cwd: string, content: string): Promise<void> {
  await Bun.write(join(cwd, ".release_bot/release_notes.md"), content, { createPath: true });
}

/** Read the assembled body_enhanced output */
async function readEnhanced(cwd: string): Promise<string> {
  return Bun.file(join(cwd, ".release_bot/body_enhanced")).text();
}

/** Generate a string of a specific length */
function generateLargeContent(length: number): string {
  return "x".repeat(length);
}

describe("assemble-pr-body", () => {
  describe("normal assembly", () => {
    test("combines badges, release notes, tickets table, and changelog link", () =>
      withTempDir(async (dir) => {
        await createBody(
          dir,
          "![release:minor](badge)\n\n## Linear\n\n| Issue | PR | Author |\n| --- | --- | --- |\n| [TOOLS-1: Fix](url) | [#10](pr) | @dev |\n\n### Features\n\n* feat A"
        );
        await createReleaseNotes(dir, "Some AI release notes");
        await Bun.write(join(dir, "version"), "1.0.0");

        await runAssemblePrBody(dir, githubEnv);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("![release:minor](badge)");
        expect(enhanced).toContain("## Release Notes");
        expect(enhanced).toContain("Some AI release notes");
        expect(enhanced).toContain("<h2>Linear</h2>");
        expect(enhanced).toContain("TOOLS-1");
        expect(enhanced).toContain("| Issue | PR | Author |");
        expect(enhanced).toContain("📋 [Detailed changelog]");
        expect(enhanced).toContain("CHANGELOG.md");
        // Should NOT contain inline changelog
        expect(enhanced).not.toContain("feat A");
      }));

    test("handles missing release notes file gracefully", () =>
      withTempDir(async (dir) => {
        await createBody(dir, "![release:patch](badge)\n\n### Bug Fixes\n\n* fix B");

        const { exitCode } = await runAssemblePrBody(dir);

        expect(exitCode).toBe(0);
        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("## Release Notes");
        expect(enhanced).toContain("📋 Detailed changelog");
      }));

    test("handles empty release notes file", () =>
      withTempDir(async (dir) => {
        await createBody(dir, "![release:patch](badge)\n\n### Features\n\n* feat C");
        await createReleaseNotes(dir, "   ");

        const { exitCode } = await runAssemblePrBody(dir);

        expect(exitCode).toBe(0);
        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("## Release Notes");
      }));

    test("exits with error when body file is missing", () =>
      withTempDir(async (dir) => {
        await createReleaseNotes(dir, "Some notes");

        const { exitCode } = await runAssemblePrBody(dir);

        expect(exitCode).not.toBe(0);
      }));

    test("body without ticket sections has no ticket details blocks", () =>
      withTempDir(async (dir) => {
        await createBody(dir, "![badge](url)\n\n### Features\n\n* feat D");
        await createReleaseNotes(dir, "Notes");

        await runAssemblePrBody(dir);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).not.toContain("<summary><h2>");
        expect(enhanced).toContain("📋 Detailed changelog");
      }));

    test("changelog link points to CHANGELOG.md on the release branch", () =>
      withTempDir(async (dir) => {
        await createBody(dir, "![badge](url)\n\n### Features\n\n* feat E");
        await createReleaseNotes(dir, "Notes");
        await Bun.write(join(dir, "version"), "2.0.0");

        await runAssemblePrBody(dir, githubEnv);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain(
          "📋 [Detailed changelog](https://github.com/test-owner/test-repo/blob/release-2.0.0/CHANGELOG.md)"
        );
      }));

    test("changelog link uses relative path without GitHub env vars", () =>
      withTempDir(async (dir) => {
        await createBody(dir, "![badge](url)\n\n### Features\n\n* feat G");
        await createReleaseNotes(dir, "Notes");
        await Bun.write(join(dir, "version"), "1.5.0");

        await runAssemblePrBody(dir);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("📋 [Detailed changelog](CHANGELOG.md)");
      }));
  });

  describe("truncation", () => {
    test("truncates body with link to release notes", () =>
      withTempDir(async (dir) => {
        await createBody(dir, `![badge](url)\n\n### Features\n\n* feat`);
        await createReleaseNotes(dir, generateLargeContent(70000));
        await Bun.write(join(dir, "version"), "1.5.0");

        const { exitCode, output } = await runAssemblePrBody(dir, githubEnv);

        expect(exitCode).toBe(0);
        expect(output).toContain("::warning::");
        const enhanced = await readEnhanced(dir);
        expect(enhanced.length).toBeLessThanOrEqual(65536);
        expect(enhanced).toContain(
          "See [full release notes](https://github.com/test-owner/test-repo/blob/release-1.5.0/.release_notes/1.5.0.md)"
        );
      }));

    test("truncation preserves badges and ticket sections", () =>
      withTempDir(async (dir) => {
        await createBody(
          dir,
          `![release:major](badge)\n\n## Linear\n\n| Issue | PR | Author |\n| --- | --- | --- |\n| [TOOLS-321: Fix](url) | [#10](pr) | @dev |\n\n### Features\n\n* feat`
        );
        await createReleaseNotes(dir, generateLargeContent(70000));
        await Bun.write(join(dir, "version"), "10.0.0");

        await runAssemblePrBody(dir, githubEnv);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("![release:major](badge)");
        expect(enhanced).toContain("<h2>Linear</h2>");
        expect(enhanced).toContain("TOOLS-321");
        expect(enhanced).toContain(
          "See [full release notes](https://github.com/test-owner/test-repo/blob/release-10.0.0/.release_notes/10.0.0.md)"
        );
      }));

    test("truncation with no version file uses generic message", () =>
      withTempDir(async (dir) => {
        await createBody(dir, `![badge](url)\n\n### Features\n\n* feat`);
        await createReleaseNotes(dir, generateLargeContent(70000));

        await runAssemblePrBody(dir);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("See release notes file for detailed changes.");
        expect(enhanced).not.toContain("[full release notes]");
      }));

    test("uses custom branch template from INPUT_BRANCH", () =>
      withTempDir(async (dir) => {
        await createBody(dir, `![badge](url)\n\n### Features\n\n* feat`);
        await createReleaseNotes(dir, generateLargeContent(70000));
        await Bun.write(join(dir, "version"), "3.1.0");

        await runAssemblePrBody(dir, { ...githubEnv, INPUT_BRANCH: "rel/{version}" });

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain(
          "See [full release notes](https://github.com/test-owner/test-repo/blob/rel/3.1.0/.release_notes/3.1.0.md)"
        );
      }));

    test("wraps multiple ticket types in separate details blocks", () =>
      withTempDir(async (dir) => {
        await createBody(
          dir,
          `![badge](url)\n\n## Linear\n\n| Issue | PR | Author |\n| --- | --- | --- |\n| [TOOLS-99: Fix](url) | [#5](pr) | @dev |\n\n## GitHub Issues\n\n| Issue | PR | Author |\n| --- | --- | --- |\n| #42 | [#6](pr) | @dev |\n\n### Features\n\n* feat`
        );
        await createReleaseNotes(dir, generateLargeContent(70000));
        await Bun.write(join(dir, "version"), "7.0.0");

        await runAssemblePrBody(dir, githubEnv);

        const enhanced = await readEnhanced(dir);
        expect(enhanced).toContain("<h2>Linear</h2>");
        expect(enhanced).toContain("TOOLS-99");
        expect(enhanced).toContain("<h2>GitHub Issues</h2>");
        expect(enhanced).toContain("#42");

        const detailsCount = (enhanced.match(/<details><summary><h2>/g) ?? []).length;
        expect(detailsCount).toBe(2);
      }));

    test("drops tickets section when tickets alone exceed the limit", () =>
      withTempDir(async (dir) => {
        const hugeTickets = `## Linear\n\n| Issue | PR | Author |\n| --- | --- | --- |\n${generateLargeContent(70000)}`;
        await createBody(
          dir,
          `![release:major](badge)\n\n${hugeTickets}\n\n### Features\n\n* feat`
        );
        await createReleaseNotes(dir, "Small release notes");
        await Bun.write(join(dir, "version"), "25.0.0");

        const { exitCode, output } = await runAssemblePrBody(dir, githubEnv);

        expect(exitCode).toBe(0);
        expect(output).toContain("Dropping tickets section");
        const enhanced = await readEnhanced(dir);
        expect(enhanced.length).toBeLessThanOrEqual(65536);
        expect(enhanced).toContain("![release:major](badge)");
        expect(enhanced).not.toContain("<h2>Linear</h2>");
        expect(enhanced).toContain(
          "See [full release notes](https://github.com/test-owner/test-repo/blob/release-25.0.0/.release_notes/25.0.0.md)"
        );
      }));

    test("hard-truncates when even summary-only body exceeds limit", () =>
      withTempDir(async (dir) => {
        const hugeSummary = `![release:major](badge)\n\n${generateLargeContent(70000)}`;
        await createBody(dir, `${hugeSummary}\n\n### Features\n\n* feat`);
        await createReleaseNotes(dir, "Notes");
        await Bun.write(join(dir, "version"), "9.0.0");

        const { exitCode, output } = await runAssemblePrBody(dir, githubEnv);

        expect(exitCode).toBe(0);
        expect(output).toContain("Hard-truncating");
        const enhanced = await readEnhanced(dir);
        expect(enhanced.length).toBeLessThanOrEqual(65536);
        expect(enhanced.startsWith("![release:major](badge)")).toBe(true);
        expect(enhanced).toContain(
          "See [full release notes](https://github.com/test-owner/test-repo/blob/release-9.0.0/.release_notes/9.0.0.md)"
        );
        expect(enhanced).toContain(
          "📋 [Detailed changelog](https://github.com/test-owner/test-repo/blob/release-9.0.0/CHANGELOG.md)"
        );
      }));
  });
});
