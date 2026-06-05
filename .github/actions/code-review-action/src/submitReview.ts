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
  anchorCommentToDiff,
  extractValidLines,
  formatInvalidComments,
  isAlreadyMentioned,
  parseStructuredOutput,
  type InlineComment,
  type ValidLine,
} from "./reviewOutput/reviewOutput.ts";
import { buildReviewComments } from "./reviewOutput/inlineCommentBody.ts";
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
import {
  buildReviewBody,
  parseRunSummary,
  renderRunSummaryFooter,
  stripRunSummaryFooter,
} from "./runSummaryFooter.ts";

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
  newCommentLocations: ValidLine[],
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

// Anchor each finding to the diff once. A non-null result posts inline (its range
// clamped to the largest in-diff span ending at `line`); a null falls back to the
// review body. Pairing source with result keeps the routing explicit instead of
// re-deriving the invalid set by positional index.
const anchored = allComments.map((comment) => ({
  comment,
  inline: anchorCommentToDiff(comment, validLines),
}));
const validComments: InlineComment[] = anchored.flatMap(({ inline }) => (inline ? [inline] : []));
const invalidComments = anchored
  .filter(({ inline }) => inline === null)
  .map(({ comment }) => comment)
  .filter((c) => !isAlreadyMentioned(c, output.reviewComment));

// Assemble the main review body, then append the per-run metrics as a collapsible
// footer (main review comment only — never inline, never react replies). A clean
// approval (empty body, no inline comments) gets a minimal "no issues found" line
// via buildReviewBody so the action never posts a footer-only, stats-only comment.
// Fail-open: no footer when RUN_SUMMARY is absent or invalid.
const reviewBody = output.reviewComment + formatInvalidComments(invalidComments);
const runSummary = parseRunSummary(process.env.RUN_SUMMARY);
const footer = runSummary ? renderRunSummaryFooter(runSummary, reviewer) : "";
const finalBody = buildReviewBody(reviewBody, footer, validComments.length > 0);

// The footer carries run-varying numbers (cost, latency); strip it from both
// bodies so the duplicate-suppression guard compares the stable content only.
const dedupKey = (body: string): string => normalizeBody(stripRunSummaryFooter(body));

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
const lastBotReview = await getLastBotReview(octokit, owner, repoName, pullNumber, reviewer);

// Skip if last bot review has identical body (prevents duplicate from concurrent posting)
if (lastBotReview && dedupKey(lastBotReview.body ?? "") === dedupKey(finalBody)) {
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
if (guardReview && dedupKey(guardReview.body ?? "") === dedupKey(finalBody)) {
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
  comments: buildReviewComments(validComments, prFiles),
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
