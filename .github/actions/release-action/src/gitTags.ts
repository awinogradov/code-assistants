/**
 * Shared utility for listing git tags sorted by version.
 *
 * @example
 * ```typescript
 * import { listTags } from "./gitTags.ts";
 *
 * const tags = await listTags("v*", process.cwd());
 * // → ["v2.0.0", "v1.1.0", "v1.0.0"]
 * ```
 */
import { $ } from "bun";

/**
 * List git tags matching a pattern, sorted newest-first by version.
 *
 * @param pattern - Glob pattern for tags (e.g. "v*")
 * @param cwd - Working directory for the git command
 * @returns Sorted tags (newest first), empty array if none found
 */
export async function listTags(pattern: string, cwd: string): Promise<string[]> {
  const result = await $`git tag -l ${pattern} --sort=-v:refname`.cwd(cwd).quiet().nothrow();
  return result.stdout.toString().trim().split("\n").filter(Boolean);
}

/**
 * Find the most recent tag reachable from a given ref by commit topology.
 *
 * Unlike {@link listTags} (which sorts globally by version number),
 * this walks the commit graph backwards from `ref` and returns the first
 * matching tag. This correctly handles repos where a higher semver tag
 * (e.g. v1.0.0) exists on an older commit than a lower semver tag (e.g. v0.16.1).
 *
 * @param pattern - Glob pattern for tags (e.g. "v*")
 * @param cwd - Working directory for the git command
 * @param ref - Git ref to search from (default: "HEAD")
 * @returns The closest matching tag, or null if none found
 */
export async function getLatestReachableTag(
  pattern: string,
  cwd: string,
  ref = "HEAD"
): Promise<string | null> {
  const result = await $`git describe --tags --abbrev=0 --match=${pattern} ${ref}`
    .cwd(cwd)
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout.toString().trim() || null;
}
