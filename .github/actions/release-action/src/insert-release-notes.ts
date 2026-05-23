/**
 * Insert AI release notes into a member's `CHANGELOG.md` and
 * `.release_notes/<version>.md`.
 *
 * Reads AI-generated notes from `<cwd>/.release_bot/release_notes.md` and
 * inserts them as a "## Release Notes" section after the version header in
 * both files. Uses string matching (not regex) to avoid issues with markdown
 * metacharacters.
 *
 * @example
 * ```bash
 * bun src/insert-release-notes.ts 1.2.0
 * ```
 */
import { join } from "node:path";

/** Options accepted by {@link insertReleaseNotes}. */
export interface InsertReleaseNotesOptions {
  /** Version string locating the version header. */
  version: string;
  /** Member directory; defaults to `process.cwd()`. */
  cwd?: string;
}

function insertAfterVersionHeader(content: string, ver: string, notesBlock: string): string {
  const lines = content.split("\n");
  const headerIndex = lines.findIndex((line) => line.startsWith("## ") && line.includes(ver));
  if (headerIndex === -1) return content;

  let insertAt = headerIndex + 1;
  if (insertAt < lines.length && lines[insertAt]?.trim() === "") {
    insertAt += 1;
  }
  lines.splice(insertAt, 0, notesBlock, "");
  return lines.join("\n");
}

async function insertIntoChangelog(
  cwd: string,
  ver: string,
  notesBlock: string,
): Promise<void> {
  const changelogPath = join(cwd, "CHANGELOG.md");
  const changelogFile = Bun.file(changelogPath);
  if (!(await changelogFile.exists())) return;

  const changelog = await changelogFile.text();
  const updated = insertAfterVersionHeader(changelog, ver, notesBlock);
  if (updated !== changelog) {
    await Bun.write(changelogPath, updated);
    console.log("Inserted release notes into CHANGELOG.md");
  } else {
    console.log(`Version header for ${ver} not found in CHANGELOG.md, skipping`);
  }
}

/**
 * Insert AI release notes into the member's CHANGELOG and per-version
 * release-notes file. No-ops silently when the source notes file is missing.
 */
export async function insertReleaseNotes(options: InsertReleaseNotesOptions): Promise<void> {
  const { version } = options;
  const cwd = options.cwd ?? process.cwd();

  const notesFile = Bun.file(join(cwd, ".release_bot/release_notes.md"));
  if (!(await notesFile.exists())) {
    console.log("No .release_bot/release_notes.md found, skipping release notes insertion");
    return;
  }

  const notes = (await notesFile.text()).trim();
  if (!notes) {
    console.log("Release notes file is empty, skipping insertion");
    return;
  }

  const releaseNotesSection = `## Release Notes\n\n${notes}\n`;

  await insertIntoChangelog(cwd, version, releaseNotesSection);

  const releaseNotePath = join(cwd, ".release_notes", `${version}.md`);
  const releaseNoteFile = Bun.file(releaseNotePath);
  if (await releaseNoteFile.exists()) {
    const releaseNote = await releaseNoteFile.text();
    const updated = insertAfterVersionHeader(releaseNote, version, releaseNotesSection);
    if (updated !== releaseNote) {
      await Bun.write(releaseNotePath, updated);
      console.log(`Inserted release notes into .release_notes/${version}.md`);
    } else {
      await Bun.write(releaseNotePath, `${releaseNotesSection}\n${releaseNote}`);
      console.log(`Prepended release notes to .release_notes/${version}.md`);
    }
  }
}

if (import.meta.main) {
  const [, , version] = process.argv;
  if (!version?.trim()) {
    console.error("Usage: bun src/insert-release-notes.ts <version>");
    process.exit(1);
  }
  await insertReleaseNotes({ version });
}
