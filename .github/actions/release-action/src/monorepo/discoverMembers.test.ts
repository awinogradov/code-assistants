/**
 * Tests for workspace member discovery.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { withTempDir } from "../testHelpers.ts";
import { deriveMemberName, discoverMembers } from "./discoverMembers.ts";

async function writePkg(dir: string, contents: Record<string, unknown>): Promise<void> {
  await Bun.write(join(dir, "package.json"), `${JSON.stringify(contents, null, 2)}\n`);
}

describe("deriveMemberName", () => {
  test("strips a leading @scope/", () => {
    expect(deriveMemberName("@code-assistants/release-action")).toBe("release-action");
  });

  test("returns the name unchanged when unscoped", () => {
    expect(deriveMemberName("autopilot")).toBe("autopilot");
  });
});

describe("discoverMembers", () => {
  test("returns unknown when there is no package.json", async () => {
    await withTempDir(async (dir) => {
      const result = await discoverMembers(dir);
      expect(result.mode).toBe("unknown");
      expect(result.members).toEqual([]);
    });
  });

  test("returns standalone when root has a release.type and no workspaces", async () => {
    await withTempDir(async (dir) => {
      await writePkg(dir, { name: "lib", release: { type: "lib-nodejs" } });
      const result = await discoverMembers(dir);
      expect(result.mode).toBe("standalone");
      expect(result.rootReleaseType).toBe("lib-nodejs");
      expect(result.members).toEqual([]);
    });
  });

  test("returns standalone with slack when root declares it", async () => {
    await withTempDir(async (dir) => {
      await writePkg(dir, {
        name: "lib",
        release: { type: "lib-nodejs", slack: "#releases" },
      });
      const result = await discoverMembers(dir);
      expect(result.mode).toBe("standalone");
      expect(result.rootSlack).toBe("#releases");
    });
  });

  test("discovers members from explicit release.members list", async () => {
    await withTempDir(async (dir) => {
      await writePkg(dir, {
        name: "monorepo",
        release: { members: ["packages/lib-a", "packages/lib-b"] },
      });
      await mkdir(join(dir, "packages", "lib-a"), { recursive: true });
      await mkdir(join(dir, "packages", "lib-b"), { recursive: true });
      await writePkg(join(dir, "packages", "lib-a"), {
        name: "@scope/lib-a",
        release: { type: "lib-nodejs" },
      });
      await writePkg(join(dir, "packages", "lib-b"), {
        name: "@scope/lib-b",
        release: { type: "lib-bun", slack: "#libs" },
      });

      const result = await discoverMembers(dir);
      expect(result.mode).toBe("monorepo");
      expect(result.members.map((m) => m.name).sort()).toEqual(["lib-a", "lib-b"]);
      const libB = result.members.find((m) => m.name === "lib-b");
      expect(libB?.releaseType).toBe("lib-bun");
      expect(libB?.slack).toBe("#libs");
    });
  });

  test("expands workspaces globs and skips members without a release field", async () => {
    await withTempDir(async (dir) => {
      await writePkg(dir, {
        name: "monorepo",
        workspaces: ["packages/*"],
      });
      await mkdir(join(dir, "packages", "released"), { recursive: true });
      await mkdir(join(dir, "packages", "internal"), { recursive: true });
      await writePkg(join(dir, "packages", "released"), {
        name: "@scope/released",
        release: { type: "lib-nodejs" },
      });
      await writePkg(join(dir, "packages", "internal"), {
        name: "@scope/internal",
      });

      const result = await discoverMembers(dir);
      expect(result.mode).toBe("monorepo");
      expect(result.members.map((m) => m.name)).toEqual(["released"]);
    });
  });

  test("ignores node_modules when expanding globs", async () => {
    await withTempDir(async (dir) => {
      await writePkg(dir, {
        name: "monorepo",
        workspaces: ["packages/*"],
      });
      await mkdir(join(dir, "node_modules", "packages", "leak"), { recursive: true });
      await writePkg(join(dir, "node_modules", "packages", "leak"), {
        name: "@evil/leak",
        release: { type: "lib-nodejs" },
      });
      await mkdir(join(dir, "packages", "real"), { recursive: true });
      await writePkg(join(dir, "packages", "real"), {
        name: "@scope/real",
        release: { type: "lib-nodejs" },
      });

      const result = await discoverMembers(dir);
      expect(result.members.map((m) => m.name)).toEqual(["real"]);
    });
  });

  test("deduplicates members matched by overlapping workspace globs", () =>
    withTempDir(async (dir) => {
      await writePkg(dir, {
        name: "monorepo",
        workspaces: ["packages/*", "packages/lib"],
      });
      await mkdir(join(dir, "packages", "lib"), { recursive: true });
      await writePkg(join(dir, "packages", "lib"), {
        name: "@scope/lib",
        release: { type: "lib-nodejs" },
      });

      const result = await discoverMembers(dir);
      expect(result.members.length).toBe(1);
      expect(result.members[0]?.name).toBe("lib");
    }));

  test("falls back to standalone when workspaces yield zero eligible members but root has release.type", async () => {
    await withTempDir(async (dir) => {
      await writePkg(dir, {
        name: "monorepo",
        workspaces: ["packages/*"],
        release: { type: "lib-nodejs" },
      });
      await mkdir(join(dir, "packages", "internal"), { recursive: true });
      await writePkg(join(dir, "packages", "internal"), { name: "@scope/internal" });

      const result = await discoverMembers(dir);
      expect(result.mode).toBe("standalone");
      expect(result.rootReleaseType).toBe("lib-nodejs");
    });
  });
});
