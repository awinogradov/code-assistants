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
import type { TicketConfig, TicketSystemEntry } from "./tickets/tickets.types.ts";
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
  const pkgFile = Bun.file(join(cwd, "package.json"));
  if (await pkgFile.exists()) {
    const pkg = (await pkgFile.json()) as { version?: string };
    if (pkg.version) {
      return { version: pkg.version, source: "package-json" };
    }
  }

  // 3. First plugin.json found via glob
  const glob = new Glob("**/.claude-plugin/plugin.json");
  for await (const match of glob.scan({ cwd, dot: true, absolute: true })) {
    const plugin = (await Bun.file(match).json()) as { version?: string };
    if (plugin.version) {
      return { version: plugin.version, source: "plugin-json" };
    }
  }

  // 4. pyproject.toml
  const pyFile = Bun.file(join(cwd, "pyproject.toml"));
  if (await pyFile.exists()) {
    const content = await pyFile.text();
    const versionMatch = content.match(/^\[project\][\s\S]*?^version\s*=\s*["']([^"']+)["']/m);
    if (versionMatch?.[1]) {
      return { version: versionMatch[1], source: "pyproject-toml" };
    }
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

/**
 * Bump version based on conventional commits
 *
 * @param currentVersion - Current semver version
 * @param cwd - Working directory (default: process.cwd())
 */
export async function bumpVersion(
  currentVersion: string,
  cwd = process.cwd()
): Promise<BumpResult> {
  const bumper = new Bumper(cwd).loadPreset("conventionalcommits");
  const recommendation = await bumper.bump();

  if (!("releaseType" in recommendation)) {
    throw new Error("No commits found to determine release type");
  }

  const releaseType = recommendation.releaseType ?? "patch";
  const newVersion = semver.valid(releaseType) ?? semver.inc(currentVersion, releaseType);

  if (!newVersion) {
    throw new Error(`Failed to calculate new version from ${currentVersion} with ${releaseType}`);
  }

  return {
    summary: "reason" in recommendation ? (recommendation.reason ?? "") : "",
    type: releaseType,
    newVersion,
    newTag: `v${newVersion}`,
  };
}

/**
 * Generate changelog content from git history
 *
 * @param newVersion - Version to generate changelog for
 * @param cwd - Working directory (default: process.cwd())
 */
export async function generateChangelog(
  newVersion: string,
  cwd = process.cwd()
): Promise<ChangelogResult> {
  const changelogFile = join(cwd, "CHANGELOG.md");

  if (!(await Bun.file(changelogFile).exists())) {
    await Bun.write(changelogFile, "\n");
  }

  const historyContent = await Bun.file(changelogFile).text();
  const historyStart = historyContent.search(startOfLastReleasePattern);
  const history = historyStart !== -1 ? historyContent.substring(historyStart) : historyContent;

  const generator = new ConventionalChangelog(cwd)
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
    .tags({ prefix: "v" })
    .context({ version: newVersion });

  let release = "";
  for await (const chunk of generator.write()) {
    release += chunk;
  }

  return { header: changelogHeader, release, history };
}

/** Generate tickets section and save artifacts if configured */
async function processTickets(params: {
  ticketSystems?: TicketSystemEntry[];
  owner?: string;
  repo?: string;
  cwd: string;
  releaseBotDir: string;
}): Promise<string> {
  const { ticketSystems, owner, repo, cwd, releaseBotDir } = params;

  if (!ticketSystems || ticketSystems.length === 0 || !owner || !repo) {
    return "";
  }

  const ticketConfig: TicketConfig = { systems: ticketSystems, owner, repo };
  const env = loadTicketEnv();
  const result = await generateTicketsSection({
    config: ticketConfig,
    env,
    cwd,
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
      { createPath: true }
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
  const { cwd = process.cwd(), ticketSystems, owner, repo } = options;

  const { version: currentVersion, source: versionSource } = await getCurrentVersion(cwd);
  console.log(`Detected version ${currentVersion} from ${versionSource}`);
  const { newVersion, type: releaseType, summary: releaseSummary } = await bumpVersion(
    currentVersion,
    cwd
  );

  const log = await generateChangelog(newVersion, cwd);

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
    (log.header + releaseWithTickets + log.history).replace(/\n+$/, "\n")
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
function insertTicketsInRelease(release: string, tickets: string): string {
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
