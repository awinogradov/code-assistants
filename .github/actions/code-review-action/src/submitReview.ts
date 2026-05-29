/**
 * Submit PR review to GitHub with inline comments validation.
 * Validates inline comments against PR diff hunks and submits review via Octokit.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo PR_NUMBER=123 STRUCTURED_OUTPUT='{"verdict":"approve",...}' bun run scripts/submitReview.ts
 */
import type { Octokit } from "@octokit/rest";

import type { ReviewEvent, ReviewThread } from "./github/githubReview.ts";
import {
  deletePendingReviews,
  fetchReviewThreads,
  getLastBotReview,
  hasRecentBotReview,
  normalizeBody,
  parseRepoEnv,
  readExecutionResult,
  resolveThread,
  unresolveThread,
  verdictToEvent,
} from "./github/githubReview.ts";

/** Inline comment on a specific file/line in the PR */
interface InlineComment {
  path: string;
  line: number;
  body: string;
}

/** Structured output from Claude review */
interface StructuredOutput {
  verdict: "approve" | "requestChanges" | "comment";
  reviewComment: string;
  inlineComments?: InlineComment[];
}

/** Valid line location in the PR diff */
interface ValidLine {
  path: string;
  line: number;
}

/** Location of a comment (path and line) */
interface CommentLocation {
  path: string;
  line: number;
}

/**
 * Parse and validate structured output from Claude.
 * Returns null if output is empty, null string, or invalid JSON.
 */
function parseStructuredOutput(rawOutput: string): StructuredOutput | null {
  const trimmed = rawOutput.trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  const parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  return {
    verdict: (obj.verdict as StructuredOutput["verdict"]) ?? "comment",
    reviewComment: (obj.reviewComment as string) ?? "Review completed.",
    inlineComments: (obj.inlineComments as InlineComment[]) ?? [],
  };
}

/**
 * Extract line range from a single diff hunk match.
 */
function extractHunkLines(filename: string, match: RegExpMatchArray): ValidLine[] {
  const start = Number(match[1]);
  const count = match[2] ? Number(match[2]) : 1;

  return Array.from({ length: count }, (_, i) => ({ path: filename, line: start + i }));
}

/**
 * Extract valid line numbers from PR diff hunks.
 * Parses unified diff format: @@ -old,count +new,count @@
 */
function extractValidLines(patches: Array<{ filename: string; patch?: string }>): ValidLine[] {
  const hunkHeaderRegex = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g;

  return patches
    .filter((file) => file.patch)
    .flatMap((file) =>
      [...file.patch!.matchAll(hunkHeaderRegex)].flatMap((m) => extractHunkLines(file.filename, m))
    );
}

/**
 * Check if a comment is on a valid diff line.
 */
function isValidComment(comment: InlineComment, validLines: ValidLine[]): boolean {
  return validLines.some((vl) => vl.path === comment.path && vl.line === comment.line);
}

/**
 * Check if a comment's file:line is already mentioned in the review body.
 * Prevents duplicate content when invalid inline comments would repeat issues.
 */
function isAlreadyMentioned(comment: InlineComment, reviewBody: string): boolean {
  const pattern = `${comment.path}:${comment.line}`;
  return reviewBody.includes(pattern);
}

/**
 * Format invalid comments for inclusion in review body.
 * Downgrades blockers (🚧) to suggestions (🙋‍♂️) since they're supplementary.
 */
function formatInvalidComments(comments: InlineComment[]): string {
  if (comments.length === 0) {
    return "";
  }

  const formatted = comments
    .map((c) => {
      const body = c.body.replaceAll("🚧", "🙋‍♂️");
      return `**\`${c.path}:${c.line}\`**\n\n${body}`;
    })
    .join("\n\n");

  return `\n\n---\n## Additional Comments (not in diff)\n\n${formatted}`;
}

/**
 * Cleanup bot review threads by resolving outdated ones, duplicates, and fixed blockers.
 * Resolves threads when:
 * - Thread is marked outdated by GitHub (code at that line changed)
 * - A new comment will be posted on the same path:line (prevents duplicates)
 * - Review event is APPROVE (confirms all issues addressed)
 */
async function cleanupBotThreads(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  botLogin: string,
  newCommentLocations: CommentLocation[],
  event: ReviewEvent
): Promise<number> {
  const threads = await fetchReviewThreads(octokit, owner, repo, pullNumber);

  const toResolve = threads.filter((thread: ReviewThread) => {
    if (thread.isResolved) return false;
    if (thread.firstCommentAuthor !== botLogin) return false;

    // Resolve if outdated (code changed)
    if (thread.isOutdated) return true;

    // Resolve all bot threads when approving (confirms issues addressed)
    if (event === "APPROVE") return true;

    // Resolve if new comment will be posted on same location (prevents duplicates)
    if (thread.line === null) return false;
    return newCommentLocations.some((loc) => loc.path === thread.path && loc.line === thread.line);
  });

  for (const thread of toResolve) {
    await resolveThread(octokit, thread.id);
  }

  return toResolve.length;
}

