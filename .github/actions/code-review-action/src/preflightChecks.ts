/**
 * Preflight PR check status polling before AI code review.
 * Polls GitHub Check Runs and Commit Statuses APIs until all sibling checks complete.
 * Skips review and posts a comment if any check has failed or if polling times out.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo PR_NUMBER=123 PR_HEAD_SHA=abc JOB_NAME=review POLL_INTERVAL=10 CHECKS_TIMEOUT=600 PR_AUTHOR=user bun run scripts/preflightChecks.ts
 */
import { appendFile } from "node:fs/promises";

import type { Octokit } from "@octokit/rest";

import { parseRepoEnv } from "./github/githubReview.ts";

/** Aggregated check status result from both GitHub APIs */
interface CheckResult {
  allCompleted: boolean;
  hasFailed: boolean;
  failedNames: string[];
  pendingNames: string[];
}

/** Outcome of the preflight polling loop */
type PreflightOutcome =
  | { status: "passed" }
  | { status: "failed"; failedNames: string[] }
  | { status: "timeout"; pendingNames: string[] };

/** Preflight configuration parsed from environment */
interface PreflightConfig {
  octokit: Octokit;
  owner: string;
  repoName: string;
  pullNumber: number;
  reviewer: string;
  headSha: string;
  jobName: string;
  pollIntervalMs: number;
  timeoutMs: number;
  prAuthor: string;
}

const failedConclusions = new Set(["failure", "timed_out"]);
const failedStatuses = new Set(["failure", "error"]);

/** Parse and validate preflight-specific environment variables. */
function parsePreflightEnv(): PreflightConfig {
  const { octokit, owner, repoName, pullNumber, reviewer } = parseRepoEnv();
  const headSha = process.env.PR_HEAD_SHA;
  const jobName = process.env.JOB_NAME;
  const prAuthor = process.env.PR_AUTHOR ?? "there";

  if (!headSha || !jobName) {
    throw new Error("Missing required environment variables: PR_HEAD_SHA, JOB_NAME");
  }

  const rawInterval = Number(process.env.POLL_INTERVAL);
  const pollIntervalMs =
    (Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 10) * 1000;
  const rawTimeout = Number(process.env.CHECKS_TIMEOUT);
  const timeoutMs = (Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600) * 1000;

  return {
    octokit,
    owner,
    repoName,
    pullNumber,
    reviewer,
    headSha,
    jobName,
    pollIntervalMs,
    timeoutMs,
    prAuthor,
  };
}

/**
 * Normalize name for self-exclusion comparison.
 * Strips non-alphanumeric characters so "code-review" matches "Code Review".
 */
function normalizeCheckName(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/**
 * Deduplicate check runs by name, keeping only the most recent run per name.
 * GitHub's Check Runs API returns all runs including superseded ones from previous pushes.
 * Uses the auto-incrementing `id` field as the recency indicator.
 */
function deduplicateCheckRuns<T extends { id: number; name: string }>(runs: T[]): T[] {
  const latestByName = new Map<string, T>();

  for (const run of runs) {
    const existing = latestByName.get(run.name);
    if (!existing || run.id > existing.id) {
      latestByName.set(run.name, run);
    }
  }

  return [...latestByName.values()];
}

/**
 * Fetch and aggregate check statuses from both Check Runs and Commit Status APIs.
 * Excludes the current job's own check run by normalized name comparison.
 */
async function fetchCheckStatuses(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  jobName: string
): Promise<CheckResult> {
  const normalizedJobName = normalizeCheckName(jobName);

  const [checkRuns, commitStatus] = await Promise.all([
    octokit.paginate(octokit.rest.checks.listForRef, { owner, repo, ref, per_page: 100 }),
    octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref }),
  ]);

  const allSiblingRuns = checkRuns.filter(
    (run) => normalizeCheckName(run.name) !== normalizedJobName
  );
  const nonCancelledRuns = allSiblingRuns.filter((run) => run.conclusion !== "cancelled");
  const siblingRuns = deduplicateCheckRuns(nonCancelledRuns);

  const siblingNames = new Set(siblingRuns.map((run) => run.name));
  const cancelledOnlyNames = [...new Set(allSiblingRuns.map((run) => run.name))].filter(
    (name) => !siblingNames.has(name)
  );

  const pendingRuns = [
    ...siblingRuns.filter((run) => run.status !== "completed").map((run) => run.name),
    ...cancelledOnlyNames,
  ];
  const failedRuns = siblingRuns
    .filter((run) => run.status === "completed" && failedConclusions.has(run.conclusion ?? ""))
    .map((run) => run.name);

  const pendingStatuses = commitStatus.data.statuses
    .filter((s) => s.state === "pending")
    .map((s) => s.context);
  const failedCommitStatuses = commitStatus.data.statuses
    .filter((s) => failedStatuses.has(s.state))
    .map((s) => s.context);

  const allPending = [...pendingRuns, ...pendingStatuses];
  const allFailed = [...failedRuns, ...failedCommitStatuses];

  return {
    allCompleted: allPending.length === 0,
    hasFailed: allFailed.length > 0,
    failedNames: allFailed,
    pendingNames: allPending,
  };
}

