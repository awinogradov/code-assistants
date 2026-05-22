/**
 * Insert AI release notes into CHANGELOG.md and .release_notes/<version>.md
 *
 * Reads AI-generated notes from `.release_bot/release_notes.md` and inserts them
 * as a "## Release Notes" section after the version header in both files.
 * Uses string matching (not regex) to avoid issues with markdown metacharacters.
 *
 * @example
 * ```bash
 * bun src/insert-release-notes.ts 1.2.0
 * ```
 */

export {};

const [, , version] = process.argv;

if (!version?.trim()) {
  console.error("Usage: bun src/insert-release-notes.ts <version>");
  process.exit(1);
}

const notesFile = Bun.file(".release_bot/release_notes.md");

if (!(await notesFile.exists())) {
  console.log("No .release_bot/release_notes.md found, skipping release notes insertion");
  process.exit(0);
}

const notes = (await notesFile.text()).trim();

if (!notes) {
  console.log("Release notes file is empty, skipping insertion");
  process.exit(0);
}

const releaseNotesSection = `## Release Notes\n\n${notes}\n`;

/**
 * Insert a release notes section after the version header in markdown content
 *
 * Finds the first line containing `## ` followed by the version string,
 * then inserts the release notes block after the header and its trailing blank line.
 *
 * @param content - Markdown file content
 * @param ver - Version string to locate (e.g. "1.2.0")
 * @param notesBlock - Formatted release notes block to insert
 * @returns Updated content, or original if version header not found
 */
function insertAfterVersionHeader(content: string, ver: string, notesBlock: string): string {
  const lines = content.split("\n");
  const headerIndex = lines.findIndex((line) => line.startsWith("## ") && line.includes(ver));

  if (headerIndex === -1) {
    return content;
  }

  // Find the blank line after the header
  let insertAt = headerIndex + 1;
  if (insertAt < lines.length && lines[insertAt]?.trim() === "") {
    insertAt += 1;
  }

  lines.splice(insertAt, 0, notesBlock, "");
  return lines.join("\n");
}

async function insertIntoChangelog(ver: string, notesBlock: string): Promise<void> {
  const changelogFile = Bun.file("CHANGELOG.md");
  if (!(await changelogFile.exists())) return;

  const changelog = await changelogFile.text();
  const updated = insertAfterVersionHeader(changelog, ver, notesBlock);

  if (updated !== changelog) {
    await Bun.write("CHANGELOG.md", updated);
    console.log("Inserted release notes into CHANGELOG.md");
  } else {
    console.log(`Version header for ${ver} not found in CHANGELOG.md, skipping`);
  }
}

// Insert into CHANGELOG.md
await insertIntoChangelog(version, releaseNotesSection);

// Insert into .release_notes/<version>.md
const releaseNotePath = `.release_notes/${version}.md`;
const releaseNoteFile = Bun.file(releaseNotePath);
if (await releaseNoteFile.exists()) {
  const releaseNote = await releaseNoteFile.text();
  const updated = insertAfterVersionHeader(releaseNote, version, releaseNotesSection);

  if (updated !== releaseNote) {
    await Bun.write(releaseNotePath, updated);
    console.log(`Inserted release notes into ${releaseNotePath}`);
  } else {
    // Version header may not be present in .release_notes file — prepend instead
    await Bun.write(releaseNotePath, `${releaseNotesSection}\n${releaseNote}`);
    console.log(`Prepended release notes to ${releaseNotePath}`);
  }
}
