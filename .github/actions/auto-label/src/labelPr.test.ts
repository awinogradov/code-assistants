import { describe, expect, it } from "bun:test";

import type { PackageJson } from "./enumerateWorkspaces.ts";
import type { ChangedFile, GitHubApi } from "./githubApi.ts";
import { labelPr } from "./labelPr.ts";

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

const rootPkg: PackageJson = {
  name: "@code-assistants",
  workspaces: [".github/actions/files-sync", "packages/*"],
};
const pkgByPath: Record<string, PackageJson> = {
  "": rootPkg,
  ".github/actions/files-sync": { name: "@code-assistants/files-sync-action" },
  "packages/actions-core": { name: "@code-assistants/actions-core" },
};
const readPackageJson = async (dir: string): Promise<PackageJson | null> => pkgByPath[dir] ?? null;
const listSubdirs = async (parent: string): Promise<string[]> =>
  parent === "packages" ? ["actions-core"] : [];

const baseInput = {
  prNumber: 7,
  baseSha: "base",
  headSha: "head",
  prefix: "code-assistants/",
  labelColor: "5319e7",
  labelDescriptionTemplate: "Auto-applied: PR touches {label}",
};

describe("labelPr", () => {
  it("creates touched labels and reconciles (add new, remove stale, keep foreign)", async () => {
    const created: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const changed: ChangedFile[] = [
      { filename: ".github/actions/files-sync/src/main.ts", previousFilename: null },
    ];
    const api = buildApi({
      readPackageJson,
      listSubdirs,
      listChangedFiles: async () => changed,
      listPrLabels: async () => ["code-assistants/actions-core", "needs-review"],
      ensureLabel: async (spec) => {
        created.push(spec.name);
      },
      addLabels: async (_prNumber, names) => {
        added.push(...names);
      },
      removeLabel: async (_prNumber, name) => {
        removed.push(name);
      },
    });

    const result = await labelPr(api, baseInput);

    expect(result.touched).toEqual(["code-assistants/files-sync-action"]);
    expect(created).toEqual(["code-assistants/files-sync-action"]);
    expect(added).toEqual(["code-assistants/files-sync-action"]);
    // stale prefixed label is removed; the foreign "needs-review" label is left alone
    expect(removed).toEqual(["code-assistants/actions-core"]);
  });

  it("matches a renamed file's previous path to its source member", async () => {
    const added: string[] = [];
    const api = buildApi({
      readPackageJson,
      listSubdirs,
      listChangedFiles: async () => [
        { filename: "docs/moved.md", previousFilename: ".github/actions/files-sync/old.md" },
      ],
      listPrLabels: async () => [],
      ensureLabel: async () => {},
      addLabels: async (_prNumber, names) => {
        added.push(...names);
      },
      removeLabel: async () => {},
    });

    const result = await labelPr(api, baseInput);

    expect(result.touched).toEqual(["code-assistants/files-sync-action"]);
    expect(added).toEqual(["code-assistants/files-sync-action"]);
  });
});