/**
 * Poll until all sibling checks complete or timeout is reached.
 * Logs progress on each tick with pending check names and elapsed time.
 */
async function pollUntilComplete(config: PreflightConfig): Promise<PreflightOutcome> {
  const { octokit, owner, repoName, headSha, jobName, pollIntervalMs, timeoutMs } = config;
  let elapsed = 0;

  while (elapsed < timeoutMs) {
    const result = await fetchCheckStatuses(octokit, owner, repoName, headSha, jobName);

    if (result.hasFailed) {
      return { status: "failed", failedNames: result.failedNames };
    }
    if (result.allCompleted) {
      return { status: "passed" };
    }

    const elapsedSec = Math.round(elapsed / 1000);
    const timeoutSec = Math.round(timeoutMs / 1000);
    console.log(
      `Waiting for checks: ${result.pendingNames.join(", ")}... (${elapsedSec}s / ${timeoutSec}s)`
    );

    await Bun.sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
  }

  const finalResult = await fetchCheckStatuses(octokit, owner, repoName, headSha, jobName);

  if (finalResult.hasFailed) {
    return { status: "failed", failedNames: finalResult.failedNames };
  }
  if (finalResult.allCompleted) {
    return { status: "passed" };
  }

  return { status: "timeout", pendingNames: finalResult.pendingNames };
}

/** Build sarcastic comment for failed checks. */
function buildFailureComment(author: string, failedNames: string[]): string {
  const list = failedNames.map((name) => `- ${name}`).join("\n");

  return `@${author}, I see red flags 🚩

These checks have failed:
${list}

Fix all of them before asking anybody to review. Or move your PR to draft. Do what your heart says 💅

_Code Review skipped 😢_`;
}

/** Build comment for polling timeout. */
function buildTimeoutComment(author: string, pendingNames: string[], timeoutMin: number): string {
  const list = pendingNames.map((name) => `- ${name}`).join("\n");

  return `@${author}, I've been waiting for your checks for ${timeoutMin} minutes and they still haven't finished ⏰

Still pending:
${list}

I have better things to do than wait around. Fix your CI and re-request review when you're ready 💅

_Code Review skipped 😢_`;
}

/** Normalize comment body for dedup comparison. */
function normalizeBody(body: string): string {
  return body.trim().replaceAll(/\s+/g, " ");
}

/**
 * Post a skip comment to the PR with dedup check.
 * Fetches recent bot comments and skips if the same comment already exists.
 */
async function postSkipComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  reviewer: string,
  body: string
): Promise<void> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 5,
    direction: "desc",
  });

  const lastBotComment = comments.find((c) => c.user?.login === reviewer);
  if (lastBotComment && normalizeBody(lastBotComment.body ?? "") === normalizeBody(body)) {
    console.log("✓ Skip comment already posted, skipping duplicate");
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  console.log("✓ Posted skip comment to PR");
}

/** Write output to GITHUB_OUTPUT file. */
async function writeOutput(key: string, value: string): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    await appendFile(outputFile, `${key}=${value}\n`);
  }
}

// Main execution
try {
  const config = parsePreflightEnv();
  console.log(
    `Preflight: polling checks for ${config.headSha.slice(0, 7)} every ${config.pollIntervalMs / 1000}s (timeout: ${config.timeoutMs / 1000}s)`
  );

  const outcome = await pollUntilComplete(config);

  if (outcome.status === "passed") {
    console.log("✓ All checks passed, proceeding with review");
    await writeOutput("skip_review", "false");
  } else if (outcome.status === "failed") {
    console.log(`✗ Failed checks: ${outcome.failedNames.join(", ")}`);
    const comment = buildFailureComment(config.prAuthor, outcome.failedNames);
    await postSkipComment(
      config.octokit,
      config.owner,
      config.repoName,
      config.pullNumber,
      config.reviewer,
      comment
    );
    await writeOutput("skip_review", "true");
  } else {
    const timeoutMin = Math.round(config.timeoutMs / 60_000);
    console.log(`✗ Timeout after ${timeoutMin}min, pending: ${outcome.pendingNames.join(", ")}`);
    const comment = buildTimeoutComment(config.prAuthor, outcome.pendingNames, timeoutMin);
    await postSkipComment(
      config.octokit,
      config.owner,
      config.repoName,
      config.pullNumber,
      config.reviewer,
      comment
    );
    await writeOutput("skip_review", "true");
  }
} catch (error) {
  console.error("Preflight check error (fail-open, proceeding with review):", error);
  await writeOutput("skip_review", "false");
}
