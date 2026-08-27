/**
 * Pack-contract and clean-install tests for the `@code-assistants/autopilot`
 * npm artifact. The pack contract rejects both a missing runtime surface and
 * unapproved content sneaking into the tarball; the clean install proves a
 * consumer project receives the plugin manifest, marketplace manifest, skills,
 * agents, and helper modules at the released version.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const memberDir = join(import.meta.dirname, "..");

/** Paths every published artifact must carry (representative runtime surface). */
const requiredPaths = [
  "package.json",
  "README.md",
  "MIGRATING.md",
  "CHANGELOG.md",
  "LICENSE.md",
  ".mcp.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  "skills/plan/SKILL.md",
  "agents/expert-review.md",
  "lib/git/branchDigest.ts",
];

/** First path segments allowed in the tarball (npm auto-packs the last two). */
const allowedTopLevel = new Set([
  "skills",
  "agents",
  "lib",
  ".claude-plugin",
  ".mcp.json",
  "MIGRATING.md",
  "CHANGELOG.md",
  "LICENSE.md",
  "package.json",
  "README.md",
]);

interface PackReport {
  filename: string;
  version: string;
  files: { path: string }[];
}

describe("npm artifact contract", () => {
  let packDir: string;
  let packedFiles: string[] = [];
  let tarballPath = "";
  let memberVersion = "";

  beforeAll(async () => {
    packDir = await mkdtemp(join(tmpdir(), "autopilot-pack-"));
    memberVersion = (await Bun.file(join(memberDir, "version")).text()).trim();
    const result = await $`npm pack --json --pack-destination ${packDir}`.cwd(memberDir).quiet();
    const [report] = JSON.parse(result.stdout.toString()) as PackReport[];
    if (!report) throw new Error("npm pack --json returned no report");
    packedFiles = report.files.map((f) => f.path);
    tarballPath = join(packDir, report.filename);
  }, 120000);

  afterAll(async () => {
    await rm(packDir, { recursive: true, force: true });
  });

  test("ships the full runtime surface", () => {
    const missing = requiredPaths.filter((p) => !packedFiles.includes(p));
    expect(missing).toEqual([]);
  });

  test("ships nothing outside the approved surface", () => {
    const unexpected = packedFiles.filter((p) => {
      const [top] = p.split("/");
      return top !== undefined && !allowedTopLevel.has(top);
    });
    expect(unexpected).toEqual([]);
  });

  test("keeps lib tests out of the artifact", () => {
    const tests = packedFiles.filter((p) => p.startsWith("lib/") && p.endsWith(".test.ts"));
    expect(tests).toEqual([]);
  });

  test(
    "installs cleanly into an empty project at the released version",
    async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "autopilot-install-"));
      try {
        await Bun.write(
          join(projectDir, "package.json"),
          `${JSON.stringify({ name: "consumer", private: true }, null, 2)}\n`,
        );
        await $`npm install ${tarballPath} --no-audit --no-fund --ignore-scripts`
          .cwd(projectDir)
          .quiet();

        const installedDir = join(projectDir, "node_modules", "@code-assistants", "autopilot");
        const plugin = (await Bun.file(join(installedDir, ".claude-plugin", "plugin.json")).json()) as {
          version: string;
        };
        expect(plugin.version).toBe(memberVersion);

        for (const required of requiredPaths) {
          expect(await Bun.file(join(installedDir, required)).exists()).toBe(true);
        }
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    },
    120000,
  );
});
