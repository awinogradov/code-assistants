/**
 * Release CLI
 *
 * Generates changelog via conventional commits, release notes for every version,
 * and meta info for release workflows. Supports ticket system integration.
 *
 * @example
 * ```bash
 * # Run directly
 * bun src/release.ts
 *
 * # With ticket integration
 * LINEAR_API_KEY=xxx bun src/release.ts --tickets=linear:TEAM,PROJ
 *
 * # Or via bin
 * ./bin/release
 * ```
 */
import { join } from "node:path";

import { Glob } from "bun";
import { Bumper } from "conventional-recommended-bump";
import { ConventionalChangelog } from "conventional-changelog";
import semver from "semver";

import { listTags } from "./gitTags.ts";
import type { CommitScope, TicketConfig, TicketSystemEntry } from "./tickets/tickets.types.ts";
import {
  autoDetectTicketSystems,
  generateTicketsSection,
  loadTicketEnv,
  parseTicketArgs,
  serializePrDescriptionsToYaml,
} from "./tickets/tickets.ts";

/** Sources from which version can be read, in priority order */
type VersionSource = "version-file" | "package-json" | "plugin-json" | "pyproject-toml";

/** Result of version detection including source for logging */
interface VersionResult {
  version: string;
  source: VersionSource;
}

/** Bump result containing version information */
export interface BumpResult {
  summary: string;
  type: string;
  newVersion: string;
  newTag: string;
}

/** Changelog result containing generated content */
export interface ChangelogResult {
  header: string;
  release: string;
  history: string;
}

/** Options for release workflow */
export interface ReleaseOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Ticket systems configuration */
  ticketSystems?: TicketSystemEntry[];
  /** GitHub repository owner (required for tickets) */
  owner?: string;
  /** GitHub repository name (required for tickets) */
  repo?: string;
  /**
   * Tag prefix used by `conventional-recommended-bump` and `conventional-changelog`
   * to match prior tags. Defaults to `"v"` (matches `v1.2.3`). In monorepo mode
   * pass `<name>@v` so per-member tags like `release-action@v1.2.0` are honoured.
   */
  tagPrefix?: string;
  /**
   * Path filter scoping the commit range. When set, only commits that touched
   * this path contribute to the bump and the changelog. Used in monorepo mode
   * to compute per-member releases.
   */
  path?: string;
}

/**
 * Conventional changelog section names used in the conventionalcommits preset.
 *
 * These map commit types to `### Section` headings in the generated changelog.
 * Also used by `slackNotify.ts` to detect where AI content ends.
 */
export const changelogSectionNames = [
  "Features",
  "Bug Fixes",
  "Performance",
  "Reverts",
  "Documentation",
  "Chores",
  "Refactoring",
  "Tests",
  "Build",
  "CI",
] as const;

