/**
 * Append a "From <prev> to <new>" section to a member's `MIGRATING.md` on a
 * major bump. The body is composed from `BREAKING CHANGE:` footers found in
 * the member-scoped commit range — when no breaking notes are present we
 * still write the heading skeleton so contributors have a place to fill in
 * the migration prose later.
 *
 * @example
 * ```typescript
 * await appendMigratingSection({
 *   memberPath: "/abs/.github/actions/release-action",
 *   previousVersion: "1.4.0",
 *   newVersion: "2.0.0",
 *   breakingNotes: ["release.type renamed to release.kind"],
 * });
 * ```
 */
import { join } from "node:path";

import { $ } from "bun";

/** Inputs describing a single major-bump migration section. */
export interface AppendMigratingOptions {
  /** Absolute path to the member directory. */
  memberPath: string;
  /** Previous version (`null` when the member has no prior release). */
  previousVersion: string | null;
  /** Newly-released version. */
  newVersion: string;
  /** Breaking-change notes (typically scraped from commit `BREAKING CHANGE:` footers). */
  breakingNotes: readonly string[];
}

/** Render the section body for a single major release. */
export function renderMigratingSection(options: AppendMigratingOptions): string {
  const { previousVersion, newVersion, breakingNotes } = options;
  const heading = previousVersion
    ? `## From ${previousVersion} to ${newVersion}`
    : `## ${newVersion}`;

  const lines: string[] = [heading, ""];
  if (breakingNotes.length === 0) {
    lines.push("### Breaking changes", "", "- _Document migration steps here._", "");
  } else {
    lines.push("### Breaking changes", "");
    for (const note of breakingNotes) {
      lines.push(`- ${note.trim()}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Append the rendered section to `<memberPath>/MIGRATING.md`. When the file
 * does not exist, it is created with a top-level `# MIGRATING` header so the
 * Markdown structure stays consistent with hand-authored migration docs.
 */
export async function appendMigratingSection(options: AppendMigratingOptions): Promise<void> {
  const section = renderMigratingSection(options);
  const path = join(options.memberPath, "MIGRATING.md");
  const file = Bun.file(path);

  if (!(await file.exists())) {
    await Bun.write(path, `# MIGRATING\n\n${section}`);
    return;
  }

  const existing = await file.text();
  const trimmed = existing.replace(/\n+$/, "");
  await Bun.write(path, `${trimmed}\n\n${section}`);
}

/**
 * Read `BREAKING CHANGE:` / `BREAKING-CHANGE:` footers from the member's
 * path-scoped commit range. Returns one trimmed note per occurrence in the
 * order produced by `git log` (newest first).
 *
 * @param options.cwd - Repository root.
 * @param options.path - Path relative to the repo root that scopes the log.
 * @param options.since - Lower bound for the range (e.g. last release tag).
 *   `null` lists all commits reachable from HEAD that touched the path.
 */
export async function readBreakingNotes(options: {
  cwd: string;
  path: string;
  since: string | null;
}): Promise<string[]> {
  const { cwd, path, since } = options;
  const range = since ? `${since}..HEAD` : "HEAD";
  // %B = full commit body (subject + body) with footers preserved.
  // The literal sentinel between commits lets us safely split the stream.
  const sentinel = "<<<COMMIT-END>>>";
  const result = await $`git log ${range} --pretty=format:%B${sentinel} -- ${path}`
    .cwd(cwd)
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) return [];

  const stream = result.stdout.toString();
  const messages = stream
    .split(sentinel)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const notes: string[] = [];
  for (const message of messages) {
    const matches = message.matchAll(/^BREAKING[ -]CHANGE:\s*(.+?)(?=\n\n|\n[A-Z][A-Za-z-]+:|\n*$)/gms);
    for (const match of matches) {
      const note = match[1]?.replace(/\s+/g, " ").trim();
      if (note) notes.push(note);
    }
  }
  return notes;
}
