/**
 * Workspace dependents graph and bump propagation.
 *
 * A member's release should bring along its workspace dependents — e.g. when
 * `@code-assistants/actions-core` ships a new version, every action that
 * imports it via `workspace:*` needs at least a patch bump so the new tag
 * doesn't ship with a stale dependency declaration.
 *
 * The graph is direction-flipped on purpose: edges go from a *dependency* to
 * its dependents, so {@link propagateBumps} can do a single BFS from each
 * naturally-bumped member outward.
 *
 * @example
 * ```typescript
 * const graph = buildDependentsGraph(members);
 * const final = propagateBumps(graph, naturalBumps);
 * // dependents that did not bump on their own pick up a `patch`.
 * ```
 */
import { join } from "node:path";

/** Subset of `package.json` we need to walk dependencies. */
export interface MemberManifest {
  /** Unscoped member name (matches `Member.name`). */
  name: string;
  /** Absolute path to the member directory. */
  path: string;
  /** Package name as it appears in `dependencies`/`devDependencies` of other members. */
  packageName: string;
}

/** Possible semver bump levels, in increasing severity. */
export type BumpLevel = "patch" | "minor" | "major";

const bumpRank: Record<BumpLevel, number> = { patch: 0, minor: 1, major: 2 };

/** Pick the more-severe of two bump levels. */
export function maxBump(a: BumpLevel, b: BumpLevel): BumpLevel {
  return bumpRank[a] >= bumpRank[b] ? a : b;
}

/**
 * Reverse adjacency: key = member name, value = set of member names that depend on it.
 * Only members present in `members` appear as nodes.
 */
export type DependentsGraph = Map<string, Set<string>>;

async function readManifest(memberPath: string): Promise<Record<string, unknown> | undefined> {
  const file = Bun.file(join(memberPath, "package.json"));
  if (!(await file.exists())) return undefined;
  const json = (await file.json()) as Record<string, unknown>;
  return json;
}

function collectDeclaredDeps(pkg: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const key of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const value = pkg[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const dep of Object.keys(value as Record<string, unknown>)) {
        out.add(dep);
      }
    }
  }
  return out;
}

/**
 * Build the reverse dependency graph from a set of workspace members.
 *
 * Reads each member's `package.json` and adds an edge from every dependency
 * (when that dependency is itself a known member) to the consuming member.
 *
 * @param members - Members to consider. Each must carry `name`, `path`, and
 *   `packageName` (the scoped name that appears in other members' deps).
 */
export async function buildDependentsGraph(
  members: readonly MemberManifest[],
): Promise<DependentsGraph> {
  const byPackageName = new Map<string, string>();
  for (const member of members) {
    byPackageName.set(member.packageName, member.name);
  }

  const graph: DependentsGraph = new Map();
  for (const member of members) {
    graph.set(member.name, new Set());
  }

  for (const consumer of members) {
    const pkg = await readManifest(consumer.path);
    if (!pkg) continue;
    const declared = collectDeclaredDeps(pkg);
    for (const dep of declared) {
      const depMemberName = byPackageName.get(dep);
      if (!depMemberName || depMemberName === consumer.name) continue;
      graph.get(depMemberName)!.add(consumer.name);
    }
  }

  return graph;
}

/**
 * Walk the dependents graph from each naturally-bumped member and force at
 * least `patch` on every transitive dependent that did not bump on its own.
 *
 * Members that already have a stronger bump from their own commits are left
 * untouched; the returned map represents the final per-member bump level
 * after propagation.
 *
 * @param graph - Reverse adjacency from {@link buildDependentsGraph}.
 * @param naturalBumps - Bumps determined from each member's own commit log.
 * @returns Final bump map keyed by member name. The returned map is a new
 *   object; the input is not mutated.
 */
export function propagateBumps(
  graph: DependentsGraph,
  naturalBumps: ReadonlyMap<string, BumpLevel>,
): Map<string, BumpLevel> {
  const final = new Map(naturalBumps);
  const queue: string[] = [...naturalBumps.keys()];
  const seen = new Set<string>(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = graph.get(current);
    if (!dependents) continue;
    for (const dependent of dependents) {
      const existing = final.get(dependent);
      if (existing) continue;
      final.set(dependent, "patch");
      if (!seen.has(dependent)) {
        seen.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return final;
}
