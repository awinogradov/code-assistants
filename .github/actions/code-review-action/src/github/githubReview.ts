/**
 * Shared GitHub review operations for PR review submission and comment reaction scripts.
 * Provides review thread fetching, resolution, and Octokit initialization.
 *
 * @example
 * import { fetchReviewThreads, resolveThread, parseRepoEnv } from "./github/githubReview.ts";
 */
import { createOctokit } from "@code-assistants/actions-core/createOctokit";
import type { Octokit } from "@octokit/rest";

import { stripReviewTips } from "../reviewTip.ts";
import { stripLegacyUsageHint, stripRunSummaryFooter } from "../runSummaryFooter.ts";

/** GitHub PR review event type */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/** Flattened review thread from GraphQL response */
export interface ReviewThread {
  id: string;
  path: string;
  line: number | null;
  isOutdated: boolean;
  isResolved: boolean;
  firstCommentAuthor: string | null;
  firstCommentBody: string;
  firstCommentReviewId: string | null;
}

/** Parsed repository environment configuration */
export interface RepoEnv {
  octokit: Octokit;
  owner: string;
  repoName: string;
  pullNumber: number;
  reviewer: string;
}

/** Single review-thread node as returned by the GraphQL query */
interface ReviewThreadNode {
  id: string;
  path: string;
  line: number | null;
  isOutdated: boolean;
  isResolved: boolean;
  comments: {
    nodes: Array<{
      author: { login: string } | null;
      body: string;
      pullRequestReview: { id: string } | null;
    }>;
  };
}

/** GraphQL response shape for review threads query */
interface ReviewThreadsResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: ReviewThreadNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
}

/** Maps verdict string to GitHub review event */
export const verdictToEvent: Record<string, ReviewEvent> = {
  approve: "APPROVE",
  requestChanges: "REQUEST_CHANGES",
  comment: "COMMENT",
};

/**
 * Normalize a review/comment body for dedup comparison. Strips per-line trailing
 * whitespace and collapses 3+ consecutive newlines to two, but preserves line
 * breaks — so bodies that differ structurally are NOT treated as identical (the
 * old collapse-all-whitespace approach silently dropped genuinely different reviews).
 */
export function normalizeBody(body: string): string {
  return body
    .replaceAll(/[ \t]+$/gm, "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Canonical dedup key for review-body comparison: strips the run-varying
 * summary footer, any review-tip block, and the retired always-on usage hint
 * still present in pre-hotfix review bodies, then normalizes whitespace — so
 * two reviews differing only in metrics, a rolled tip, or the legacy hint
 * compare as identical. Tip blocks are consumed whole (marker-shaped) before
 * the legacy matcher runs. Every duplicate-suppression comparison must go
 * through this one composition — a site applying its own subset silently
 * defeats dedup.
 */
export function reviewDedupKey(body: string): string {
  return normalizeBody(stripLegacyUsageHint(stripRunSummaryFooter(stripReviewTips(body))));
}

/** Minimal shape of a submitted review needed for dedup comparison. */
export interface BotReviewSummary {
  body: string | null;
  state?: string;
}

/**
 * Return the most recent non-pending review authored by the bot, or undefined.
 * Used both for the initial dedup check and the last-write guard re-read
 * immediately before submitting, which narrows the concurrent-duplicate window.
 */
export async function getLastBotReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewer: string
): Promise<BotReviewSummary | undefined> {
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: pullNumber,
  });
  return reviews.filter((r) => r.user?.login === reviewer && r.state !== "PENDING").at(-1);
}

/**
 * All non-pending review bodies the bot has posted on a PR, oldest first.
 * Paginates past the 30-per-page default so the review-tip no-repeat guard
 * sees every prior tip marker even on long-lived PRs.
 */
export async function listBotReviewBodies(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewer: string
): Promise<string[]> {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  return reviews
    .filter((review) => review.user?.login === reviewer && review.state !== "PENDING")
    .map((review) => review.body ?? "");
}

/**
 * Parse and validate required environment variables, initialize Octokit.
 * Throws if GH_TOKEN, REPO, PR_NUMBER, or REVIEWER are missing or invalid.
 */
