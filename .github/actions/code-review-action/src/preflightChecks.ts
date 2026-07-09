/**
 * Preflight PR check status polling before AI code review.
 * Polls GitHub Check Runs and Commit Statuses APIs until all sibling checks complete.
 * Skips review and posts a comment if any check has failed. On a polling timeout it
 * posts a comment and fails the job — checks never converged, so a green review
 * result would be misleading.
 *
 * On failed checks this step does NOT post the skip comment itself: it emits the
 * failed checks plus an "explain" prompt as step outputs, and the separate
 * `runClaude` explain step + `preflightSkipComment.ts` post step assemble and
 * post the enriched comment (mirroring the review/react flow). The timeout path,
 * which makes no model call, posts its comment inline here and then fails the job.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo PR_NUMBER=123 PR_HEAD_SHA=abc JOB_NAME=review POLL_INTERVAL=10 CHECKS_TIMEOUT=600 PR_AUTHOR=user bun run scripts/preflightChecks.ts
 */
import {
  fetchCheckStatuses,
  pollCheckStatuses,
  type FailedCheck,
} from "@code-assistants/actions-core/checkStatus";
import type { Octokit } from "@octokit/rest";

import { setOutput } from "./actionsOutput.ts";
import { parseRepoEnv } from "./github/githubReview.ts";
import { buildExplainPrompt, fetchFailureContext, postSkipComment } from "./skipComment.ts";

/** Outcome of the preflight polling loop */
type PreflightOutcome =
  | { status: "passed" }
  | { status: "failed"; failed: FailedCheck[] }
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
 * Poll until all sibling checks complete or timeout is reached.
 * Logs progress on each tick with pending check names and elapsed time.
 */
async function pollUntilComplete(config: PreflightConfig): Promise<PreflightOutcome> {
  const { octokit, owner, repoName, headSha, jobName, pollIntervalMs, timeoutMs } = config;
  const timeoutSec = Math.round(timeoutMs / 1000);

  const result = await pollCheckStatuses(
    () => fetchCheckStatuses(octokit, owner, repoName, headSha, jobName),
    {
      pollIntervalMs,
      timeoutMs,
      onPending: (pendingNames, elapsedMs) =>
        console.log(
          `Waiting for checks: ${pendingNames.join(", ")}... (${Math.round(elapsedMs / 1000)}s / ${timeoutSec}s)`,
        ),
    },
  );

  if (result.hasFailed) {
    return { status: "failed", failed: result.failed };
  }
  if (result.allCompleted) {
    return { status: "passed" };
  }

  return { status: "timeout", pendingNames: result.pendingNames };
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

/**
 * Fetch failure annotations, build the explain prompt, and emit the outputs the
 * separate `runClaude` explain step consumes. `explain` is set to `true` only
 * when at least one failed check carries annotations (so there is something to
 * explain) and the prompt is written; otherwise the explain step is skipped and
 * the comment degrades to links-only — a skip is never blocked on the enhancement.
 */
async function emitExplainContext(config: PreflightConfig, failed: FailedCheck[]): Promise<void> {
  try {
    const context = await fetchFailureContext(
      config.octokit,
      config.owner,
      config.repoName,
      failed,
    );
    if (Object.keys(context).length === 0) {
      await setOutput("explain", "false");
      return;
    }

    const prompt = buildExplainPrompt(failed, context);
    const promptFile = `${process.env.RUNNER_TEMP ?? "/tmp"}/preflight-explain-prompt.txt`;
    await Bun.write(promptFile, prompt);
    await setOutput("explain_prompt_file", promptFile);
    await setOutput("explain", "true");
  } catch (error) {
    // Fail open: never block a skip on the enhancement. Log error.message only —
    // not the raw response/headers — so auth material can't leak into public logs.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Preflight explain context failed::${message}`);
    await setOutput("explain", "false");
  }
}

// Main execution
try {
  const config = parsePreflightEnv();
  console.log(
    `Preflight: polling checks for ${config.headSha.slice(0, 7)} every ${config.pollIntervalMs / 1000}s (timeout: ${config.timeoutMs / 1000}s)`,
  );

  const outcome = await pollUntilComplete(config);

  if (outcome.status === "passed") {
    console.log("✓ All checks passed, proceeding with review");
    await setOutput("skip_review", "false");
  } else if (outcome.status === "failed") {
    const { failed } = outcome;
    console.log(`✗ Failed checks: ${failed.map((f) => f.name).join(", ")}`);
    await setOutput("skip_review", "true");
    await setOutput("has_failures", "true");
    await setOutput("failed_json", JSON.stringify(failed));
    await emitExplainContext(config, failed);
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
      comment,
    );
    await setOutput("skip_review", "true");
    // A checks timeout means CI never converged, so the review could not run — fail
    // the job instead of reporting a misleading green. Set process.exitCode rather
    // than throwing (a throw hits the fail-open catch below and would proceed with
    // review) or calling process.exit (which would cut off pending log flushes).
    console.log(
      `::error title=Preflight checks timed out::${outcome.pendingNames.length} check(s) still pending after ${timeoutMin}min`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  // Fail open so a preflight glitch never blocks review — but surface it as a
  // GitHub Actions warning annotation so the silent proceed is visible in the run.
  const message = error instanceof Error ? error.message : String(error);
  console.log(`::warning title=Preflight failed open::${message}`);
  console.error("Preflight check error (fail-open, proceeding with review):", error);
  await setOutput("skip_review", "false");
}
