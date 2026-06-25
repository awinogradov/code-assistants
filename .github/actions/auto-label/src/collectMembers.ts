/**
 * Async orchestration that fetches a repo's workspace members at a git ref via the
 * injected {@link GitHubApi} and turns them into labelable members using the pure
 * helpers in `./enumerateWorkspaces.ts`. Directory listings and member
 * `package.json` files are pre-fetched, then the pure (sync) `enumerateMembers`
 * runs — so the transform stays unit-tested without mocks and the network work
 * runs concurrently.
 */
import {
  enumerateMembers,
  resolveWorkspaceDirs,
  type PackageJson,
  type WorkspaceMember,
} from "./enumerateWorkspaces.ts";
import type { GitHubApi } from "./githubApi.ts";

function globParents(workspaces: string[]): string[] {
  const parents: string[] = [];
  for (const raw of workspaces) {
    const pattern = raw.replace(/\/+$/, "");
    if (pattern.endsWith("/*")) {
      parents.push(pattern.slice(0, -2));
    }
  }
  return parents;
}

/** Resolves `{ dir, name, label }` for every workspace member present at `ref`. */
export async function collectMembers(
  api: GitHubApi,
  ref: string,
  prefix: string,
): Promise<WorkspaceMember[]> {
  const rootPkg = (await api.readPackageJson("", ref)) ?? {};
  const workspaces = rootPkg.workspaces?.length
    ? rootPkg.workspaces
    : ((await api.readPnpmWorkspaces(ref)) ?? []);

  const subdirEntries = await Promise.all(
    globParents(workspaces).map(
      async (parent) => [parent, await api.listSubdirs(parent, ref)] as const,
    ),
  );
  const subdirs = new Map<string, string[]>(subdirEntries);
  const listSubdirs = (parent: string): string[] => subdirs.get(parent) ?? [];

  const dirs = resolveWorkspaceDirs(workspaces, listSubdirs);
  const pkgEntries = await Promise.all(
    dirs.map(async (dir) => [dir, await api.readPackageJson(dir, ref)] as const),
  );
  const pkgs = new Map<string, PackageJson | null>(pkgEntries);
  const readPackageJson = (dir: string): PackageJson | null => pkgs.get(dir) ?? null;

  return enumerateMembers({ ...rootPkg, workspaces }, prefix, readPackageJson, listSubdirs);
}
