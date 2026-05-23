/**
 * Read the `release` config object from a parsed `package.json`.
 *
 * `release` is the single source of truth for `release-action` per-repo config:
 *
 * - `type` — picks publish targets, version source, and the major-version tag.
 * - `slack` — optional Slack channel for the post-publish notification.
 *
 * Detection is fail-closed for `type`: a missing field or an unrecognized
 * value throws an `Error` referencing the spec doc.
 *
 * @see ../../../../docs/release-field.md
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

const DOCS_LINK = "docs/release-field.md";

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
 *   field, lists allowed values, and points to `docs/release-field.md`.
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
