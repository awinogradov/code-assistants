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

  it("returns no members when the root manifest is absent at the ref", async () => {
    const api = buildApi({ readPackageJson: async () => null });
    expect(await collectMembers(api, "missing", "code-assistants/")).toEqual([]);
  });
});
