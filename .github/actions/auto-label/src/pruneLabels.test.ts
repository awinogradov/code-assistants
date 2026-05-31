import { describe, expect, it } from "bun:test";

import type { PackageJson } from "./enumerateWorkspaces.ts";
import type { GitHubApi } from "./githubApi.ts";
import { pruneLabels } from "./pruneLabels.ts";

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

describe("pruneLabels", () => {
  it("deletes orphan <prefix>/* labels and keeps live + foreign ones", async () => {
    const pkgByPath: Record<string, PackageJson> = {
      "": { name: "@code-assistants", workspaces: ["packages/*"] },
      "packages/actions-core": { name: "@code-assistants/actions-core" },
    };
    const deleted: string[] = [];
    const api = buildApi({
      readPackageJson: async (dir) => pkgByPath[dir] ?? null,
      listSubdirs: async (parent) => (parent === "packages" ? ["actions-core"] : []),
      listRepoLabels: async () => [
        "code-assistants/actions-core",
        "code-assistants/removed-member",
        "needs-review",
      ],
      deleteLabel: async (name) => {
        deleted.push(name);
      },
    });

    const result = await pruneLabels(api, { ref: "sha", prefix: "code-assistants/" });

    expect(result.deleted).toEqual(["code-assistants/removed-member"]);
    expect(deleted).toEqual(["code-assistants/removed-member"]);
  });
});
