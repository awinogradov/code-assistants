/**
 * Path-scoped git log helpers for monorepo member release computation.
 *
 * `git log <range> -- <path>` is the standard way to list commits that touched
 * a particular subdirectory. Members use this to determine whether they have
 * any changes worth releasing, and `conventional-recommended-bump` /
 * `conventional-changelog` consume the same range via their `path` filter.
 *
 * @example
 * ```typescript
 * const since = await getLatestMemberTagReachable("release-action", cwd);
 * const touched = await memberHasChanges("release-action", {
 *   cwd,
 *   path: ".github/actions/release-action",
 *   since,
 * });
 * if (!touched) {
 *   console.log("Nothing to release for release-action");
 * }
 * ```
 */
import { $ } from "bun";

/** Options describing the path-scoped range to inspect. */
export interface MemberDiffOptions {
  /** Repository root. */
  cwd: string;
  /** Path relative to the repo root that scopes the log. */
  path: string;
  /** Lower bound for the range (e.g. last release tag). `null` means since-root. */
  since: string | null;
}

/**
 * List commit subjects that touched a member's path since a given tag.
 *
 * @returns Array of commit subjects (one per line); empty when no commits match.
 */
export async function listMemberCommits(options: MemberDiffOptions): Promise<string[]> {
  const { cwd, path, since } = options;
  const range = since ? `${since}..HEAD` : "HEAD";
  const result = await $`git log ${range} --pretty=format:%s -- ${path}`.cwd(cwd).quiet().nothrow();
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(
      `git log failed for ${path} (range ${range}): ${stderr || `exit ${result.exitCode}`}`,
    );
  }
  return result.stdout.toString().trim().split("\n").filter(Boolean);
}

/** Cheap predicate: does the member have any commits in the path-scoped range? */
export async function memberHasChanges(options: MemberDiffOptions): Promise<boolean> {
  const commits = await listMemberCommits(options);
  return commits.length > 0;
}
