import { describe, expect, it } from "bun:test";

import { collectMembers } from "./collectMembers.ts";
import type { PackageJson } from "./enumerateWorkspaces.ts";
import type { GitHubApi } from "./githubApi.ts";

function buildApi(overrides: Partial<GitHubApi>): GitHubApi {
  const notImplemented = (): never => {
    throw new Error("not implemented");
  };
  return {
    readPackageJson: async () => null,
    readPnpmWorkspaces: async () => null,
    listSubdirs: async () => [],
    listChangedFiles: notImplemented,
    listPrLabels: notImplemented,
    listRepoLabels: notImplemented,
    ensureLabel: notImplemented,
    addLabels: notImplemented,
    removeLabel: notImplemented,
    deleteLabel: notImplemented,
    ...overrides,
  };
}

describe("collectMembers", () => {
  it("resolves literal + glob members at a ref via the API", async () => {
    const pkgByPath: Record<string, PackageJson> = {
      "": { name: "@code-assistants", workspaces: [".github/actions/files-sync", "packages/*"] },
      ".github/actions/files-sync": { name: "@code-assistants/files-sync-action" },
      "packages/actions-core": { name: "@code-assistants/actions-core" },
    };
    const api = buildApi({
      readPackageJson: async (dir) => pkgByPath[dir] ?? null,
      listSubdirs: async (parent) => (parent === "packages" ? ["actions-core"] : []),
    });

    expect(await collectMembers(api, "headsha", "code-assistants/")).toEqual([
      {
        dir: ".github/actions/files-sync",
        name: "@code-assistants/files-sync-action",
        label: "code-assistants/files-sync-action",
      },
      {
        dir: "packages/actions-core",
        name: "@code-assistants/actions-core",
        label: "code-assistants/actions-core",
      },
    ]);
  });

  it("falls back to pnpm-workspace.yaml when package.json has no workspaces", async () => {
    const pkgByPath: Record<string, PackageJson> = {
      "": { name: "@fortune-os" },
      "packages/nullable": { name: "@fortune-os/nullable" },
    };
    const api = buildApi({
      readPackageJson: async (dir) => pkgByPath[dir] ?? null,
      readPnpmWorkspaces: async () => ["packages/*"],
      listSubdirs: async (parent) => (parent === "packages" ? ["nullable"] : []),
    });

    expect(await collectMembers(api, "headsha", "fortune-os/")).toEqual([
      {
        dir: "packages/nullable",
        name: "@fortune-os/nullable",
        label: "fortune-os/nullable",
      },
    ]);
  });

  it("ignores pnpm-workspace.yaml when package.json workspaces are present", async () => {
    const pkgByPath: Record<string, PackageJson> = {
      "": { name: "@code-assistants", workspaces: ["packages/*"] },
      "packages/actions-core": { name: "@code-assistants/actions-core" },
    };
    let pnpmRead = false;
    const api = buildApi({
      readPackageJson: async (dir) => pkgByPath[dir] ?? null,
      readPnpmWorkspaces: async () => {
        pnpmRead = true;
        return ["apps/*"];
      },
      listSubdirs: async (parent) => (parent === "packages" ? ["actions-core"] : []),
    });

    const members = await collectMembers(api, "headsha", "code-assistants/");
    expect(members).toEqual([
      {
        dir: "packages/actions-core",
        name: "@code-assistants/actions-core",
        label: "code-assistants/actions-core",
      },
    ]);
    expect(pnpmRead).toBe(false);
  });

  it("returns no members when the root manifest is absent at the ref", async () => {
    const api = buildApi({ readPackageJson: async () => null });
    expect(await collectMembers(api, "missing", "code-assistants/")).toEqual([]);
  });
});
