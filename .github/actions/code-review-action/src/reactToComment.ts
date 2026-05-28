/**
 * Process comment reaction and update PR review state on GitHub.
 * Handles replying to comments, resolving review threads, and updating verdict.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo PR_NUMBER=123 COMMENT_ID=456 STRUCTURED_OUTPUT='{"reply":"..."}' bun run scripts/reactToComment.ts
 */
import {
  deletePendingReviews,
  fetchReviewThreads,
  hasRecentBotReply,
  parseRepoEnv,
  readExecutionResult,
  resolveThread,
  verdictToEvent,
} from "./github/githubReview.ts";

/** Target for thread resolution by file location */
interface ResolveTarget {
  path: string;
  line: number;
}

/** Structured output from Claude reaction */
interface ReactionOutput {
  reply: string;
  resolveComments?: ResolveTarget[];
  updatedVerdict?: "approve" | "requestChanges" | "comment" | null;
  updatedReviewComment?: string | null;
}

/**
 * Parse and validate structured reaction output from Claude.
 * Returns null if output is empty, null string, or invalid JSON.
 */
function parseReactionOutput(rawOutput: string): ReactionOutput | null {
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
    reply: (obj.reply as string) ?? "",
    resolveComments: (obj.resolveComments as ResolveTarget[]) ?? [],
    updatedVerdict: (obj.updatedVerdict as ReactionOutput["updatedVerdict"]) ?? null,
    updatedReviewComment: (obj.updatedReviewComment as string | null) ?? null,
  };
}

/**
 * Normalize body for dedup comparison.
 * Trims whitespace and collapses internal whitespace runs.
 */
function normalizeBody(body: string): string {
  return body.trim().replaceAll(/\s+/g, " ");
}

/**
 * Resolve all unresolved bot review threads on a PR.
 * Used when verdict changes to APPROVE — all prior bot comments are considered addressed.
 */
async function resolveAllBotThreads(
  octokit: Parameters<typeof fetchReviewThreads>[0],
  owner: string,
  repo: string,
  pullNumber: number,
  botLogin: string
): Promise<void> {
  const threads = await fetchReviewThreads(octokit, owner, repo, pullNumber);
  const toResolve = threads.filter((t) => !t.isResolved && t.firstCommentAuthor === botLogin);

  for (const thread of toResolve) {
    await resolveThread(octokit, thread.id);
  }

  if (toResolve.length > 0) {
    console.log(`✓ Resolved ${toResolve.length} review thread(s)`);
  }
}

// Main execution
const { octokit, owner, repoName, pullNumber, reviewer } = parseRepoEnv();
const structuredOutput = process.env.STRUCTURED_OUTPUT ?? "";
const commentId = process.env.COMMENT_ID;
const commentPath = process.env.COMMENT_PATH;
const ackOnly = process.env.ACK_ONLY === "true";

// PR-author acknowledgement in a bot-authored thread (issue #111): the model
// step was skipped upstream, so there is no reply to post — just react with 👍
// so the thread shows the bot saw it. A failed reaction must not fail the run.
if (ackOnly) {
  if (commentId) {
    try {
      await octokit.rest.reactions.createForPullRequestReviewComment({
        owner,
        repo: repoName,
        comment_id: Number(commentId),
        content: "+1",
      });
      console.log("✓ Acknowledged PR-author reply with 👍 — no model reply needed");
    } catch (error) {
      console.warn(
        `Failed to add 👍 reaction: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    console.log("ACK_ONLY set but no comment ID — nothing to react to");
  }
  process.exit(0);
}

let output = parseReactionOutput(structuredOutput);

if (!output || !output.reply) {
  // Check if bot already replied during execution (via MCP tools)
  const alreadyReplied = await hasRecentBotReply(
    octokit,
    owner,
    repoName,
    pullNumber,
    reviewer,
    commentId,
    commentPath
  );

  if (alreadyReplied) {
    console.log("✓ Reply already submitted during execution, no action needed");
    process.exit(0);
  }

  // Try execution file fallback (with RUNNER_TEMP fallback path)
  const executionFile =
    process.env.EXECUTION_FILE ||
    (process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/claude-execution-output.json` : undefined);
  const resultText = await readExecutionResult(executionFile);
  if (!resultText) {
    console.error("No structured output, no execution result, and no existing reply found");
    process.exit(1);
  }
  console.log("Structured output missing, falling back to execution result as reply");
  output = {
    reply: resultText,
    resolveComments: [],
    updatedVerdict: null,
    updatedReviewComment: null,
  };
}

// Step 1: Reply to the comment
if (commentPath && commentId) {
  await octokit.rest.pulls.createReplyForReviewComment({
    owner,
    repo: repoName,
    pull_number: pullNumber,
    comment_id: Number(commentId),
    body: output.reply,
  });
  console.log("✓ Replied to review thread");
} else if (commentId) {
  await octokit.rest.issues.createComment({
    owner,
    repo: repoName,
    issue_number: pullNumber,
    body: output.reply,
  });
  console.log("✓ Replied to PR comment");
}

// Step 2: Resolve specified threads
const resolveTargets = output.resolveComments ?? [];

if (resolveTargets.length > 0) {
  const threads = await fetchReviewThreads(octokit, owner, repoName, pullNumber);

  const matchingThreads = resolveTargets
    .map((target) =>
      threads.find(
        (t) =>
          t.path === target.path &&
          t.line === target.line &&
          !t.isResolved &&
          t.firstCommentAuthor === reviewer
      )
    )
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  for (const thread of matchingThreads) {
    await resolveThread(octokit, thread.id);
  }

  if (matchingThreads.length > 0) {
    console.log(`✓ Resolved ${matchingThreads.length} review thread(s)`);
  }
}

// Step 3: Update verdict if changed (with dedup check)
if (output.updatedVerdict && output.updatedReviewComment) {
  const event = verdictToEvent[output.updatedVerdict] ?? "COMMENT";

  // Resolve all bot threads when approving (confirms issues addressed)
  if (event === "APPROVE") {
    await resolveAllBotThreads(octokit, owner, repoName, pullNumber, reviewer);
  }

  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo: repoName,
    pull_number: pullNumber,
  });
  const lastBotReview = reviews
    .filter((r) => r.user?.login === reviewer && r.state !== "PENDING")
    .at(-1);

  if (
    lastBotReview &&
    normalizeBody(lastBotReview.body ?? "") === normalizeBody(output.updatedReviewComment)
  ) {
    console.log("✓ Review already posted, skipping duplicate verdict update");
  } else {
    await deletePendingReviews(octokit, owner, repoName, pullNumber);

    await octokit.rest.pulls.createReview({
      owner,
      repo: repoName,
      pull_number: pullNumber,
      event,
      body: output.updatedReviewComment,
    });

    console.log(`✓ Updated review verdict to ${event}`);
  }
}

console.log("✓ Reaction processed successfully");
