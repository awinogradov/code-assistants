/**
 * Monorepo `publish` orchestrator: resolve the member that was released by a
 * merged PR (using `GITHUB_EVENT_PATH` file changes), then run the
 * appropriate per-type publish steps inside that member's directory.
 *
 * The orchestrator only computes the publish plan and exposes helpers — the
 * actual `npm publish`, `git tag`, and `gh release create` calls happen in
 * the consumer-side workflow shell. This keeps the orchestrator deterministic
 * and testable against fixture event payloads.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { $ } from "bun";

import { discoverMembers, type Member } from "./discoverMembers.ts";
import { memberMajorTag, memberVersionTag } from "./memberTags.ts";

/** Shape of the GitHub `pull_request` event payload we depend on. */
interface PullRequestEvent {
  pull_request?: {
    merged?: boolean;
    number?: number;
  };
  repository?: {
    full_name?: string;
  };
}

/** Per-member publish plan. */
export interface PublishPlan {
  member: Member;
  version: string;
  /** `<name>@v<version>` tag to create on the merge commit. */
  versionTag: string;
  /** `<name>@v<MAJOR>` floating tag, only set for `github-action` members. */
  majorTag?: string;
  /** Whether the member opts into NPM publish (`lib-nodejs` / `lib-bun`). */
  publishToNpm: boolean;
  /** Slack channel from the member's `release.slack`, if any. */
  slackChannel?: string;
}

export interface ResolveMemberOptions {
  /** Repository root (defaults to `process.cwd()`). */
  cwd?: string;
  /** Override list of changed file paths (typically supplied by tests). */
  changedFiles?: readonly string[];
  /** Override path to a GitHub event JSON file. */
  eventPath?: string;
}

/**
 * Read the list of file paths changed by the merged PR.
 *
 * Resolution order:
 * 1. Explicit `changedFiles` override (tests and the `--dry-run` smoke flow).
 * 2. `GITHUB_EVENT_PATH` — read the merged PR number, then call
 *    `gh pr view <N> --repo <owner/repo> --json files` to fetch the file list.
 *    The `pull_request` payload itself does not carry files, so the gh API
 *    call is required.
 *
 * Returns an empty array only when the event payload reports the PR is not
 * merged (publish must no-op in that case); any other failure throws so the
 * orchestrator never silently picks the wrong member.
 */
export async function readChangedFiles(options: ResolveMemberOptions): Promise<string[]> {
  if (options.changedFiles) return [...options.changedFiles];

  const eventPath = options.eventPath ?? process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error(
      "Cannot read changed files: GITHUB_EVENT_PATH is unset and no changedFiles override was provided.",
    );
  }

  const raw = await readFile(eventPath, "utf8");
  const event = JSON.parse(raw) as PullRequestEvent;
  if (!event.pull_request?.merged) return [];

  const prNumber = event.pull_request.number;
  const repo = event.repository?.full_name ?? process.env.GITHUB_REPOSITORY;
  if (!prNumber || !repo) {
    throw new Error("Cannot read changed files: event payload missing PR number or repository name.");
  }

  const result = await $`gh pr view ${prNumber} --repo ${repo} --json files --jq ${".files[].path"}`
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) {
    throw new Error(
      `gh pr view ${prNumber} failed: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`,
    );
  }
  return result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Resolve the unique member referenced by a release-notes file inside the
 * supplied changed file list.
 *
 * Looks for a path matching `<member-rel-path>/.release_notes/<version>.md`
 * and returns the corresponding {@link Member} and `version` string. Throws
 * when the changed list references multiple members (the workflow assumes
 * one PR per member) or no member at all.
 */
export async function resolvePublishPlan(
  options: ResolveMemberOptions,
): Promise<PublishPlan> {
  const cwd = options.cwd ?? process.cwd();
  const discovery = await discoverMembers(cwd);

  if (discovery.mode !== "monorepo") {
    throw new Error("resolvePublishPlan requires monorepo mode discovery");
  }

  const changedFiles = await readChangedFiles({ ...options, cwd });

  const matches = new Map<string, { member: Member; version: string }>();
  for (const file of changedFiles) {
    for (const member of discovery.members) {
      const prefix = `${member.relPath}/.release_notes/`;
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const versionMatch = rest.match(/^([^/]+?)\.md$/);
      if (!versionMatch) continue;
      const version = versionMatch[1] as string;
      const key = `${member.name}@${version}`;
      matches.set(key, { member, version });
    }
  }

  if (matches.size === 0) {
    throw new Error(
      "No release-notes file found in the PR changes — cannot determine which member to publish.",
    );
  }
  if (matches.size > 1) {
    const names = Array.from(matches.values()).map((m) => `${m.member.name}@${m.version}`);
    throw new Error(
      `Multiple members referenced by the PR (${names.join(", ")}). One PR per member is required.`,
    );
  }

  const [resolved] = matches.values();
  if (!resolved) {
    throw new Error("Unexpected empty match map after size check");
  }

  const { member, version } = resolved;
  const publishToNpm = member.releaseType === "lib-nodejs" || member.releaseType === "lib-bun";
  const plan: PublishPlan = {
    member,
    version,
    versionTag: memberVersionTag(member.name, version),
    publishToNpm,
  };
  if (member.releaseType === "github-action") {
    plan.majorTag = memberMajorTag(member.name, version);
  }
  if (member.slack !== undefined) {
    plan.slackChannel = member.slack;
  }
  return plan;
}

/** Convenience: read the version from `<member>/version` for sanity-checking. */
export async function readMemberVersion(member: Member): Promise<string | null> {
  const file = Bun.file(join(member.path, "version"));
  if (!(await file.exists())) return null;
  return (await file.text()).trim() || null;
}