export function parseRepoEnv(): RepoEnv {
  const token = process.env.GH_TOKEN;
  const repo = process.env.REPO;
  const prNumber = process.env.PR_NUMBER;
  const reviewer = process.env.REVIEWER;

  if (!token || !repo || !prNumber || !reviewer) {
    throw new Error("Missing required environment variables: GH_TOKEN, REPO, PR_NUMBER, REVIEWER");
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid REPO format: ${repo}. Expected owner/repo`);
  }

  return {
    octokit: createOctokit(token),
    owner,
    repoName,
    pullNumber: Number(prNumber),
    reviewer,
  };
}

/** Flatten a GraphQL review-thread node into a {@link ReviewThread}. */
function mapThreadNode(node: ReviewThreadNode): ReviewThread {
  return {
    id: node.id,
    path: node.path,
    line: node.line,
    isOutdated: node.isOutdated,
    isResolved: node.isResolved,
    firstCommentAuthor: node.comments.nodes[0]?.author?.login ?? null,
    firstCommentBody: node.comments.nodes[0]?.body ?? "",
    firstCommentReviewId: node.comments.nodes[0]?.pullRequestReview?.id ?? null,
  };
}

/** Fetch a single page of review threads. Explicit return type pins inference. */
async function fetchReviewThreadPage(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  cursor: string | null
): Promise<ReviewThreadsResponse> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100, after: $cursor) {
            nodes {
              id
              path
              line
              isOutdated
              isResolved
              comments(first: 1) {
                nodes {
                  author { login }
                  body
                  pullRequestReview { id }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `;

  return octokit.graphql<ReviewThreadsResponse>(query, { owner, repo, number: pullNumber, cursor });
}

/**
 * Fetch all review threads for a PR via GraphQL, paginating past the 100-node
 * page so long-lived PRs don't silently drop threads from resolution logic.
 */
export async function fetchReviewThreads(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ReviewThread[]> {
  const threads: ReviewThread[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: ReviewThreadsResponse = await fetchReviewThreadPage(
      octokit,
      owner,
      repo,
      pullNumber,
      cursor
    );
    const { reviewThreads } = page.repository.pullRequest;
    threads.push(...reviewThreads.nodes.map(mapThreadNode));
    if (!reviewThreads.pageInfo.hasNextPage) break;
    cursor = reviewThreads.pageInfo.endCursor;
  }

  return threads;
}

/**
 * Resolve a single review thread by its GraphQL node ID.
 */
export async function resolveThread(octokit: Octokit, threadId: string): Promise<void> {
  await octokit.graphql(
    `
      mutation($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread { isResolved }
        }
      }
    `,
    { threadId }
  );
}

/**
 * Unresolve a single review thread by its GraphQL node ID.
 * Used to reopen threads that GitHub auto-resolves on APPROVE reviews.
 */
export async function unresolveThread(octokit: Octokit, threadId: string): Promise<void> {
  await octokit.graphql(
    `
      mutation($threadId: ID!) {
        unresolveReviewThread(input: { threadId: $threadId }) {
          thread { isResolved }
        }
      }
    `,
    { threadId }
  );
}

/**
 * Delete all pending reviews for a PR to avoid GitHub's single-pending-review limit.
 */
export async function deletePendingReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<void> {
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const pendingReviews = reviews.filter((r) => r.state === "PENDING");

  for (const review of pendingReviews) {
    console.log(`Deleting pending review ${review.id}...`);
    await octokit.rest.pulls.deletePendingReview({
      owner,
      repo,
      pull_number: pullNumber,
      review_id: review.id,
    });
  }
}

/**
 * Read Claude's plain text result from the execution output file.
 * Falls back gracefully: returns null if file is missing, unreadable, or lacks a result message.
 *
 * @param filePath - Path to the execution output JSON file
 * @see https://docs.anthropic.com/en/docs/agent-sdk/typescript - SDKResultMessage
 */
export async function readExecutionResult(filePath: string | undefined): Promise<string | null> {
  if (!filePath) {
    return null;
  }

  try {
    const data: unknown = await Bun.file(filePath).json();
    const messages = Array.isArray(data) ? data : [data];
    const resultMessage = messages.findLast(
      (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>).type === "result"
    ) as Record<string, unknown> | undefined;
    const result = resultMessage?.result;
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

/**
 * Check if the bot already submitted a review on the current PR head commit.
 * Detects reviews submitted during Claude's execution via MCP tools when structured output is missing.
 *
 * @param headSha - Current PR head commit SHA for commit-level matching
 */
export async function hasRecentBotReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewer: string,
  headSha?: string
): Promise<boolean> {
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const lastBotReview = reviews
    .filter((r) => r.user?.login === reviewer && r.state !== "PENDING")
    .at(-1);

  if (!lastBotReview) {
    return false;
  }

  if (headSha) {
    return lastBotReview.commit_id === headSha;
  }

  return true;
}

/**
 * Check if the bot already replied to a specific comment.
 * Detects replies submitted during Claude's execution via MCP tools when structured output is missing.
 */
export async function hasRecentBotReply(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewer: string,
  commentId?: string,
  commentPath?: string
): Promise<boolean> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  if (commentPath && commentId) {
    const { data: comments } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      since,
    });
    return comments.some(
      (c) => c.in_reply_to_id === Number(commentId) && c.user?.login === reviewer
    );
  }

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
    since,
  });
  return comments.some((c) => c.user?.login === reviewer);
}
