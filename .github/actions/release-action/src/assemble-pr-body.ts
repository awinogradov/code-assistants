/**
 * Assemble enhanced PR body with AI-generated release notes
 *
 * Reads release notes from `.release_bot/release_notes.md` and the raw changelog
 * from `.release_bot/body`, then combines them into an enhanced PR body.
 * Replaces inline conventional changelog with a link to the CHANGELOG file.
 * Truncates the body when it exceeds GitHub's 65536 character PR body limit:
 * first replaces release notes with a link, then drops the tickets section if
 * still too long, and hard-truncates as a last resort.
 *
 * @example
 * ```bash
 * bun src/assemble-pr-body.ts
 * ```
 */

export {};

/** GitHub's maximum character limit for PR body */
const githubBodyMaxLength = 65536;

const releaseNotesFile = Bun.file(".release_bot/release_notes.md");
const releaseNotes = (await releaseNotesFile.exists())
  ? (await releaseNotesFile.text()).trim()
  : "";

const rawBody = await Bun.file(".release_bot/body").text();
const lines = rawBody.split("\n");

// Find ticket sections (## Linear, ## Jira, ## GitHub Issues) - these stay visible
const ticketStartIndex = lines.findIndex(
  (line) =>
    line.startsWith("## Linear") ||
    line.startsWith("## Jira") ||
    line.startsWith("## GitHub Issues")
);

// Find conventional changelog sections (### Features, ### Bug Fixes, etc.) - replaced with link
const changelogStartIndex = lines.findIndex((line) => line.startsWith("### "));

// Determine where summary ends
function getSummaryEndIndex(): number {
  if (ticketStartIndex > 0) return ticketStartIndex;
  if (changelogStartIndex > 0) return changelogStartIndex;
  return lines.length;
}

const summarySection = lines.slice(0, getSummaryEndIndex()).join("\n");

// Extract ticket section (between ## tickets and ### changelog)
function getTicketSection(): string {
  if (ticketStartIndex <= 0) return "";
  if (changelogStartIndex > ticketStartIndex) {
    return lines.slice(ticketStartIndex, changelogStartIndex).join("\n");
  }
  return lines.slice(ticketStartIndex).join("\n");
}

const ticketSection = getTicketSection();

