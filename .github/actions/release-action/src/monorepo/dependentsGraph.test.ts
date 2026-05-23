/**
 * Tests for the workspace dependents graph and bump propagation.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { withTempDir } from "../testHelpers.ts";
import {
  buildDependentsGraph,
  maxBump,
  propagateBumps,
  type MemberManifest,
} from "./dependentsGraph.ts";

async function setupMember(
  root: string,
  relPath: string,
  pkg: Record<string, unknown>,
): Promise<MemberManifest> {
  const abs = join(root, relPath);
  await mkdir(abs, { recursive: true });
  await Bun.write(join(abs, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  return {
    name: (pkg.shortName as string) ?? (pkg.name as string),
    path: abs,
    packageName: pkg.name as string,
  };
}

describe("maxBump", () => {
  test("returns the more-severe of two bump levels", () => {
    expect(maxBump("patch", "patch")).toBe("patch");
    expect(maxBump("patch", "minor")).toBe("minor");
    expect(maxBump("minor", "patch")).toBe("minor");
    expect(maxBump("minor", "major")).toBe("major");
    expect(maxBump("major", "patch")).toBe("major");
  });
});

describe("buildDependentsGraph", () => {
  test("creates reverse edges for workspace dependencies", () =>
    withTempDir(async (dir) => {
      const core = await setupMember(dir, "packages/core", {
        name: "@scope/core",
        shortName: "core",
      });
      const consumer = await setupMember(dir, "packages/consumer", {
        name: "@scope/consumer",
        shortName: "consumer",
        dependencies: { "@scope/core": "workspace:*" },
      });

      const graph = await buildDependentsGraph([core, consumer]);
      expect(Array.from(graph.get("core") ?? [])).toEqual(["consumer"]);
      expect(Array.from(graph.get("consumer") ?? [])).toEqual([]);
    }));

  test("ignores dependencies on non-member packages", () =>
    withTempDir(async (dir) => {
      const lib = await setupMember(dir, "packages/lib", {
        name: "@scope/lib",
        shortName: "lib",
        dependencies: { "external-pkg": "1.0.0" },
      });
      const graph = await buildDependentsGraph([lib]);
      expect(Array.from(graph.get("lib") ?? [])).toEqual([]);
    }));

  test("does not add a self-edge when a member declares itself", () =>
    withTempDir(async (dir) => {
      const lib = await setupMember(dir, "packages/lib", {
        name: "@scope/lib",
        shortName: "lib",
        dependencies: { "@scope/lib": "workspace:*" },
      });
      const graph = await buildDependentsGraph([lib]);
      expect(Array.from(graph.get("lib") ?? [])).toEqual([]);
    }));

  test("aggregates dependencies, devDependencies, and peerDependencies", () =>
    withTempDir(async (dir) => {
      const core = await setupMember(dir, "packages/core", {
        name: "@scope/core",
        shortName: "core",
      });
      const consumer = await setupMember(dir, "packages/consumer", {
        name: "@scope/consumer",
        shortName: "consumer",
        devDependencies: { "@scope/core": "workspace:*" },
      });

      const graph = await buildDependentsGraph([core, consumer]);
      expect(Array.from(graph.get("core") ?? [])).toEqual(["consumer"]);
    }));
});

describe("propagateBumps", () => {
  test("propagates patch bumps to transitive dependents", () => {
    const graph = new Map<string, Set<string>>([
      ["core", new Set(["mid"])],
      ["mid", new Set(["leaf"])],
      ["leaf", new Set()],
    ]);
    const natural = new Map([["core", "minor" as const]]);
    const result = propagateBumps(graph, natural);
    expect(result.get("core")).toBe("minor");
    expect(result.get("mid")).toBe("patch");
    expect(result.get("leaf")).toBe("patch");
  });

  test("never lowers a stronger natural bump", () => {
    const graph = new Map<string, Set<string>>([
      ["core", new Set(["leaf"])],
      ["leaf", new Set()],
    ]);
    const natural = new Map([
      ["core", "patch" as const],
      ["leaf", "major" as const],
    ]);
    const result = propagateBumps(graph, natural);
    expect(result.get("leaf")).toBe("major");
  });

  test("does not bump unrelated members", () => {
    const graph = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set()],
      ["c", new Set()],
    ]);
    const natural = new Map([["a", "patch" as const]]);
    const result = propagateBumps(graph, natural);
    expect(result.has("c")).toBe(false);
  });

  test("returns a new map without mutating the input", () => {
    const graph = new Map<string, Set<string>>([["a", new Set(["b"])], ["b", new Set()]]);
    const natural = new Map([["a", "patch" as const]]);
    const result = propagateBumps(graph, natural);
    expect(result).not.toBe(natural);
    expect(natural.has("b")).toBe(false);
  });
});
