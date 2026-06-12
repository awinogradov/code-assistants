/**
 * Read the `release` config object from a parsed `package.json`.
 *
 * `release` is the single source of truth for `release-action` per-repo config:
 *
 * - `type` — picks publish targets, version source, and the major-version tag.
 * - `slack` — optional Slack channel for the post-publish notification.
 * - `automerge` — root-only opt-in for `release-automerge` (default `false`).
 *
 * Detection is fail-closed for `type`: a missing field or an unrecognized
 * value throws an `Error` referencing the spec doc.
 *
 * @see ../../../docs/06-release-field.md
 *
 * @example
 * ```typescript
 * import { readReleaseField } from "./releaseField.ts";
 *
 * const pkg = await Bun.file("package.json").json();
 * const { type, slack } = readReleaseField(pkg);
 * // type:  "github-action"
 * // slack: "#releases" | undefined
 * ```
 */

const DOCS_LINK = "docs/06-release-field.md";

/**
 * Recognized release types. Order mirrors the table in the release-action
 * README so the two stay in sync.
 */
export const releaseTypes = [
  "lib-nodejs",
  "lib-bun",
  "lib-python",
  "service-nodejs",
  "service-python",
  "github-action",
  "claude-plugin",
] as const;

/** A release type recognised by release-action. */
export type ReleaseType = (typeof releaseTypes)[number];

/** Parsed `release` config from `package.json`. */
export interface ReleaseConfig {
  type: ReleaseType;
  slack?: string;
}

/**
 * Root-level `release` config from the repository-root `package.json`.
 *
 * A monorepo root declares `members` to enumerate workspace paths to release;
 * a standalone repo declares `type` and behaves like a member. Both forms may
 * carry `slack`. `members` and `type` are mutually exclusive at the root —
 * mixing them is a configuration error.
 *
 * `automerge` is a repo-wide opt-in consumed only by `release-automerge`
 * (default `false`); it is independent of `members`/`type` and is never read
 * per member.
 */
export interface RootReleaseConfig {
  members?: readonly string[];
  type?: ReleaseType;
  slack?: string;
  automerge?: boolean;
}

function fail(message: string): never {
  throw new Error(`${message} See ${DOCS_LINK}.`);
}

function readReleaseObject(packageJson: unknown): Record<string, unknown> {
  if (typeof packageJson !== "object" || packageJson === null) {
    fail("Invalid package.json — expected an object.");
  }

  if (!("release" in packageJson)) {
    fail(
      `Missing 'release' field in package.json. Set a top-level "release" object with a "type" — allowed: ${releaseTypes.join(
        ", ",
      )}.`,
    );
  }

  const raw: unknown = (packageJson as Record<string, unknown>).release;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(
      `'release' in package.json must be an object with a "type" string. Got ${
        Array.isArray(raw) ? "array" : typeof raw
      }.`,
    );
  }

  return raw as Record<string, unknown>;
}

function readType(release: Record<string, unknown>): ReleaseType {
  const value: unknown = release.type;

  if (typeof value !== "string") {
    fail(
      `'release.type' in package.json must be a string; got ${typeof value}. Allowed: ${releaseTypes.join(
        ", ",
      )}.`,
    );
  }

  if (!(releaseTypes as readonly string[]).includes(value)) {
    fail(
      `Unrecognized 'release.type' value "${value}" in package.json. Allowed: ${releaseTypes.join(
        ", ",
      )}.`,
    );
  }

  return value as ReleaseType;
}

function readSlack(release: Record<string, unknown>): string | undefined {
  if (!("slack" in release)) {
    return undefined;
  }

  const value: unknown = release.slack;

  if (typeof value !== "string" || value.length === 0) {
    fail(
      "'release.slack' in package.json must be a non-empty string (e.g. \"#releases\") when present.",
    );
  }

  return value;
}

