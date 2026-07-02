/**
 * Release notes prompt configuration and content filtering
 *
 * Contains the AI prompt for generating release notes, changelog filtering
 * logic, and service context reader. The prompt targets a delivery/integration
 * team audience who deploy, configure, and integrate services.
 *
 * To modify release notes output:
 * - Edit `systemPrompt` to change sections, rules, or exclusions
 * - Edit `filterChangelogForAi` to change which changelog sections reach the AI
 * - Edit `readServiceContext` to change what service documentation is included
 *
 * @example
 * ```typescript
 * import {
 *   systemPrompt,
 *   filterChangelogForAi,
 *   readServiceContext,
 *   buildUserMessage,
 *   defaultAnthropicModel,
 * } from "./releaseNotesPrompt.ts";
 *
 * const filtered = filterChangelogForAi(changelog);
 * const context = await readServiceContext();
 * const message = buildUserMessage(filtered, context, tickets, prDescriptions);
 * ```
 */
import { join } from "node:path";

import { Glob } from "bun";

/** Default Anthropic model for release notes generation, used when the `model` action input (env `ANTHROPIC_MODEL`) is unset. */
export const defaultAnthropicModel = "claude-sonnet-4-6";

/** Maximum output tokens for the API response */
export const maxOutputTokens = 4096;

/**
 * Changelog sections that are irrelevant for the delivery team.
 *
 * These sections contain internal development changes (dependency bumps,
 * CI pipeline tweaks, test infrastructure, build config) that add noise
 * to release notes without providing integration or deployment value.
 */
const irrelevantSections = new Set(["Chores", "CI", "Tests", "Build"]);

/** Maximum characters to include from README.md */
const maxReadmeLength = 3000;

/** Maximum total characters to include from docs/*.md files */
const maxDocsLength = 5000;

/** System prompt with audience, format, sections, rules, and exclusions */
export const systemPrompt = `You generate release notes for the delivery/integration team.

AUDIENCE: Technical delivery team (NOT programmers). They deploy, configure, and integrate services. They need to understand WHAT changed, WHY it matters, and HOW to set it up.

When SERVICE CONTEXT is provided, use it to understand what the service does and write notes using domain-appropriate language. Reference service concepts and terminology the delivery team would recognize.

SECTIONS (in order):

Start with a one-sentence summary of the most impactful change (no heading).

## ✨ What's New
For each feature or improvement, use a ### heading with a short name, followed by a description paragraph:

### <Feature Name>
<Description paragraph explaining user benefit and deployment/integration impact>

If related to tickets/PRs, add a collapsible section with full links:
<details><summary>Related issues</summary>

- [ARCH-90: Issue title](url)
- [#1: Issue title](url)
</details>

## 🐛 Bug Fixes
For each fix that affects behavior (skip internal/minor fixes), use a ### heading:

### <Fix Name>
<Description paragraph focusing on what was broken and is now working>

## 📋 Protocol & Contract Changes
Only include if there are API endpoint, request/response schema, or integration contract changes. Use a ### heading per change with before/after examples:

### <Change Name>
<What changed and why>

**Before:**
\`\`\`
<old format/endpoint/schema>
\`\`\`

**After:**
\`\`\`
<new format/endpoint/schema>
\`\`\`

## ⚙️ Configuration Required
For any new environment variables or config changes, use a ### heading:

### <Config Change Name>
<Description: what it does, WHY it's needed, required/optional>

## ⚠️ Breaking Changes
Only include if there are actual breaking changes. Use a ### heading per change:

### <Breaking Change Name>
<What will break if not addressed. Step-by-step migration instructions>

## 📚 Documentation & Settings Updates
Only include if there are product documentation or settings file changes. Use a ### heading per change:

### <Change Name>
<Description of what changed>

RULES:
- NO commit prefixes (feat/fix/chore)
- Synthesize related commits into single clear descriptions
- SKIP empty sections entirely
- Explain in terms a non-programmer can understand
- Write in a conversational tone — describe outcomes, not actions. Instead of "Added X" or "Fixed Y", describe what's now possible or what works better
- Each item MUST use a ### heading followed by a description paragraph, NOT a bullet list
- GitHub Issues/PRs: Use full link format [#45: Title](url) in Related issues sections
- Linear/Jira tickets: Use full link format [ARCH-90: Title](url)
- For items with related tickets, use <details><summary>Related issues</summary> collapsible sections
- When PR descriptions contain explicit release notes, prefer that content as primary source

REFERENCE FORMATTING (apply to every link, path, and reference in the notes you write):

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. \`buildReviewComments\`, \`reviewOutput.ts\`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. \`[release field spec](<repo-blob-url>/docs/06-release-field.md)\`. Use a repo-relative path in repository files and the absolute \`<repo-blob-url>\` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. \`[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)\`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as \`[title](url)\` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare \`#anchor\`, e.g. \`[Phase 6](#phase-6-reply-to-review-threads)\`. Another document: \`path#anchor\` — a repo-relative path in repository files, the absolute \`<repo-blob-url>/path#anchor\` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. \`[0328a61](<repo-commit-url>/0328a61)\`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear \`ENG-123\`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. \`[ENG-123](https://linear.app/<workspace>/issue/ENG-123)\` — a slug-less issue URL resolves. On a magic-word line (\`Closes\`/\`Fixes\`/\`Related to\` in a PR body's \`**Issues:**\` section) use plain forms only: bare \`#N\` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->

EXCLUDE (never mention in release notes):
- CI/CD pipeline or workflow file changes
- Dependency version bumps without user-facing impact
- Governance/legal documents (CONTRIBUTING.md, AGENTS.md, LICENSE, CODE_OF_CONDUCT.md)
- Internal test infrastructure changes (test timeouts, test isolation, test helpers)
- Build system or lockfile changes (bun.lock, package-lock.json)
- Code formatting or linting configuration updates

STYLE EXAMPLE:

Good:
### Smarter Slack notifications
Release announcements no longer cut off mid-sentence or break up related sections when they hit Slack's message limits, ensuring your team gets coherent updates.

<details><summary>Related issues</summary>

- [TEAM-123: Smart truncate for the slack message](https://linear.app/example/issue/TEAM-123/smart-truncate-for-the-slack-message)
</details>

Bad:
- **Smart truncate for the slack message** — fix(slack): truncate messages at paragraph, line, or word boundaries`;

