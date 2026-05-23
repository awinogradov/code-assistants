/**
 * Tests for runPublish member resolution.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { withTempDir } from "../testHelpers.ts";
import { resolvePublishPlan } from "./runPublish.ts";

async function writeJson(path: string, value: Record<string, unknown>): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function setupMonorepo(dir: string): Promise<void> {
  await writeJson(join(dir, "package.json"), {
    name: "monorepo",
    workspaces: ["packages/*"],
  });
  await mkdir(join(dir, "packages", "lib"), { recursive: true });
  await mkdir(join(dir, "packages", "act"), { recursive: true });
  await writeJson(join(dir, "packages", "lib", "package.json"), {
    name: "@scope/lib",
    release: { type: "lib-nodejs", slack: "#lib" },
  });
  await writeJson(join(dir, "packages", "act", "package.json"), {
    name: "@scope/act",
    release: { type: "github-action" },
  });
}

describe("resolvePublishPlan", () => {
  test("resolves a lib-nodejs member from its release-notes path", () =>
    withTempDir(async (dir) => {
      await setupMonorepo(dir);
      const plan = await resolvePublishPlan({
        cwd: dir,
        changedFiles: ["packages/lib/.release_notes/1.2.0.md"],
      });
      expect(plan.member.name).toBe("lib");
      expect(plan.version).toBe("1.2.0");
      expect(plan.versionTag).toBe("lib@v1.2.0");
      expect(plan.publishToNpm).toBe(true);
      expect(plan.majorTag).toBeUndefined();
      expect(plan.slackChannel).toBe("#lib");
    }));

  test("adds a floating major tag for a github-action member", () =>
    withTempDir(async (dir) => {
      await setupMonorepo(dir);
      const plan = await resolvePublishPlan({
        cwd: dir,
        changedFiles: ["packages/act/.release_notes/2.5.1.md"],
      });
      expect(plan.member.name).toBe("act");
      expect(plan.versionTag).toBe("act@v2.5.1");
      expect(plan.majorTag).toBe("act@v2");
      expect(plan.publishToNpm).toBe(false);
    }));

  test("throws when no member is referenced", () =>
    withTempDir(async (dir) => {
      await setupMonorepo(dir);
      await expect(resolvePublishPlan({ cwd: dir, changedFiles: ["README.md"] })).rejects.toThrow(
        /No release-notes file/,
      );
    }));

  test("throws when multiple members are referenced", () =>
    withTempDir(async (dir) => {
      await setupMonorepo(dir);
      await expect(
        resolvePublishPlan({
          cwd: dir,
          changedFiles: [
            "packages/lib/.release_notes/1.0.0.md",
            "packages/act/.release_notes/2.0.0.md",
          ],
        }),
      ).rejects.toThrow(/Multiple members/);
    }));

  test("throws when called against a standalone repo", () =>
    withTempDir(async (dir) => {
      await writeJson(join(dir, "package.json"), {
        name: "lib",
        release: { type: "lib-nodejs" },
      });
      await expect(
        resolvePublishPlan({
          cwd: dir,
          changedFiles: [".release_notes/1.0.0.md"],
        }),
      ).rejects.toThrow(/requires monorepo mode/);
    }));
});
