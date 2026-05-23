/**
 * Discover release-eligible workspace members from a repository root.
 *
 * Resolution order:
 * 1. Root `package.json` `release.members` (explicit allow-list).
 * 2. Otherwise expand root `package.json` `workspaces` globs.
 * 3. For each candidate path, read `<path>/package.json` and keep it only when
 *    it declares its own `release` object (members without a `release` field
 *    are internal-only and are skipped).
 *
 * When no eligible members are found and the root itself carries a `release.type`,
 * the caller should fall back to standalone mode — discovery returns an empty
 * array in that case; the {@link detectMode} helper signals the mode.
 *
 * @see ../../../../docs/release-field.md
 */
import { join, relative } from "node:path";

import { Glob } from "bun";

import { readReleaseField, readRootRelease, type ReleaseType } from "../releaseField.ts";

/** Workspace member eligible for an independent release. */
export interface Member {
  /** Unscoped package name used in tags and labels (e.g. `release-action`). */
  name: string;
  /** Absolute path to the member directory. */
  path: string;
  /** Path relative to the repository root (e.g. `.github/actions/release-action`). */
  relPath: string;
  /** Release type declared on the member's `package.json`. */
  releaseType: ReleaseType;
  /** Optional Slack channel declared on the member's `package.json`. */
  slack?: string;
}

/** Mode resolved from the repository root configuration. */
export type Mode = "monorepo" | "standalone" | "unknown";

/** Result of root-level discovery. */
export interface DiscoveryResult {
  mode: Mode;
  members: Member[];
  /** Set when standalone mode applies (root has a `release.type`). */
  rootReleaseType?: ReleaseType;
  /** Set when standalone mode applies and root declared a Slack channel. */
  rootSlack?: string;
}

/**
 * Strip an `@scope/` prefix and an optional `-action` suffix from a package name
 * to derive the tag/label-friendly member name. Returns the original name when
 * neither prefix nor suffix is present.
 *
 * @param packageName - The value of `package.json` `name` for the member.
 * @returns The unscoped, suffix-trimmed member name.
 *
 * @example
 * ```typescript
 * deriveMemberName("@code-assistants/release-action"); // "release-action"
 * deriveMemberName("autopilot");                       // "autopilot"
 * deriveMemberName("@scope/lib");                      // "lib"
 * ```
 */
export function deriveMemberName(packageName: string): string {
  const unscoped = packageName.startsWith("@")
    ? packageName.slice(packageName.indexOf("/") + 1)
    : packageName;
  return unscoped;
}

async function readJsonIfExists(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  return file.json();
}

async function expandWorkspaceGlobs(
  globs: readonly string[],
  cwd: string,
): Promise<string[]> {
  // Overlapping globs (e.g. `packages/*` plus `packages/lib-a`) can yield the
  // same member directory twice. Deduplicate by path so a member never gets
  // released more than once per run.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pattern of globs) {
    // Bun's `Glob` matches files; workspaces are directories, so look for a
    // `package.json` inside each candidate then strip it back.
    const glob = new Glob(`${pattern}/package.json`);
    for await (const match of glob.scan({ cwd, dot: true, absolute: false })) {
      if (match.includes("node_modules")) continue;
      const dir = match.slice(0, -"/package.json".length);
      if (seen.has(dir)) continue;
      seen.add(dir);
      out.push(dir);
    }
  }
  return out;
}

async function readWorkspaceList(rootPkg: unknown): Promise<readonly string[] | undefined> {
  if (typeof rootPkg !== "object" || rootPkg === null) return undefined;
  const value: unknown = (rootPkg as Record<string, unknown>).workspaces;
  if (!Array.isArray(value)) return undefined;
  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0) {
      entries.push(entry);
    }
  }
  return entries.length > 0 ? entries : undefined;
}

async function buildMember(memberPath: string, cwd: string): Promise<Member | undefined> {
  const absPath = join(cwd, memberPath);
  const pkg = await readJsonIfExists(join(absPath, "package.json"));
  if (!pkg || typeof pkg !== "object") return undefined;

  const pkgRecord = pkg as Record<string, unknown>;
  if (!("release" in pkgRecord)) return undefined;

  const config = readReleaseField(pkg);
  const rawName = typeof pkgRecord.name === "string" ? pkgRecord.name : undefined;
  if (!rawName) return undefined;

  const member: Member = {
    name: deriveMemberName(rawName),
    path: absPath,
    relPath: relative(cwd, absPath),
    releaseType: config.type,
  };
  if (config.slack !== undefined) {
    member.slack = config.slack;
  }
  return member;
}

/**
 * Discover release-eligible workspace members.
 *
 * @param cwd - Repository root absolute path. Defaults to `process.cwd()`.
 * @returns A {@link DiscoveryResult} describing the mode and the eligible
 *   members. When `mode` is `standalone`, callers should run the legacy
 *   single-artifact pipeline against `cwd`.
 *
 * @example
 * ```typescript
 * const result = await discoverMembers(process.cwd());
 * if (result.mode === "monorepo") {
 *   for (const member of result.members) {
 *     // release member
 *   }
 * }
 * ```
 */
export async function discoverMembers(cwd = process.cwd()): Promise<DiscoveryResult> {
  const rootPkg = await readJsonIfExists(join(cwd, "package.json"));
  if (!rootPkg) {
    return { mode: "unknown", members: [] };
  }

  const root = readRootRelease(rootPkg);
  const candidates = root.members ?? (await readWorkspaceList(rootPkg));

  if (!candidates) {
    if (root.type) {
      const result: DiscoveryResult = {
        mode: "standalone",
        members: [],
        rootReleaseType: root.type,
      };
      if (root.slack !== undefined) {
        result.rootSlack = root.slack;
      }
      return result;
    }
    return { mode: "unknown", members: [] };
  }

  const paths = root.members
    ? Array.from(candidates)
    : await expandWorkspaceGlobs(candidates, cwd);

  const members: Member[] = [];
  for (const memberPath of paths) {
    const member = await buildMember(memberPath, cwd);
    if (member) {
      members.push(member);
    }
  }

  if (members.length === 0 && root.type) {
    const result: DiscoveryResult = {
      mode: "standalone",
      members: [],
      rootReleaseType: root.type,
    };
    if (root.slack !== undefined) {
      result.rootSlack = root.slack;
    }
    return result;
  }

  return { mode: members.length > 0 ? "monorepo" : "unknown", members };
}