/**
 * Read and validate the top-level `release` object on a parsed `package.json`.
 *
 * Throws if the field is missing, not an object, or `release.type` is missing
 * or unrecognized. `release.slack` is optional but must be a non-empty
 * string when present.
 *
 * @param packageJson - Parsed `package.json` (treat the type as `unknown` —
 *   this function performs the runtime validation).
 * @returns The validated {@link ReleaseConfig}.
 * @throws {Error} when the field is missing or invalid. The message names the
 *   field, lists allowed values, and points to `docs/06-release-field.md`.
 *
 * @example
 * ```typescript
 * // Success
 * readReleaseField({
 *   name: "ingest",
 *   release: { type: "lib-nodejs", slack: "#releases" },
 * });
 * // → { type: "lib-nodejs", slack: "#releases" }
 *
 * // Failure — missing field
 * readReleaseField({ name: "ingest" });
 * // → throws: Missing 'release' field in package.json. …
 * ```
 */
export function readReleaseField(packageJson: unknown): ReleaseConfig {
  const release = readReleaseObject(packageJson);
  const type = readType(release);
  const slack = readSlack(release);

  return slack === undefined ? { type } : { type, slack };
}

function readMembers(release: Record<string, unknown>): readonly string[] | undefined {
  if (!("members" in release)) {
    return undefined;
  }

  const value: unknown = release.members;

  if (!Array.isArray(value)) {
    fail(
      `'release.members' in package.json must be an array of workspace paths; got ${typeof value}.`,
    );
  }

  if (value.length === 0) {
    fail(
      "'release.members' in package.json must contain at least one workspace path when present.",
    );
  }

  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      fail("'release.members' entries must be non-empty strings (workspace paths).");
    }
  }

  return value as readonly string[];
}

function readAutomerge(release: Record<string, unknown>): boolean | undefined {
  if (!("automerge" in release)) {
    return undefined;
  }

  const value: unknown = release.automerge;

  if (typeof value !== "boolean") {
    fail(
      `'release.automerge' in package.json must be a boolean (true to opt into release auto-merge); got ${typeof value}.`,
    );
  }

  return value;
}

/**
 * Read and validate the top-level `release` object on a parsed repository-root
 * `package.json`.
 *
 * Unlike {@link readReleaseField}, root config may declare `members` instead of
 * `type` to opt into monorepo mode. Returns an empty object shape when the
 * root has no `release` field — callers handle that case (e.g., fall back to
 * `workspaces` discovery).
 *
 * @throws when both `members` and `type` are declared (ambiguous root mode),
 *   when `members` is not a non-empty `string[]`, when `automerge` is present
 *   but not a boolean, or when `type`/`slack` are present but invalid (same
 *   rules as {@link readReleaseField}).
 *
 * @example
 * ```typescript
 * readRootRelease({ release: { members: ["packages/*"] } });
 * // → { members: ["packages/*"] }
 *
 * readRootRelease({ release: { type: "lib-nodejs", slack: "#releases" } });
 * // → { type: "lib-nodejs", slack: "#releases" }
 *
 * readRootRelease({ release: { automerge: true } });
 * // → { automerge: true }
 *
 * readRootRelease({ name: "monorepo" });
 * // → {}
 * ```
 */
export function readRootRelease(packageJson: unknown): RootReleaseConfig {
  if (typeof packageJson !== "object" || packageJson === null) {
    fail("Invalid package.json — expected an object.");
  }

  if (!("release" in packageJson)) {
    return {};
  }

  const raw: unknown = (packageJson as Record<string, unknown>).release;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(
      `'release' in package.json must be an object. Got ${
        Array.isArray(raw) ? "array" : typeof raw
      }.`,
    );
  }

  const release = raw as Record<string, unknown>;
  const members = readMembers(release);
  const hasType = "type" in release;

  if (members && hasType) {
    fail(
      "'release.members' and 'release.type' are mutually exclusive at the root — pick monorepo mode (members) or standalone mode (type).",
    );
  }

  const slack = readSlack(release);
  const automerge = readAutomerge(release);
  const config: RootReleaseConfig = {};

  if (members) {
    config.members = members;
  } else if (hasType) {
    config.type = readType(release);
  }

  if (slack !== undefined) {
    config.slack = slack;
  }

  if (automerge !== undefined) {
    config.automerge = automerge;
  }

  return config;
}