/** Pattern to find the start of the last release in changelog */
export const startOfLastReleasePattern = /(^#+ \[?[0-9]+\.[0-9]+\.[0-9]+|<a name=)/m;

/** Changelog header with conventional commits link */
export const changelogHeader =
  "# Changelog\n\nAll notable changes to this project will be documented in this file. " +
  "See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit guidelines.\n\n";

/** Read `.version` from a directory's `package.json`, or `null` when absent. */
export async function readPackageJsonVersion(dir: string): Promise<string | null> {
  const file = Bun.file(join(dir, "package.json"));
  if (!(await file.exists())) return null;
  const pkg = (await file.json()) as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : null;
}

/**
 * Read the `version` from every `**\/.claude-plugin/plugin.json` under a
 * directory (`.claude-plugin` is a dot dir, hence `dot: true`), skipping
 * `node_modules` so a dependency's manifest is never picked up.
 */
export async function readPluginVersions(dir: string): Promise<string[]> {
  const versions: string[] = [];
  const glob = new Glob("**/.claude-plugin/plugin.json");
  for await (const match of glob.scan({ cwd: dir, dot: true, absolute: true })) {
    if (match.includes("node_modules")) continue;
    const plugin = (await Bun.file(match).json()) as { version?: unknown };
    if (typeof plugin.version === "string") versions.push(plugin.version);
  }
  return versions;
}

/**
 * Read the `version` from a directory's `pyproject.toml` `[project]` table, or
 * `null`. The lookup is bounded to the `[project]` section so a missing version
 * there cannot borrow a `version` key from a later table (e.g. `[tool.poetry]`).
 * Both quote styles are accepted.
 */
export async function readPyprojectVersion(dir: string): Promise<string | null> {
  const file = Bun.file(join(dir, "pyproject.toml"));
  if (!(await file.exists())) return null;
  const content = await file.text();
  const start = content.search(/^\[project\]/m);
  if (start === -1) return null;
  const rest = content.slice(start + "[project]".length);
  const nextSection = rest.search(/^\[/m);
  const section = nextSection === -1 ? rest : rest.slice(0, nextSection);
  const match = section.match(/^[ \t]*version\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

/**
 * Get current version using a fallback chain
 *
 * Priority order:
 * 1. `version` file at root (plain text semver)
 * 2. `package.json` → `.version` field
 * 3. First `plugin.json` found at `**\/.claude-plugin/plugin.json` → `.version`
 * 4. `pyproject.toml` → version in `[project]` section
 *
 * @param cwd - Working directory
 * @returns Version string and the source it was read from
 *
 * When no version source is found, checks git tags (`v*`) for an existing
 * semver version and falls back to `0.0.0`. Creates a `version` file
 * automatically so downstream steps can read it.
 */
export async function getCurrentVersion(cwd: string): Promise<VersionResult> {
  // 1. version file at root
  const versionFile = Bun.file(join(cwd, "version"));
  if (await versionFile.exists()) {
    const content = (await versionFile.text()).trim();
    if (content && semver.valid(content)) {
      return { version: content, source: "version-file" };
    }
  }

  // 2. package.json
  const pkgVersion = await readPackageJsonVersion(cwd);
  if (pkgVersion) {
    return { version: pkgVersion, source: "package-json" };
  }

  // 3. First plugin.json found via glob (skip node_modules to avoid picking
  // a dependency's plugin.json instead of one belonging to this repo)
  const [pluginVersion] = await readPluginVersions(cwd);
  if (pluginVersion) {
    return { version: pluginVersion, source: "plugin-json" };
  }

  // 4. pyproject.toml
  const pyVersion = await readPyprojectVersion(cwd);
  if (pyVersion) {
    return { version: pyVersion, source: "pyproject-toml" };
  }

  // No manifest found — derive version from git tags, default to 0.0.0
  const tags = await listTags("v*", cwd);
  let initialVersion = "0.0.0";
  for (const tag of tags) {
    const parsed = semver.valid(tag.replace(/^v/, ""));
    if (parsed) {
      initialVersion = parsed;
      break;
    }
  }

  await Bun.write(join(cwd, "version"), initialVersion);
  console.log(`::warning::No version source found. Created version file with ${initialVersion}`);
  return { version: initialVersion, source: "version-file" };
}

/** Optional scoping for {@link bumpVersion} when releasing one member of a monorepo. */
export interface BumpScope {
  /** Tag prefix passed to `Bumper.tag` (e.g. `release-action@v`). */
  tagPrefix?: string;
  /** Path filter passed to `Bumper.path` so only commits touching the path contribute. */
  path?: string;
}

/**
 * Bump version based on conventional commits
 *
 * @param currentVersion - Current semver version
 * @param cwd - Working directory (default: process.cwd())
 * @param scope - Optional tag prefix and/or path filter for monorepo members
 */
export async function bumpVersion(
  currentVersion: string,
  cwd = process.cwd(),
  scope: BumpScope = {},
): Promise<BumpResult> {
  let bumper = new Bumper(cwd).loadPreset("conventionalcommits");
  if (scope.tagPrefix) {
    bumper = bumper.tag({ prefix: scope.tagPrefix });
  }
  if (scope.path) {
    bumper = bumper.commits({ path: scope.path });
  }
  const recommendation = await bumper.bump();

  if (!("releaseType" in recommendation)) {
    throw new Error("No commits found to determine release type");
  }

  const releaseType = recommendation.releaseType ?? "patch";
  const newVersion = semver.valid(releaseType) ?? semver.inc(currentVersion, releaseType);

  if (!newVersion) {
    throw new Error(`Failed to calculate new version from ${currentVersion} with ${releaseType}`);
  }

  const tagPrefix = scope.tagPrefix ?? "v";
  return {
    summary: "reason" in recommendation ? (recommendation.reason ?? "") : "",
    type: releaseType,
    newVersion,
    newTag: `${tagPrefix}${newVersion}`,
  };
}

/** Optional scoping for {@link generateChangelog} when releasing one member of a monorepo. */
export interface ChangelogScope {
  /** Tag prefix passed to `ConventionalChangelog.tags` (e.g. `release-action@v`). */
  tagPrefix?: string;
  /** Path filter passed to `ConventionalChangelog.commits` so only matching commits appear. */
  path?: string;
}

/**
 * Generate changelog content from git history
 *
 * @param newVersion - Version to generate changelog for
 * @param cwd - Working directory (default: process.cwd())
 * @param scope - Optional tag prefix and/or path filter for monorepo members
 */
export async function generateChangelog(
  newVersion: string,
  cwd = process.cwd(),
  scope: ChangelogScope = {},
): Promise<ChangelogResult> {
  const changelogFile = join(cwd, "CHANGELOG.md");

  if (!(await Bun.file(changelogFile).exists())) {
    await Bun.write(changelogFile, "\n");
  }

  const historyContent = await Bun.file(changelogFile).text();
  const historyStart = historyContent.search(startOfLastReleasePattern);
  const history = historyStart !== -1 ? historyContent.substring(historyStart) : historyContent;

  let generator = new ConventionalChangelog(cwd)
    .readPackage()
    .loadPreset({
      name: "conventionalcommits",
      types: [
        { type: "feat", section: "Features" },
        { type: "fix", section: "Bug Fixes" },
        { type: "perf", section: "Performance" },
        { type: "revert", section: "Reverts" },
        { type: "docs", section: "Documentation", hidden: false },
        { type: "chore", section: "Chores", hidden: false },
        { type: "refactor", section: "Refactoring", hidden: false },
        { type: "test", section: "Tests", hidden: false },
        { type: "build", section: "Build", hidden: false },
        { type: "ci", section: "CI", hidden: false },
      ],
    })
    .tags({ prefix: scope.tagPrefix ?? "v" })
    .context({ version: newVersion });
  if (scope.path) {
    generator = generator.commits({ path: scope.path });
  }

  let release = "";
  for await (const chunk of generator.write()) {
    release += chunk;
  }

  return { header: changelogHeader, release, history };
}

/**
 * Generate tickets section and save artifacts if configured.
 *
 * Returns an empty string (no-op) when ticket systems or owner/repo are absent,
 * so callers can splice the result unconditionally. `scope` restricts the commit
 * range for monorepo per-member extraction; omit it for the standalone path.
 */
export async function processTickets(params: {
  ticketSystems?: TicketSystemEntry[];
  owner?: string;
  repo?: string;
  cwd: string;
  releaseBotDir: string;
  scope?: CommitScope;
}): Promise<string> {
  const { ticketSystems, owner, repo, cwd, releaseBotDir, scope } = params;

  if (!ticketSystems || ticketSystems.length === 0 || !owner || !repo) {
    return "";
  }

  const ticketConfig: TicketConfig = { systems: ticketSystems, owner, repo };
  const env = loadTicketEnv();
  const result = await generateTicketsSection({
    config: ticketConfig,
    env,
    cwd,
    scope,
  });

  if (result.tickets.length > 0) {
    await Bun.write(join(releaseBotDir, "tickets.json"), JSON.stringify(result.tickets, null, 2), {
      createPath: true,
    });
  }

  if (result.prDescriptions.length > 0) {
    await Bun.write(
      join(releaseBotDir, "pr_descriptions.yml"),
      serializePrDescriptionsToYaml(result.prDescriptions),
      { createPath: true },
    );
  }

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  return result.markdown;
}

/**
 * Main release workflow
 *
 * @param options - Release options
 */
export async function main(options: ReleaseOptions = {}): Promise<string> {
  const { cwd = process.cwd(), ticketSystems, owner, repo, tagPrefix, path } = options;
  const scope = { tagPrefix, path };

  const { version: currentVersion, source: versionSource } = await getCurrentVersion(cwd);
  console.log(`Detected version ${currentVersion} from ${versionSource}`);
  const {
    newVersion,
    type: releaseType,
    summary: releaseSummary,
  } = await bumpVersion(currentVersion, cwd, scope);

  const log = await generateChangelog(newVersion, cwd, scope);

  const releaseLines = log.release.split("\n").slice(1).join("\n").trim();
  if (!releaseLines) {
    throw new Error("There are no changes in the release. Do some commits before next one");
  }

  const releaseBotDir = join(cwd, ".release_bot");
  const ticketsMarkdown = await processTickets({
    ticketSystems,
    owner,
    repo,
    cwd,
    releaseBotDir,
  });

  const releaseNotesDir = join(cwd, ".release_notes");
  const releaseWithTickets = insertTicketsInRelease(log.release, ticketsMarkdown);

  // Strip version header from body since it's already in PR title
  const bodyContent = releaseWithTickets.replace(/^## (?:\[[^\]]+\]|\d+\.\d+\.\d+).*\n\n/, "");

  const breakingBadge = breakingChangesBadge(releaseSummary);
  const badgeLine = [releaseTypeBadge(releaseType), breakingBadge].filter(Boolean).join(" ");
  const summaryBody = [`${badgeLine}\n`, bodyContent].join("\n");

  // Write PR body
  await Bun.write(join(releaseBotDir, "body"), summaryBody, { createPath: true });

  // Release: write version file, changelog, and release notes
  const changelogFile = join(cwd, "CHANGELOG.md");
  await Bun.write(join(cwd, "version"), newVersion);
  await Bun.write(join(releaseNotesDir, `${newVersion}.md`), releaseWithTickets, {
    createPath: true,
  });
  await Bun.write(
    changelogFile,
    (log.header + releaseWithTickets + log.history).replace(/\n+$/, "\n"),
  );

  return newVersion;
}

/**
 * Generate a shields.io badge for the release type
 *
 * @param type - Semver release type (patch, minor, major)
 * @returns Markdown image string
 */
function releaseTypeBadge(type: string): string {
  const color = type === "major" ? "red" : "brightgreen";
  return `![release:${type}](https://img.shields.io/badge/release-${type}-${color})`;
}

/**
 * Generate a shields.io badge for breaking changes count
 *
 * Returns empty string when count is 0 or cannot be determined.
 *
 * @param summary - Bump reason string from conventional-recommended-bump
 * @returns Markdown image string or empty string
 */
function breakingChangesBadge(summary: string): string {
  const match = summary.match(/(\d+)\s+BREAKING CHANGES?/);
  const count = match?.[1] ? parseInt(match[1], 10) : 0;
  if (count === 0) return "";
  return `![breaking changes:${count}](https://img.shields.io/badge/breaking%20changes-${count}-red)`;
}

/**
 * Insert tickets markdown after the version header in release notes
 *
 * @param release - Original release notes
 * @param tickets - Tickets markdown section
 * @returns Release notes with tickets inserted
 */
export function insertTicketsInRelease(release: string, tickets: string): string {
  if (!tickets) {
    return release;
  }

  // Find version header (## [x.x.x]...) followed by blank line
  // Insert tickets immediately after, before any ### sections
  const headerMatch = release.match(/^(## [^\n]+\n\n)/);
  const header = headerMatch?.[1];
  if (header) {
    const rest = release.slice(header.length);
    return `${header}${tickets}\n${rest}`;
  }

  // No header found, prepend tickets
  return `${tickets}\n${release}`;
}

/**
 * Parse CLI arguments into ReleaseOptions
 *
 * Uses explicit --tickets args if provided, otherwise auto-detects
 * ticket systems from environment variables.
 */
async function parseCliArgs(): Promise<ReleaseOptions> {
  const args = process.argv.slice(2);
  const env = loadTicketEnv();

  // Use explicit args if provided, otherwise auto-detect from env
  const ticketSystems = parseTicketArgs(args) ?? autoDetectTicketSystems(env);

  let owner: string | undefined;
  let repo: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--owner=")) {
      owner = arg.slice("--owner=".length);
    } else if (arg.startsWith("--repo=")) {
      repo = arg.slice("--repo=".length);
    }
  }

  // Try to get owner/repo from git remote if not provided
  if ((!owner || !repo) && ticketSystems.length > 0) {
    const remoteInfo = await getGitRemoteInfo();
    owner = owner ?? remoteInfo.owner;
    repo = repo ?? remoteInfo.repo;
  }

  return {
    ticketSystems: ticketSystems.length > 0 ? ticketSystems : undefined,
    owner,
    repo,
  };
}

/**
 * Get owner/repo from git remote origin URL
 */
async function getGitRemoteInfo(): Promise<{ owner?: string; repo?: string }> {
  try {
    const proc = Bun.spawn(["git", "remote", "get-url", "origin"]);
    const url = await new Response(proc.stdout).text();
    const trimmedUrl = url.trim();

    // Parse GitHub URL formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const httpsMatch = trimmedUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    const sshMatch = trimmedUrl.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);

    const match = httpsMatch ?? sshMatch;
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch {
    // Ignore errors - return empty
  }
  return {};
}

// Only run when executed directly (not when imported for testing)
if (import.meta.main) {
  parseCliArgs()
    .then((options) => main(options))
    .then((version) => console.log(`Release ${version} prepared successfully`))
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}