// Safety net: strip any leading markdown headers AI may generate despite instructions
const cleanedNotes = releaseNotes.replace(/^(#+\s+.*\n+)+/, "");

/** Release notes file path and the branch it will be committed to */
interface ReleaseNotesTarget {
  path: string;
  branch: string;
}

/**
 * Detect the release notes file path and branch for linking.
 *
 * Reads the `version` file and resolves the branch from the `INPUT_BRANCH` template.
 */
async function getReleaseNotesTarget(): Promise<ReleaseNotesTarget | undefined> {
  const versionFile = Bun.file("version");
  if (await versionFile.exists()) {
    const version = (await versionFile.text()).trim();
    if (version) {
      const template = process.env.INPUT_BRANCH ?? "release-{version}";
      return {
        path: `.release_notes/${version}.md`,
        branch: template.replace("{version}", version),
      };
    }
  }

  return undefined;
}

/**
 * Build an absolute blob URL for a file on the release branch.
 *
 * Falls back to the relative path when GitHub environment variables are not available.
 */
function buildBlobUrl(branch: string, filePath: string): string {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  if (serverUrl && repository) {
    return `${serverUrl}/${repository}/blob/${branch}/${filePath}`;
  }
  console.log(
    "::warning::GITHUB_SERVER_URL or GITHUB_REPOSITORY not set. Using relative path for link."
  );
  return filePath;
}

/** Wrap each ticket section heading in a collapsible `<details>` block */
function wrapTicketsInDetails(tickets: string): string {
  if (!tickets.trim()) return "";

  const parts = tickets.split(/^(?=## (?:Linear|Jira|GitHub Issues))/m);

  return parts
    .filter((part) => part.trim())
    .map((part) => {
      const [fullMatch, heading] = part.match(/^## (Linear|Jira|GitHub Issues)/)!;
      const content = part.slice(fullMatch.length).trim();
      return `<details><summary><h2>${heading}</h2></summary>\n\n${content}\n\n</details>`;
    })
    .join("\n\n");
}

// Resolve target once — reused for both changelog link and truncation
const releaseTarget = await getReleaseNotesTarget();

// Build changelog link and final body
const changelogLink = releaseTarget
  ? `📋 [Detailed changelog](${buildBlobUrl(releaseTarget.branch, "CHANGELOG.md")})`
  : "📋 Detailed changelog";

// Build final body: Badges → Release Notes → Tickets → Changelog Link
const wrappedTickets = wrapTicketsInDetails(ticketSection);
const ticketBlock = wrappedTickets ? `${wrappedTickets}\n\n` : "";

const enhanced = `${summarySection.trimEnd()}

## Release Notes

${cleanedNotes}

${ticketBlock}${changelogLink}
`;

/**
 * Build a truncated PR body that fits within GitHub's limit.
 *
 * Replaces release notes with a link to the release notes file.
 * Keeps tickets and changelog link.
 *
 * @param summary - Badge/summary section from the raw body
 * @param ticketsBlock - Pre-formatted ticket section block (may be empty)
 * @param changelogLinkLine - Pre-formatted changelog link line
 * @param target - Resolved release notes target (avoids redundant file I/O)
 */
function truncateBody(
  summary: string,
  ticketsBlock: string,
  changelogLinkLine: string,
  target: ReleaseNotesTarget | undefined
): string {
  const linkText = target
    ? `See [full release notes](${buildBlobUrl(target.branch, target.path)}) for detailed changes.`
    : "See release notes file for detailed changes.";

  return `${summary.trimEnd()}

## Release Notes

${linkText}

${ticketsBlock}${changelogLinkLine}
`;
}

/**
 * Build a hard-truncated PR body that preserves the release notes and
 * changelog links by trimming the summary to whatever budget remains.
 *
 * Only reached when even the tickets-dropped body exceeds the limit —
 * typically means the summary itself is enormous.
 */
function hardTruncateBody(
  summary: string,
  changelogLinkLine: string,
  target: ReleaseNotesTarget | undefined
): string {
  const shell = truncateBody("", "", changelogLinkLine, target);
  const budget = githubBodyMaxLength - shell.length;
  if (budget <= 0) return shell.slice(0, githubBodyMaxLength);
  return truncateBody(summary.slice(0, budget), "", changelogLinkLine, target);
}

/**
 * Pick a body variant that fits within GitHub's PR body limit.
 *
 * Cascades: full → release notes replaced with link → tickets also dropped
 * → hard-truncated as last resort. Each step falls through only when the
 * previous variant still exceeds the limit.
 */
function pickBodyWithinLimit(
  full: string,
  summary: string,
  ticketsBlock: string,
  changelogLinkLine: string,
  target: ReleaseNotesTarget | undefined
): string {
  if (full.length <= githubBodyMaxLength) return full;

  console.log(
    `::warning::PR body exceeds GitHub limit (${full.length}/${githubBodyMaxLength} chars). Truncating release notes.`
  );
  const withoutNotes = truncateBody(summary, ticketsBlock, changelogLinkLine, target);
  if (withoutNotes.length <= githubBodyMaxLength) return withoutNotes;

  console.log(
    `::warning::Truncated body still exceeds GitHub limit (${withoutNotes.length}/${githubBodyMaxLength} chars). Dropping tickets section.`
  );
  const withoutTickets = truncateBody(summary, "", changelogLinkLine, target);
  if (withoutTickets.length <= githubBodyMaxLength) return withoutTickets;

  console.log(
    `::warning::Body still exceeds GitHub limit (${withoutTickets.length}/${githubBodyMaxLength} chars). Hard-truncating.`
  );
  return hardTruncateBody(summary, changelogLinkLine, target);
}

const finalBody = pickBodyWithinLimit(
  enhanced,
  summarySection,
  ticketBlock,
  changelogLink,
  releaseTarget
);
await Bun.write(".release_bot/body_enhanced", finalBody);

console.log("Enhanced PR body written to .release_bot/body_enhanced");
