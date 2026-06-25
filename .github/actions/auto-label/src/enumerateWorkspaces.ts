/**
 * Pure helpers that turn a repo's `package.json` `workspaces` field into the set
 * of labelable members. The logic is deliberately I/O-free: callers inject how to
 * read a `package.json` and how to list a directory's children, so the PR path
 * (GitHub Contents API at base/head) and the prune path (working tree) reuse the
 * same code and unit tests need no network or filesystem.
 *
 * @example
 *   const prefix = deriveLabelPrefix(rootPkg.name); // "@code-assistants" -> "code-assistants/"
 *   const members = enumerateMembers(rootPkg, prefix, readPackageJson, listSubdirs);
 *   // [{ dir: ".github/actions/files-sync", name: "@code-assistants/files-sync-action",
 *   //    label: "code-assistants/files-sync-action" }, ...]
 *
 * @see ./labelPr.ts and ./pruneLabels.ts — the two callers.
 */

import { z } from "zod";

/** A workspace member resolved to exactly what the labeler needs. */
export interface WorkspaceMember {
  /** Repo-relative directory of the member (e.g. `.github/actions/files-sync`). */
  dir: string;
  /** The member's `package.json` `name` (e.g. `@code-assistants/files-sync-action`). */
  name: string;
  /** The label applied for this member (e.g. `code-assistants/files-sync-action`). */
  label: string;
}

/** The slice of a `package.json` this module reads. */
export interface PackageJson {
  name?: string;
  workspaces?: string[];
}

/** The slice of a `pnpm-workspace.yaml` this module reads. */
const pnpmWorkspaceSchema = z.object({ packages: z.array(z.string()).optional() });

/**
 * Parses the `packages:` workspace globs from a `pnpm-workspace.yaml`. pnpm repos
 * declare members here rather than in `package.json` `workspaces`, so this is the
 * fallback source for {@link collectMembers}. A missing or non-list `packages` field
 * yields `[]` (no members), keeping a partial config a no-op rather than a crash; a
 * syntactically invalid YAML file still throws from `Bun.YAML.parse`, surfacing the
 * misconfiguration loudly.
 */
export function parsePnpmPackages(raw: string): string[] {
  const parsed = pnpmWorkspaceSchema.safeParse(Bun.YAML.parse(raw));
  return parsed.success ? (parsed.data.packages ?? []) : [];
}

/** Conservative charset for a derived label — guards against injection from a hostile member name. */
const labelPattern = /^[a-z0-9._/-]+$/i;
const maxLabelLength = 50;

/**
 * Expands a `workspaces` array into concrete member directories.
 *
 * Handles BOTH forms this repo uses: `<parent>/*` globs (expanded one level via
 * `listSubdirs`) and literal paths (kept verbatim). The literal branch is the fix
 * for the upstream bug, which skipped every non-`<parent>/*` entry.
 */
export function resolveWorkspaceDirs(
  patterns: string[],
  listSubdirs: (parent: string) => string[],
): string[] {
  const dirs: string[] = [];
  for (const raw of patterns) {
    const pattern = raw.replace(/\/+$/, "");
    if (!pattern.endsWith("/*")) {
      dirs.push(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    for (const child of listSubdirs(parent)) {
      dirs.push(`${parent}/${child}`);
    }
  }
  return dirs;
}

/**
 * Derives the label prefix from the root package name's npm scope so the action
 * is drop-in for any repo (`@code-assistants` → `code-assistants/`, `@acme/x` →
 * `acme/`). Throws when no scope exists, so a misconfigured consumer fails loudly
 * instead of creating `/<member>` or `undefined/<member>` labels.
 */
export function deriveLabelPrefix(rootName: string | undefined): string {
  const scope = rootName?.startsWith("@") ? rootName.slice(1).split("/")[0] : "";
  if (!scope) {
    throw new Error(
      `Cannot derive a label prefix: root package.json "name" (${rootName ?? "missing"}) has no @scope. Set the "label-prefix" input explicitly.`,
    );
  }
  return `${scope}/`;
}

/**
 * Returns a member's label segment: a scoped name drops its scope
 * (`@code-assistants/files-sync-action` → `files-sync-action`); an unscoped name
 * is kept as-is (`autopilot` → `autopilot`).
 */
export function memberSegment(name: string): string {
  return name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
}

/**
 * Builds and validates the label for a member. A hostile `package.json` `name`
 * in a fork PR must not yield arbitrary or oversized labels, so anything outside
 * a conservative charset/length throws.
 */
export function buildLabel(prefix: string, name: string): string {
  const label = `${prefix}${memberSegment(name)}`;
  if (label.length > maxLabelLength || !labelPattern.test(label)) {
    throw new Error(`Refusing to use unsafe label derived from package name "${name}": "${label}"`);
  }
  return label;
}

/**
 * Resolves every workspace member to `{ dir, name, label }`. Directories with no
 * readable `package.json` `name` are skipped — a `<parent>/*` glob can match
 * non-package directories, and a member may not exist at a given git ref. Callers
 * match changed files by `dir` and reconcile labels by `label` from this single
 * struct so the two can never drift apart.
 */
export function enumerateMembers(
  rootPkg: PackageJson,
  prefix: string,
  readPackageJson: (dir: string) => PackageJson | null,
  listSubdirs: (parent: string) => string[],
): WorkspaceMember[] {
  const members: WorkspaceMember[] = [];
  for (const dir of resolveWorkspaceDirs(rootPkg.workspaces ?? [], listSubdirs)) {
    const pkg = readPackageJson(dir);
    if (!pkg?.name) {
      continue;
    }
    members.push({ dir, name: pkg.name, label: buildLabel(prefix, pkg.name) });
  }
  return members;
}
