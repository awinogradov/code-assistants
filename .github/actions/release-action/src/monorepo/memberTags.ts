/**
 * Per-member git-tag helpers.
 *
 * Tags follow the `<name>@v<version>` shape (e.g. `release-action@v1.2.0`) and
 * the floating major tag uses `<name>@v<MAJOR>` (e.g. `release-action@v1`). The
 * `<name>` segment is the unscoped, suffix-preserving member name produced by
 * {@link deriveMemberName}. The trailing `v` in the version segment mirrors the
 * single-artifact convention (`v1.2.0`) so consumers can still pin against a
 * familiar form.
 *
 * @example
 * ```typescript
 * memberTagPrefix("release-action");        // "release-action@v"
 * memberTagPattern("release-action");       // "release-action@v*"
 * parseMemberTag("release-action", "release-action@v1.2.0");
 * // → "1.2.0"
 * ```
 */
import semver from "semver";

import { getLatestReachableTag, listTags } from "../gitTags.ts";

/** Tag prefix string used by `conventional-recommended-bump` and `conventional-changelog`. */
export function memberTagPrefix(name: string): string {
  return `${name}@v`;
}

/** Tag pattern used by `git tag -l <pattern>` to enumerate a member's tags. */
export function memberTagPattern(name: string): string {
  return `${name}@v*`;
}

/**
 * Build a per-member version tag (e.g. `release-action@v1.2.0`).
 */
export function memberVersionTag(name: string, version: string): string {
  return `${memberTagPrefix(name)}${version}`;
}

/**
 * Build a per-member floating major tag (e.g. `release-action@v1`).
 */
export function memberMajorTag(name: string, version: string): string {
  const parsed = semver.parse(version);
  if (!parsed) {
    throw new Error(`Invalid semver version for floating major tag: ${version}`);
  }
  return `${memberTagPrefix(name)}${parsed.major}`;
}

/**
 * Extract the semver version from a per-member tag, or `null` when the tag
 * does not belong to the given member.
 */
export function parseMemberTag(name: string, tag: string): string | null {
  const prefix = memberTagPrefix(name);
  if (!tag.startsWith(prefix)) return null;
  const rest = tag.slice(prefix.length);
  return semver.valid(rest);
}

/**
 * Find the latest released version for a member by scanning `<name>@v*` tags.
 * Returns `null` when the member has no prior releases.
 */
export async function getLatestMemberVersion(name: string, cwd: string): Promise<string | null> {
  const tags = await listTags(memberTagPattern(name), cwd);
  for (const tag of tags) {
    const version = parseMemberTag(name, tag);
    if (version) return version;
  }
  return null;
}

/**
 * Find the latest tag reachable from HEAD by commit topology for a given member.
 * Returns `null` when no matching tag exists in the member's history.
 *
 * @param ref - Git ref to search from (default: "HEAD").
 */
export async function getLatestMemberTagReachable(
  name: string,
  cwd: string,
  ref = "HEAD",
): Promise<string | null> {
  return getLatestReachableTag(memberTagPattern(name), cwd, ref);
}