/**
 * Strip irrelevant conventional changelog sections before sending to AI.
 *
 * Removes ### Chores, ### CI, ### Tests, and ### Build sections entirely.
 * Keeps ### Features, ### Bug Fixes, ### Performance, ### Reverts,
 * ### Refactoring, and ### Documentation for the AI to synthesize.
 *
 * @param changelog - Raw conventional changelog body
 * @returns Filtered changelog with only relevant sections
 */
export function filterChangelogForAi(changelog: string): string {
  const lines = changelog.split("\n");
  const result: string[] = [];
  let skip = false;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      const section = line.slice(4).trim();
      skip = irrelevantSections.has(section);
    }

    if (!skip) {
      result.push(line);
    }
  }

  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Collect docs/*.md file paths, returning empty array on errors */
async function collectDocFiles(cwd: string): Promise<Array<{ path: string; relative: string }>> {
  try {
    const glob = new Glob("docs/**/*.md");
    const files: Array<{ path: string; relative: string }> = [];

    for await (const match of glob.scan({ cwd, absolute: true })) {
      files.push({ path: match, relative: match.replace(`${cwd}/`, "") });
    }

    return files;
  } catch {
    return [];
  }
}

/**
 * Read service documentation to give the AI context about the service.
 *
 * Reads README.md and docs/*.md files from the service repository.
 * This helps the AI write release notes using domain-appropriate language
 * and explain changes in terms of the service's functionality.
 *
 * @param cwd - Working directory (default: process.cwd())
 * @returns Combined service context string, or empty string if no docs found
 */
export async function readServiceContext(cwd = process.cwd()): Promise<string> {
  const parts: string[] = [];

  try {
    const readmeFile = Bun.file(join(cwd, "README.md"));
    if (await readmeFile.exists()) {
      const content = await readmeFile.text();
      const truncated =
        content.length > maxReadmeLength ? `${content.slice(0, maxReadmeLength)}...` : content;
      parts.push(`README:\n${truncated}`);
    }
  } catch {
    // Ignore read errors — service context is optional
  }

  const docFiles = await collectDocFiles(cwd);
  let totalLength = 0;

  for (const { path, relative } of docFiles) {
    if (totalLength >= maxDocsLength) break;

    try {
      const content = await Bun.file(path).text();
      const remaining = maxDocsLength - totalLength;
      const truncated = content.length > remaining ? `${content.slice(0, remaining)}...` : content;

      parts.push(`${relative}:\n${truncated}`);
      totalLength += truncated.length;
    } catch {
      // Skip unreadable files
    }
  }

  return parts.join("\n\n");
}

/**
 * Assemble the dynamic user message for the Anthropic API.
 *
 * Combines filtered changelog, service context, ticket data, and PR
 * descriptions into a single user message. The system prompt contains
 * the stable instructions.
 *
 * @param changelog - Filtered changelog content
 * @param serviceContext - Service README/docs content (optional)
 * @param tickets - Ticket context JSON string (optional)
 * @param prDescriptions - PR descriptions YAML string (optional)
 * @returns Assembled user message string
 */
export function buildUserMessage(
  changelog: string,
  serviceContext?: string,
  tickets?: string,
  prDescriptions?: string
): string {
  const parts: string[] = [];

  if (serviceContext) {
    parts.push(`SERVICE CONTEXT:\n${serviceContext}`);
  }

  parts.push(`CHANGELOG:\n${changelog}`);

  if (tickets) {
    parts.push(`TICKET CONTEXT (use these IDs in your output):\n${tickets}`);
  }

  if (prDescriptions) {
    parts.push(
      `PR DESCRIPTIONS (developer-provided context from pull requests — prioritize any explicit release notes content over conventional commit messages):\n${prDescriptions}`
    );
  }

  return parts.join("\n\n");
}
