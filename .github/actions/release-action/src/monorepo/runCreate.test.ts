/**
 * Integration test for the runCreate orchestrator against a fixture monorepo.
 *
 * The fixture spins up two workspace members in a temporary git repository:
 * `lib-a` (a Node library) and `lib-b` (a workspace consumer of `lib-a`). The
 * test seeds path-scoped commits, runs the orchestrator, and asserts on the
 * per-member artifacts and on dependent-propagation behaviour.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { $ } from "bun";

import { withTempRepo } from "../testHelpers.ts";
import { runCreate } from "./runCreate.ts";

async function writeJson(path: string, value: Record<string, unknown>): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function commitInPath(
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

async function setupFixture(repo: string): Promise<void> {
  await writeJson(join(repo, "package.json"), {
    name: "monorepo",
    private: true,
    workspaces: ["packages/*"],
  });

  await mkdir(join(repo, "packages", "lib-a"), { recursive: true });
  await mkdir(join(repo, "packages", "lib-b"), { recursive: true });

  await writeJson(join(repo, "packages", "lib-a", "package.json"), {
    name: "@fixture/lib-a",
    version: "0.0.0",
    release: { type: "lib-nodejs" },
  });
  await writeJson(join(repo, "packages", "lib-b", "package.json"), {
    name: "@fixture/lib-b",
    version: "0.0.0",
    release: { type: "lib-nodejs" },
    dependencies: { "@fixture/lib-a": "workspace:*" },
  });

  await $`git add .`.cwd(repo).quiet();
  await $`git commit -m ${"chore: seed fixture"}`.cwd(repo).quiet();
}

describe("runCreate", () => {
  test("skips members with no commits since their last tag", () =>
    withTempRepo(async (repo) => {
      await setupFixture(repo);
      await $`git tag lib-a@v0.1.0 HEAD`.cwd(repo).quiet();
      await $`git tag lib-b@v0.1.0 HEAD`.cwd(repo).quiet();

      const result = await runCreate({ cwd: repo });
      expect(result.discovery.mode).toBe("monorepo");
      expect(result.releases.map((r) => r.member.name)).toEqual([]);
    }));

  test("computes a feat bump for a member with a feat commit", () =>
    withTempRepo(async (repo) => {
      await setupFixture(repo);
      await $`git tag lib-a@v0.1.0 HEAD`.cwd(repo).quiet();
      await $`git tag lib-b@v0.1.0 HEAD`.cwd(repo).quiet();
      await commitInPath(repo, "packages/lib-a", "f1.txt", "feat(lib-a): add foo");

      const result = await runCreate({ cwd: repo });
      const libA = result.releases.find((r) => r.member.name === "lib-a");
      expect(libA?.bumpLevel).toBe("minor");
      expect(libA?.newVersion).toBe("0.2.0");
      expect(libA?.natural).toBe(true);
      expect(libA?.tag).toBe("lib-a@v0.2.0");
      expect(libA?.branch).toBe("release-lib-a-0.2.0");
    }));

  test("propagates a patch bump to a workspace dependent", () =>
    withTempRepo(async (repo) => {
      await setupFixture(repo);
      await $`git tag lib-a@v0.1.0 HEAD`.cwd(repo).quiet();
      await $`git tag lib-b@v0.1.0 HEAD`.cwd(repo).quiet();
      await commitInPath(repo, "packages/lib-a", "f1.txt", "feat(lib-a): add foo");

      const result = await runCreate({ cwd: repo });
      const libB = result.releases.find((r) => r.member.name === "lib-b");
      expect(libB?.bumpLevel).toBe("patch");
      expect(libB?.newVersion).toBe("0.1.1");
      expect(libB?.natural).toBe(false);
    }));

  test("does not propagate to unaffected members", () =>
    withTempRepo(async (repo) => {
      await setupFixture(repo);
      await $`git tag lib-a@v0.1.0 HEAD`.cwd(repo).quiet();
      await $`git tag lib-b@v0.1.0 HEAD`.cwd(repo).quiet();
      // touch only lib-b — lib-a should not be propagated to (lib-b doesn't
      // depend on itself and there's no consumer of lib-b).
      await commitInPath(repo, "packages/lib-b", "f1.txt", "fix(lib-b): bug");

      const result = await runCreate({ cwd: repo });
      expect(result.releases.map((r) => r.member.name)).toEqual(["lib-b"]);
    }));

  test("returns standalone mode without releases when there are no eligible workspace members", () =>
    withTempRepo(async (repo) => {
      await writeJson(join(repo, "package.json"), {
        name: "lib",
        release: { type: "lib-nodejs" },
      });
      await $`git add .`.cwd(repo).quiet();
      await $`git commit -m ${"chore: seed"}`.cwd(repo).quiet();

      const result = await runCreate({ cwd: repo });
      expect(result.discovery.mode).toBe("standalone");
      expect(result.releases).toEqual([]);
    }));
});
