/**
 * Post the preflight skip comment for failed checks (the skip path's final step).
 *
 * Reads the failed checks emitted by `preflightChecks.ts`, the AI failure
 * reasons (`runClaude`'s `structured_output`), and the run summary
 * (`runClaude`'s `run_summary`), assembles the "red flags" comment — each failed
 * check as a log link with its one-line reason blockquote, closing with the
 * shared run-summary footer — and posts it with footer-aware dedup.
 *
 * Fail-open by construction: the explain step is `continue-on-error`, so this
 * step always runs (gated only on `has_failures`). With no reasons the comment
 * degrades to links only; with no summary it carries no footer; any error here
 * is logged and swallowed so a skip is never blocked.
 *
 * @example
 * REPO=o/r PR_NUMBER=1 REVIEWER=bot PR_AUTHOR=octocat FAILED_JSON='[...]' \
 *   STRUCTURED_OUTPUT='{"reasons":[...]}' RUN_SUMMARY='{...}' bun run scripts/preflightSkipComment.ts
 */
import type { FailedCheck } from "@code-assistants/actions-core/checkStatus";
import { z } from "zod";

import { parseRepoEnv } from "./github/githubReview.ts";
import { buildSkipCommentBody, postSkipComment } from "./skipComment.ts";

/** Schema for the `FAILED_JSON` step output: the failed checks carried from preflight. */
const failedSchema = z.array(
  z.object({ name: z.string(), url: z.string().nullable(), checkRunId: z.number().nullable() }),
);

/** Parse `FAILED_JSON`; fails open to `[]` so a malformed value never blocks the skip. */
function parseFailed(raw: string | undefined): FailedCheck[] {
  if (!raw) return [];

  try {
    const result = failedSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

try {
  const { octokit, owner, repoName, pullNumber, reviewer } = parseRepoEnv();
  const author = process.env.PR_AUTHOR ?? "there";
  const failed = parseFailed(process.env.FAILED_JSON);

  if (failed.length === 0) {
    console.log("No failed checks to post, skipping");
  } else {
    const body = buildSkipCommentBody(
      author,
      failed,
      process.env.STRUCTURED_OUTPUT,
      process.env.RUN_SUMMARY,
    );
    await postSkipComment(octokit, owner, repoName, pullNumber, reviewer, body);
  }
} catch (error) {
  // Fail open: a glitch posting the enriched comment must never fail the job.
  const message = error instanceof Error ? error.message : String(error);
  console.log(`::warning title=Post skip comment failed::${message}`);
}
