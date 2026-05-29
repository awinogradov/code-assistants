/**
 * Update PR description with an "Available commands" help section in the footer.
 * Manages HTML-comment-bounded sections for idempotent, multi-action help text.
 * Fails open — errors are logged but do not block the action.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo PR_NUMBER=123 HELP_ID=code-review-action HELP_TEXT='- `@bot review` — re-run review' bun run scripts/updatePrFooter.ts
 */
import type { Octokit } from "@octokit/rest";

import { parseRepoEnv } from "./github/githubReview.ts";
import { buildMarkedDetailsBlock } from "./markedDetailsBlock.ts";

/** Configuration for the PR footer update, parsed from environment */
interface FooterConfig {
  octokit: Octokit;
  owner: string;
  repoName: string;
  pullNumber: number;
  helpId: string;
  helpText: string;
}

const outerOpenTag = "<!-- code-assistants-actions-help -->";
const outerCloseTag = "<!-- /code-assistants-actions-help -->";
const actionOpenPrefix = "<!-- action:";
const actionClosePrefix = "<!-- /action:";
const tagSuffix = " -->";

/** Build opening HTML comment marker for an action section */
function actionOpenTag(id: string): string {
  return `${actionOpenPrefix}${id}${tagSuffix}`;
}

/** Build closing HTML comment marker for an action section */
function actionCloseTag(id: string): string {
  return `${actionClosePrefix}${id}${tagSuffix}`;
}

/**
 * Validate that the help ID contains only safe characters.
 * Prevents HTML comment injection via malformed IDs.
 */
function validateHelpId(id: string): void {
  if (!/^[a-z0-9-]+$/i.test(id)) {
    throw new Error(
      `Invalid help ID: "${id}". Must contain only alphanumeric characters and hyphens.`
    );
  }
}

/** Parse and validate environment variables for the footer update. */
function parseFooterEnv(): FooterConfig {
  const { octokit, owner, repoName, pullNumber } = parseRepoEnv();
  const helpId = process.env.HELP_ID ?? "code-review-action";
  const helpText = process.env.HELP_TEXT;

  if (!helpText) {
    throw new Error("Missing required environment variable: HELP_TEXT");
  }

  validateHelpId(helpId);

  return { octokit, owner, repoName, pullNumber, helpId, helpText: helpText.trim() };
}

/** Build the HTML-comment-bounded section for one action. */
function buildActionSection(helpId: string, helpText: string): string {
  return `${actionOpenTag(helpId)}\n${helpText}\n${actionCloseTag(helpId)}`;
}

/** Build the complete footer wrapper around all action sections. */
function buildFullFooter(innerSections: string): string {
  return buildMarkedDetailsBlock({
    startMarker: outerOpenTag,
    endMarker: outerCloseTag,
    summary: "Available commands 🤖",
    bodyLines: [innerSections],
  });
}

/**
 * Extract all action sections from the footer content.
 * Uses indexOf-based parsing to find action ID → help text pairs.
 */
function extractActionSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  let searchStart = 0;

  while (searchStart < content.length) {
    const openIdx = content.indexOf(actionOpenPrefix, searchStart);
    if (openIdx === -1) break;

    const suffixIdx = content.indexOf(tagSuffix, openIdx + actionOpenPrefix.length);
    if (suffixIdx === -1) break;

    const id = content.slice(openIdx + actionOpenPrefix.length, suffixIdx);
    const closeTag = actionCloseTag(id);
    const closeIdx = content.indexOf(closeTag, suffixIdx);
    if (closeIdx === -1) break;

    const sectionContent = content.slice(suffixIdx + tagSuffix.length, closeIdx).trim();
    sections.set(id, sectionContent);
    searchStart = closeIdx + closeTag.length;
  }

  return sections;
}

/**
 * Compute the updated PR body with the help footer.
 * Uses a "collect and rebuild" strategy for idempotent updates.
 */
function updateBody(currentBody: string, helpId: string, helpText: string): string {
  const startIdx = currentBody.indexOf(outerOpenTag);
  const endIdx = currentBody.indexOf(outerCloseTag);

  let userBody: string;
  let sections: Map<string, string>;

  if (startIdx !== -1 && endIdx !== -1) {
    userBody = currentBody.slice(0, startIdx).trimEnd();
    const footerContent = currentBody.slice(startIdx, endIdx + outerCloseTag.length);
    sections = extractActionSections(footerContent);
  } else {
    userBody = currentBody.trimEnd();
    sections = new Map();
  }

  sections.set(helpId, helpText);

  const sectionsStr = [...sections.entries()]
    .map(([id, text]) => buildActionSection(id, text))
    .join("\n\n");

  const separator = userBody.length > 0 ? "\n\n" : "";
  return `${userBody}${separator}${buildFullFooter(sectionsStr)}`;
}

try {
  const config = parseFooterEnv();

  const { data: pr } = await config.octokit.rest.pulls.get({
    owner: config.owner,
    repo: config.repoName,
    pull_number: config.pullNumber,
  });

  const currentBody = pr.body ?? "";
  const updatedBody = updateBody(currentBody, config.helpId, config.helpText);

  if (updatedBody === currentBody) {
    console.log("✓ Help footer already up to date, skipping update");
  } else {
    await config.octokit.rest.pulls.update({
      owner: config.owner,
      repo: config.repoName,
      pull_number: config.pullNumber,
      body: updatedBody,
    });
    console.log(`✓ Help footer updated for action: ${config.helpId}`);
  }
} catch (error) {
  console.error("PR footer update error (fail-open, proceeding):", error);
}
