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

import { discoverMembers, type Member } from "./discoverMembers.ts";
import { memberMajorTag, memberVersionTag } from "./memberTags.ts";

/** Shape of the GitHub `pull_request` event payload we depend on. */
interface PullRequestEvent {
  pull_request?: {
    merged?: boolean;
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
 * Read a list of changed file paths.
 *
 * The action expects a list of files modified by the merged PR. In CI we read
 * the PR's files via `gh pr view <N> --json files`, but the publish entry can
 * also be invoked with `changedFiles` directly (used by the test suite and the
 * `--dry-run` smoke flow).
 */
export async function readChangedFiles(options: ResolveMemberOptions): Promise<string[]> {
  if (options.changedFiles) return [...options.changedFiles];

  const eventPath = options.eventPath ?? process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return [];

  const raw = await readFile(eventPath, "utf8");
  const event = JSON.parse(raw) as PullRequestEvent;
  if (!event.pull_request?.merged) return [];

  // The pull_request payload does not carry the file list — the caller must
  // hand us one via `changedFiles`. We return [] here so callers can fall back
  // to `gh pr view <N> --json files` if needed.
  return [];
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