// Main execution
const { octokit, owner, repoName, pullNumber, reviewer } = parseRepoEnv();
const structuredOutput = process.env.STRUCTURED_OUTPUT ?? "";

// Parse structured output
let output = parseStructuredOutput(structuredOutput);

if (!output) {
  // Check if bot already submitted a review during execution (via MCP tools)
  const headSha = process.env.PR_HEAD_SHA;
  const alreadyReviewed = await hasRecentBotReview(
    octokit,
    owner,
    repoName,
    pullNumber,
    reviewer,
    headSha
  );

  if (alreadyReviewed) {
    console.log("✓ Review already submitted during execution, no action needed");
    process.exit(0);
  }

  // Try execution file fallback (with RUNNER_TEMP fallback path)
  const executionFile =
    process.env.EXECUTION_FILE ||
    (process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/claude-execution-output.json` : undefined);
  const resultText = await readExecutionResult(executionFile);
  if (!resultText) {
    console.error("No structured output, no execution result, and no existing review found");
    process.exit(1);
  }
  console.log("Structured output missing, falling back to execution result as COMMENT review");
  output = {
    verdict: "comment",
    reviewComment: resultText,
    inlineComments: [],
  };
}

const event = verdictToEvent[output.verdict] ?? "COMMENT";
const allComments = output.inlineComments ?? [];

// Fetch PR files to validate comment line numbers
const { data: prFiles } = await octokit.rest.pulls.listFiles({
  owner,
  repo: repoName,
  pull_number: pullNumber,
});

const validLines = extractValidLines(prFiles);

const validComments = allComments.filter((c) => isValidComment(c, validLines));
const invalidComments = allComments
  .filter((c) => !isValidComment(c, validLines))
  .filter((c) => !isAlreadyMentioned(c, output.reviewComment));

const finalBody = output.reviewComment + formatInvalidComments(invalidComments);

console.log(
  `Submitting ${event} review: ${validComments.length} inline comments, ${invalidComments.length} moved to body...`
);

// Cleanup bot threads: resolve outdated, duplicates, and fixed blockers on approval
const newCommentLocations = validComments.map((c) => ({ path: c.path, line: c.line }));
const resolvedCount = await cleanupBotThreads(
  octokit,
  owner,
  repoName,
  pullNumber,
  reviewer,
  newCommentLocations,
  event
);
if (resolvedCount > 0) {
  console.log(`✓ Resolved ${resolvedCount} review thread(s)`);
}

// Skip if consecutive approval with no new findings (avoid duplicate reviews)
const { data: reviews } = await octokit.rest.pulls.listReviews({
  owner,
  repo: repoName,
  pull_number: pullNumber,
});

const botReviews = reviews.filter((r) => r.user?.login === reviewer && r.state !== "PENDING");
const lastBotReview = botReviews.at(-1);

// Skip if last bot review has identical body (prevents duplicate from concurrent posting)
if (lastBotReview && normalizeBody(lastBotReview.body ?? "") === normalizeBody(finalBody)) {
  console.log("✓ Review already posted, skipping duplicate");
  process.exit(0);
}

if (
  event === "APPROVE" &&
  lastBotReview?.state === "APPROVED" &&
  validComments.length === 0 &&
  !output.reviewComment.includes("🙋‍♂️") &&
  !output.reviewComment.includes("💡")
) {
  console.log("✓ Previous review already approved, no new findings - skipping duplicate");
  process.exit(0);
}

// Delete pending reviews before submitting
await deletePendingReviews(octokit, owner, repoName, pullNumber);

// Last-write guard: re-read the latest bot review immediately before submitting.
// A concurrent run (the per-comment concurrency group does not serialize same-PR
// runs) may have posted an identical body since the check above — skip if so.
const guardReview = await getLastBotReview(octokit, owner, repoName, pullNumber, reviewer);
if (guardReview && normalizeBody(guardReview.body ?? "") === normalizeBody(finalBody)) {
  console.log("✓ Identical review appeared concurrently, skipping duplicate");
  process.exit(0);
}

// Submit the review
const { data: submittedReview } = await octokit.rest.pulls.createReview({
  owner,
  repo: repoName,
  pull_number: pullNumber,
  event,
  body: finalBody,
  comments: validComments,
});

console.log("✓ Review submitted successfully");

// GitHub auto-resolves threads in APPROVE reviews — unresolve ones from this review
if (event === "APPROVE" && validComments.length > 0) {
  const threads = await fetchReviewThreads(octokit, owner, repoName, pullNumber);
  const autoResolvedThreads = threads.filter(
    (t) =>
      t.isResolved &&
      t.firstCommentAuthor === reviewer &&
      t.firstCommentReviewId === submittedReview.node_id
  );

  for (const thread of autoResolvedThreads) {
    await unresolveThread(octokit, thread.id);
  }

  if (autoResolvedThreads.length > 0) {
    console.log(`✓ Unresolved ${autoResolvedThreads.length} auto-resolved thread(s)`);
  }
}
