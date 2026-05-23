/**
 * Monorepo `create` orchestrator: for each release-eligible workspace member,
 * compute the natural bump from path-scoped commits, propagate workspace
 * dependents, and emit per-member changelog / release-notes / MIGRATING /
 * version-file updates.
 *
 * This module wires together {@link discoverMembers}, {@link getLatestMemberVersion},
 * {@link memberHasChanges}, {@link bumpVersion}, {@link generateChangelog},
 * {@link buildDependentsGraph}, {@link propagateBumps}, {@link updateVersionFiles},
 * {@link refreshReleaseBadge}, {@link assemblePrBody}, and
 * {@link appendMigratingSection} into a single per-member flow.
 *
 * The orchestrator does NOT push commits or open PRs — that side-effecting
 * work lives in the consumer-side workflow shell so the same code can be
 * driven from a unit-test fixture.
 */
import { join } from "node:path";

import semver from "semver";

import { assemblePrBody } from "../assemble-pr-body.ts";
import {
  appendMigratingSection,
  readBreakingNotes,
} from "../migrations/migratingAppend.ts";
import {
  bumpVersion,
  changelogHeader,
  generateChangelog,
  startOfLastReleasePattern,
} from "../release.ts";
import { updateVersionFiles } from "../prepareRelease.ts";
import { refreshReleaseBadge } from "../updateReleaseBadge.ts";
import {
  buildDependentsGraph,
  propagateBumps,
  type BumpLevel,
  type MemberManifest,
} from "./dependentsGraph.ts";
import {
  discoverMembers,
  type DiscoveryResult,
  type Member,
} from "./discoverMembers.ts";
import {
  getLatestMemberTagReachable,
  getLatestMemberVersion,
  memberTagPrefix,
  memberVersionTag,
} from "./memberTags.ts";
import { memberHasChanges } from "./memberDiff.ts";

/** A computed release plan for one member. */
export interface MemberRelease {
  member: Member;
  previousVersion: string | null;
  newVersion: string;
  bumpLevel: BumpLevel;
  /** Whether this bump came from the member's own commits (vs. dependent propagation). */
  natural: boolean;
  /** Branch the per-member release PR uses. */
  branch: string;
  /** Tag the per-member release PR will publish (`<name>@v<version>`). */
  tag: string;
}

/** Result of {@link runCreate}: discovery context and computed per-member releases. */
export interface RunCreateResult {
  discovery: DiscoveryResult;
  releases: MemberRelease[];
}

export interface RunCreateOptions {
  /** Repository root (defaults to `process.cwd()`). */
  cwd?: string;
  /** Branch template for per-member release branches; `{member}` and `{version}` are substituted. */
  branchTemplate?: string;
  /**
   * Skip side effects (file writes, git tag reads stay since they're read-only).
   * Used by tests and the `--dry-run` CLI mode.
   */
  dryRun?: boolean;
}

/**
 * Compute and (unless `dryRun`) apply per-member release artifacts for the monorepo.
 *
 * Returns the {@link DiscoveryResult} alongside the computed releases. Standalone
 * repos are returned with `discovery.mode === "standalone"` and an empty
 * `releases` array — the caller should fall through to the standalone flow.
 */
export async function runCreate(
  options: RunCreateOptions = {},
): Promise<RunCreateResult> {
  const cwd = options.cwd ?? process.cwd();
  const branchTemplate = options.branchTemplate ?? "release-{member}-{version}";
  const dryRun = options.dryRun ?? false;

  const discovery = await discoverMembers(cwd);

  if (discovery.mode !== "monorepo") {
    return { discovery, releases: [] };
  }

  const manifests = await loadMemberManifests(discovery.members);
  const naturalBumps = new Map<string, BumpLevel>();
  const previousVersions = new Map<string, string | null>();

  for (const member of discovery.members) {
    const previous = await getLatestMemberVersion(member.name, cwd);
    previousVersions.set(member.name, previous);

    const since = await getLatestMemberTagReachable(member.name, cwd);
    if (!(await memberHasChanges({ cwd, path: member.relPath, since }))) {
      console.log(
        `Skipping ${member.name}: no commits touching ${member.relPath} since ${since ?? "init"}`,
      );
      continue;
    }

    const bump = await computeNaturalBump(member, cwd, previous ?? "0.0.0");
    if (bump) {
      naturalBumps.set(member.name, bump);
    }
  }

  const graph = await buildDependentsGraph(manifests);
  const finalBumps = propagateBumps(graph, naturalBumps);
  const releases: MemberRelease[] = [];

  for (const member of discovery.members) {
    const bump = finalBumps.get(member.name);
    if (!bump) continue;

    const previous = previousVersions.get(member.name) ?? null;
    const newVersion = nextVersion(previous, bump);
    const branch = renderBranch(branchTemplate, member.name, newVersion);
    const tag = memberVersionTag(member.name, newVersion);

    releases.push({
      member,
      previousVersion: previous,
      newVersion,
      bumpLevel: bump,
      natural: naturalBumps.has(member.name),
      branch,
      tag,
    });

    if (!dryRun) {
      await emitMemberArtifacts({
        member,
        previousVersion: previous,
        newVersion,
        bumpLevel: bump,
        natural: naturalBumps.has(member.name),
        cwd,
        branch,
      });
    }
  }

  return { discovery, releases };
}

