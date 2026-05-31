import { describe, expect, it } from "bun:test";

import {
  buildLabel,
  deriveLabelPrefix,
  enumerateMembers,
  memberSegment,
  resolveWorkspaceDirs,
  type PackageJson,
} from "./enumerateWorkspaces.ts";

describe("resolveWorkspaceDirs", () => {
  it("keeps literal paths verbatim (the upstream-bug fix)", () => {
    expect(resolveWorkspaceDirs([".github/actions/files-sync"], () => [])).toEqual([
      ".github/actions/files-sync",
    ]);
  });

  it("expands <parent>/* globs one level", () => {
    const dirs = resolveWorkspaceDirs(["packages/*"], (parent) =>
      parent === "packages" ? ["actions-core", "other"] : [],
    );
    expect(dirs).toEqual(["packages/actions-core", "packages/other"]);
  });

  it("mixes literal paths and globs and trims trailing slashes", () => {
    const dirs = resolveWorkspaceDirs([".github/actions/files-sync", "packages/*/"], () => [
      "actions-core",
    ]);
    expect(dirs).toEqual([".github/actions/files-sync", "packages/actions-core"]);
  });
});

describe("deriveLabelPrefix", () => {
  it("derives the prefix from the root name scope", () => {
    expect(deriveLabelPrefix("@code-assistants")).toBe("code-assistants/");
    expect(deriveLabelPrefix("@acme/monorepo")).toBe("acme/");
  });

  it("throws when the root name has no scope", () => {
    expect(() => deriveLabelPrefix("autopilot")).toThrow(/no @scope/);
    expect(() => deriveLabelPrefix(undefined)).toThrow(/no @scope/);
  });
});

describe("memberSegment", () => {
  it("drops the scope from a scoped name", () => {
    expect(memberSegment("@code-assistants/files-sync-action")).toBe("files-sync-action");
  });

  it("keeps an unscoped name as-is", () => {
    expect(memberSegment("autopilot")).toBe("autopilot");
  });
});

describe("buildLabel", () => {
  it("joins prefix and segment for scoped and unscoped members", () => {
    expect(buildLabel("code-assistants/", "@code-assistants/files-sync-action")).toBe(
      "code-assistants/files-sync-action",
    );
    expect(buildLabel("code-assistants/", "autopilot")).toBe("code-assistants/autopilot");
  });

  it("rejects oversized or malformed label names (injection guard)", () => {
    expect(() => buildLabel("code-assistants/", `@x/${"a".repeat(60)}`)).toThrow(/unsafe label/);
    expect(() => buildLabel("code-assistants/", "@x/bad name!")).toThrow(/unsafe label/);
  });
});

describe("enumerateMembers", () => {
  const rootPkg: PackageJson = {
    name: "@code-assistants",
    workspaces: [".github/actions/files-sync", "claude-plugins/*", "packages/*"],
  };
  const pkgByDir: Record<string, PackageJson> = {
    ".github/actions/files-sync": { name: "@code-assistants/files-sync-action" },
    "claude-plugins/autopilot": { name: "autopilot" },
    "packages/actions-core": { name: "@code-assistants/actions-core" },
  };
  const listSubdirs = (parent: string): string[] => {
    if (parent === "claude-plugins") return ["autopilot"];
    if (parent === "packages") return ["actions-core"];
    return [];
  };
  const readPackageJson = (dir: string): PackageJson | null => pkgByDir[dir] ?? null;

  it("resolves literal + glob members to {dir,name,label}, unscoped member included", () => {
    expect(enumerateMembers(rootPkg, "code-assistants/", readPackageJson, listSubdirs)).toEqual([
      {
        dir: ".github/actions/files-sync",
        name: "@code-assistants/files-sync-action",
        label: "code-assistants/files-sync-action",
      },
      { dir: "claude-plugins/autopilot", name: "autopilot", label: "code-assistants/autopilot" },
      {
        dir: "packages/actions-core",
        name: "@code-assistants/actions-core",
        label: "code-assistants/actions-core",
      },
    ]);
  });

  it("skips directories without a package.json name", () => {
    const members = enumerateMembers(
      { name: "@code-assistants", workspaces: ["packages/*"] },
      "code-assistants/",
      () => null,
      () => ["empty-dir"],
    );
    expect(members).toEqual([]);
  });
});
