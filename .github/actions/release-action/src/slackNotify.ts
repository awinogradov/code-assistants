/**
 * Post release notification to Slack with Block Kit formatting.
 *
 * Reads the release channel from `package.json` (`release.slack` field),
 * extracts AI-generated release notes, and posts a rich message with
 * version, notes, and a link to the GitHub release.
 *
 * @see ../../../../docs/release-field.md
 *
 * @example
 * ```bash
 * SLACK_TOKEN=xoxb-... bun src/slackNotify.ts
 * ```
 */
import { WebClient } from "@slack/web-api";

import { readReleaseField } from "./releaseField.ts";
import { changelogSectionNames } from "./release.ts";

/** Heading prefix used by conventional changelog sections in release notes files */
const changelogHeadingPrefix = "### ";

/** Section names that mark the end of AI-generated content */
const conventionalChangelogSections: Set<string> = new Set(changelogSectionNames);

/**
 * Extract AI-generated release notes from a release notes file.
 *
 * Captures all AI sections between `## Release Notes` and `## Linear`
 * (or `## GitHub Issues` / `### ` conventional changelog headings).
 * Strips `<details>` blocks, converts markdown to Slack mrkdwn format,
 * and truncates at the nearest paragraph, line, or word boundary
 * to fit within Slack's 3000 character section limit.
 */
export function extractReleaseNotes(content: string): string {
  const lines = content.split("\n");
  const startIndex = lines.findIndex((line) => line === "## Release Notes");

  if (startIndex === -1) return "A new version has been released.";

  const result: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line === "## Linear" || line === "## Jira" || line === "## GitHub Issues") break;
    if (
      line.startsWith(changelogHeadingPrefix) &&
      conventionalChangelogSections.has(line.slice(changelogHeadingPrefix.length))
    )
      break;
    result.push(line);
  }

  let notes = result.join("\n").trim();
  if (!notes) return "A new version has been released.";

  // Strip <details>...</details> blocks (may be indented)
  notes = notes.replaceAll(/\s*<details>[\s\S]*?<\/details>/g, "");

  // Escape Slack special characters (must run before mrkdwn conversions)
  notes = notes.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  // Convert ### and ## headings to Slack bold
  notes = notes.replaceAll(/^### (.+)$/gm, "*$1*");
  notes = notes.replaceAll(/^## (.+)$/gm, "*$1*");

  // Convert **bold** to *bold* for Slack mrkdwn
  notes = notes.replaceAll(/\*\*([^*]+)\*\*/g, "*$1*");

  // Collapse multiple blank lines into one
  notes = notes.replaceAll(/\n{3,}/g, "\n\n").trim();

  // Truncate at the nearest paragraph, line, or word boundary to avoid mid-word cuts
  const maxLength = 2900;
  if (notes.length > maxLength) {
    const suffix = "...";
    const budget = maxLength - suffix.length;
    const lastParagraph = notes.lastIndexOf("\n\n", budget);
    const lastLine = notes.lastIndexOf("\n", budget);
    const lastSpace = notes.lastIndexOf(" ", budget);
    let cutPoint = budget;
    if (lastParagraph > 0) cutPoint = lastParagraph;
    else if (lastLine > 0) cutPoint = lastLine;
    else if (lastSpace > 0) cutPoint = lastSpace;
    notes = `${notes.slice(0, cutPoint).trimEnd()}${suffix}`;
  }

  return notes;
}

// Only run when executed directly (not when imported for testing)
if (import.meta.main) {
  void (async () => {
    const slackToken = process.env.SLACK_TOKEN;
    if (!slackToken) {
      console.log("SLACK_TOKEN not set, skipping Slack notification");
      process.exit(0);
    }

    const repo = process.env.GITHUB_REPOSITORY ?? "";
    const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";

    // Read package.json release.slack for channel
    const pkgFile = Bun.file("package.json");
    if (!(await pkgFile.exists())) {
      console.log("package.json not found, skipping Slack notification");
      process.exit(0);
    }

    const { slack: channel } = readReleaseField(await pkgFile.json());
    if (!channel) {
      console.log("No release.slack field in package.json, skipping notification");
      process.exit(0);
    }

    // Read version and release notes
    const version = (await Bun.file("version").text()).trim();
    const repoName = repo.split("/").pop() ?? repo;
    const releaseUrl = `${serverUrl}/${repo}/releases/tag/v${version}`;

    const releaseNotesFile = Bun.file(`.release_notes/${version}.md`);
    const releaseNotesContent = (await releaseNotesFile.exists())
      ? await releaseNotesFile.text()
      : "";
    const notes = extractReleaseNotes(releaseNotesContent);

    // Post to Slack using Block Kit
    const slack = new WebClient(slackToken);

    try {
      const result = await slack.chat.postMessage({
        channel,
        text: `${repo} v${version} released`,
        unfurl_links: false,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `📦 ${repoName} v${version}`,
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: notes,
            },
          },
          {
            type: "divider",
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "View release",
                },
                url: releaseUrl,
                action_id: "view_release",
                style: "primary",
              },
            ],
          },
        ],
      });

      if (result.ok) {
        console.log(`Slack notification sent to ${channel}`);
      } else {
        console.log(`::warning::Slack notification failed: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`::warning::Slack notification failed: ${message}`);
    }
  })();
}