async function loadMemberManifests(members: readonly Member[]): Promise<MemberManifest[]> {
  const out: MemberManifest[] = [];
  for (const member of members) {
    const pkg = (await Bun.file(join(member.path, "package.json")).json()) as
      | Record<string, unknown>
      | undefined;
    const packageName = pkg && typeof pkg.name === "string" ? pkg.name : member.name;
    out.push({ name: member.name, path: member.path, packageName });
  }
  return out;
}

async function computeNaturalBump(
  member: Member,
  repoCwd: string,
  currentVersion: string,
): Promise<BumpLevel | undefined> {
  const tagPrefix = memberTagPrefix(member.name);
  const result = await bumpVersion(currentVersion, repoCwd, {
    tagPrefix,
    path: member.relPath,
  });
  if (result.type !== "patch" && result.type !== "minor" && result.type !== "major") {
    return undefined;
  }
  return result.type;
}

function nextVersion(previous: string | null, bump: BumpLevel): string {
  const base = previous ?? "0.0.0";
  const next = semver.inc(base, bump);
  if (!next) {
    throw new Error(`Failed to compute next version from ${base} with bump ${bump}`);
  }
  return next;
}

function renderBranch(template: string, memberName: string, version: string): string {
  return template.replaceAll("{member}", memberName).replaceAll("{version}", version);
}

async function emitMemberArtifacts(input: {
  member: Member;
  previousVersion: string | null;
  newVersion: string;
  bumpLevel: BumpLevel;
  natural: boolean;
  cwd: string;
  branch: string;
}): Promise<void> {
  const { member, previousVersion, newVersion, bumpLevel, natural, cwd, branch } = input;
  const tagPrefix = memberTagPrefix(member.name);

  // Per-member changelog
  const log = await generateChangelog(newVersion, member.path, {
    tagPrefix,
    path: member.relPath,
  });

  // Per-member release notes (initial body — AI/Slack enrichment happens later
  // by the consumer side after `assemblePrBody`).
  await Bun.write(join(member.path, ".release_notes", `${newVersion}.md`), log.release, {
    createPath: true,
  });

  // Per-member CHANGELOG.md
  const changelogPath = join(member.path, "CHANGELOG.md");
  await Bun.write(
    changelogPath,
    `${changelogHeader}${log.release}${stripChangelogHeader(log.history)}`.replace(/\n+$/, "\n"),
  );

  // Per-member version-file write (package.json / pyproject.toml / plugin.json)
  await updateVersionFiles(newVersion, member.path);
  await Bun.write(join(member.path, "version"), newVersion);

  // Per-member README badge
  await refreshReleaseBadge(member.path);

  // Per-member MIGRATING.md on major bump
  if (bumpLevel === "major") {
    const breakingNotes = await readBreakingNotes({
      cwd,
      path: member.relPath,
      since: previousVersion ? `${tagPrefix}${previousVersion}` : null,
    });
    await appendMigratingSection({
      memberPath: member.path,
      previousVersion,
      newVersion,
      breakingNotes,
    });
  }

  // PR-body skeleton: same content as the changelog, plus a single-line note
  // for dependent-driven bumps so reviewers can see why the member is moving.
  const bodyPrefix = natural ? "" : "_Workspace dependent bump._\n\n";
  await Bun.write(join(member.path, ".release_bot", "body"), `${bodyPrefix}${log.release}`, {
    createPath: true,
  });

  await assemblePrBody({
    cwd: member.path,
    branchTemplate: branch.replaceAll(newVersion, "{version}"),
  });

  console.log(`Prepared ${member.name} ${previousVersion ?? "0.0.0"} → ${newVersion} (${bumpLevel})`);
}

function stripChangelogHeader(history: string): string {
  // The first occurrence of the conventional-changelog header is meaningful
  // only when there is no prior history; the orchestrator always prepends a
  // canonical `changelogHeader`, so any previously-stored header is dropped.
  return history.replace(startOfLastReleasePattern, (match) => match);
}
