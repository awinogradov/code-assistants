/**
 * Assemble enhanced PR body with AI-generated release notes
 *
 * Reads release notes from `<cwd>/.release_bot/release_notes.md` and the raw
 * changelog from `<cwd>/.release_bot/body`, then combines them into an enhanced
 * PR body. Replaces inline conventional changelog with a link to the per-member
 * `CHANGELOG.md`. Truncates the body when it exceeds GitHub's 65536 character
 * PR body limit: first replaces release notes with a link, then drops the
 * tickets section if still too long, and hard-truncates as a last resort.
 *
 * Per-member usage: pass `cwd` pointing at the member directory so all relative
 * paths resolve inside that member's tree. Standalone mode uses `process.cwd()`.
 *
 * @example
 * ```bash
 * bun src/assemble-pr-body.ts
 * ```
 */
import { join } from "node:path";

/** GitHub's maximum character limit for PR body */
const githubBodyMaxLength = 65536;

/** Options accepted by {@link assemblePrBody}. */
export interface AssemblePrBodyOptions {
  /** Member directory; defaults to `process.cwd()`. */
  cwd?: string;
  /** Branch template (e.g. `release-{version}`). Defaults to `INPUT_BRANCH` env or `release-{version}`. */
  branchTemplate?: string;
  /** Path within the member where the per-version release-notes file lives. Defaults to `.release_notes`. */
  releaseNotesDir?: string;
  /** Path within the member where the CHANGELOG.md lives. Defaults to `CHANGELOG.md`. */
  changelogFileName?: string;
}

/** Release notes file path and the branch it will be committed to */
interface ReleaseNotesTarget {
  path: string;
  branch: string;
}

async function getReleaseNotesTarget(
  cwd: string,
  branchTemplate: string,
  releaseNotesDir: string,
): Promise<ReleaseNotesTarget | undefined> {
  const versionFile = Bun.file(join(cwd, "version"));
  if (await versionFile.exists()) {
    const version = (await versionFile.text()).trim();
    if (version) {
      return {
        path: `${releaseNotesDir}/${version}.md`,
        branch: branchTemplate.replace("{version}", version),
      };
    }
  }
  return undefined;
}

function buildBlobUrl(branch: string, filePath: string): string {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  if (serverUrl && repository) {
    return `${serverUrl}/${repository}/blob/${branch}/${filePath}`;
  }
  console.log(
    "::warning::GITHUB_SERVER_URL or GITHUB_REPOSITORY not set. Using relative path for link.",
  );
  return filePath;
}

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

function truncateBody(
  summary: string,
  ticketsBlock: string,
  changelogLinkLine: string,
  target: ReleaseNotesTarget | undefined,
): string {
  const linkText = target
    ? `See [full release notes](${buildBlobUrl(target.branch, target.path)}) for detailed changes.`
    : "See release notes file for detailed changes.";
  return `${summary.trimEnd()}\n\n## Release Notes\n\n${linkText}\n\n${ticketsBlock}${changelogLinkLine}\n`;
}

function hardTruncateBody(
  summary: string,
  changelogLinkLine: string,
  target: ReleaseNotesTarget | undefined,
): string {
  const shell = truncateBody("", "", changelogLinkLine, target);
  const budget = githubBodyMaxLength - shell.length;
  if (budget <= 0) return shell.slice(0, githubBodyMaxLength);
  return truncateBody(summary.slice(0, budget), "", changelogLinkLine, target);
}

function pickBodyWithinLimit(
  full: string,
  summary: string,
  ticketsBlock: string,
  changelogLinkLine: string,
  target: ReleaseNotesTarget | undefined,
): string {
  if (full.length <= githubBodyMaxLength) return full;
  console.log(
    `::warning::PR body exceeds GitHub limit (${full.length}/${githubBodyMaxLength} chars). Truncating release notes.`,
  );
  const withoutNotes = truncateBody(summary, ticketsBlock, changelogLinkLine, target);
  if (withoutNotes.length <= githubBodyMaxLength) return withoutNotes;
  console.log(
    `::warning::Truncated body still exceeds GitHub limit (${withoutNotes.length}/${githubBodyMaxLength} chars). Dropping tickets section.`,
  );
  const withoutTickets = truncateBody(summary, "", changelogLinkLine, target);
  if (withoutTickets.length <= githubBodyMaxLength) return withoutTickets;
  console.log(
    `::warning::Body still exceeds GitHub limit (${withoutTickets.length}/${githubBodyMaxLength} chars). Hard-truncating.`,
  );
  return hardTruncateBody(summary, changelogLinkLine, target);
}

/**
 * Assemble the enhanced PR body for a member (or the repo root in standalone mode).
 *
 * Writes the result to `<cwd>/.release_bot/body_enhanced`.
 */
export async function assemblePrBody(options: AssemblePrBodyOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const branchTemplate =
    options.branchTemplate ?? process.env.INPUT_BRANCH ?? "release-{version}";
  const releaseNotesDir = options.releaseNotesDir ?? ".release_notes";
  const changelogFileName = options.changelogFileName ?? "CHANGELOG.md";

  const releaseNotesFile = Bun.file(join(cwd, ".release_bot/release_notes.md"));
  const releaseNotes = (await releaseNotesFile.exists())
    ? (await releaseNotesFile.text()).trim()
    : "";

  const rawBody = await Bun.file(join(cwd, ".release_bot/body")).text();
  const lines = rawBody.split("\n");

  const ticketStartIndex = lines.findIndex(
    (line) =>
      line.startsWith("## Linear") ||
      line.startsWith("## Jira") ||
      line.startsWith("## GitHub Issues"),
  );
  const changelogStartIndex = lines.findIndex((line) => line.startsWith("### "));

  const summaryEnd = (() => {
    if (ticketStartIndex > 0) return ticketStartIndex;
    if (changelogStartIndex > 0) return changelogStartIndex;
    return lines.length;
  })();
  const summarySection = lines.slice(0, summaryEnd).join("\n");

  const ticketSection = (() => {
    if (ticketStartIndex <= 0) return "";
    if (changelogStartIndex > ticketStartIndex) {
      return lines.slice(ticketStartIndex, changelogStartIndex).join("\n");
    }
    return lines.slice(ticketStartIndex).join("\n");
  })();

  // Safety net: strip any leading markdown headers AI may generate
  const cleanedNotes = releaseNotes.replace(/^(#+\s+.*\n+)+/, "");

  const releaseTarget = await getReleaseNotesTarget(cwd, branchTemplate, releaseNotesDir);

  const changelogLink = releaseTarget
    ? `📋 [Detailed changelog](${buildBlobUrl(releaseTarget.branch, changelogFileName)})`
    : "📋 Detailed changelog";

  const wrappedTickets = wrapTicketsInDetails(ticketSection);
  const ticketBlock = wrappedTickets ? `${wrappedTickets}\n\n` : "";

  const enhanced =
    `${summarySection.trimEnd()}\n\n## Release Notes\n\n${cleanedNotes}\n\n${ticketBlock}${changelogLink}\n`;

  const finalBody = pickBodyWithinLimit(
    enhanced,
    summarySection,
    ticketBlock,
    changelogLink,
    releaseTarget,
  );
  await Bun.write(join(cwd, ".release_bot/body_enhanced"), finalBody);
  console.log("Enhanced PR body written to .release_bot/body_enhanced");
}

if (import.meta.main) {
  await assemblePrBody();
}
