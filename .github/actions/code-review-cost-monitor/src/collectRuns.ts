/**
 * Collect per-run review metrics from the run-summary footers of recent PR
 * reviews.
 *
 * Walks pull requests by `updated` descending and stops paginating once a page
 * falls fully outside the lookback window, then parses every review body via
 * `parseFooterMetrics`. The Octokit instance is injected so tests mock it;
 * `createRetryingOctokit` wires `@octokit/plugin-retry` so a transient 5xx or
 * secondary rate limit doesn't redden a scheduled run. Failure semantics are
 * deliberate: an API error (after retries) throws, and so does a scan that
 * found reviews but parsed zero footers — a silently-empty dataset would read
 * as "no regression".
 *
 * @example
 * const octokit = createRetryingOctokit(token);
 * const { runs, scannedReviews } = await collectRuns(octokit, {
 *   owner, repo, lookbackDays: 30, now: new Date(),
 * });
 */
import { retry } from "@octokit/plugin-retry";
import { Octokit } from "@octokit/rest";

import type { RunMetrics } from "./footerMetrics.ts";
import { parseFooterMetrics } from "./footerMetrics.ts";

/** One parsed review run, anchored to its PR and submission time. */
export interface RunRecord extends RunMetrics {
  prNumber: number;
  /** ISO timestamp the review was submitted at. */
  submittedAt: string;
  additions: number;
  deletions: number;
}

/** Collection result; `scannedReviews` lets the report show coverage. */
export interface CollectedRuns {
  runs: RunRecord[];
  scannedReviews: number;
}

/** Parameters bounding one collection pass. */
export interface CollectParams {
  owner: string;
  repo: string;
  lookbackDays: number;
  /** Injected clock so the window cutoff is testable. */
  now: Date;
}

/** Build an authenticated Octokit with transient-failure retries wired in. */
export function createRetryingOctokit(token: string): Octokit {
  const RetryingOctokit = Octokit.plugin(retry);
  return new RetryingOctokit({ auth: token });
}

/**
 * Scrape the run-summary footers of all reviews submitted inside the lookback
 * window. Throws on API failure and on the parser-drift tripwire (reviews
 * scanned, zero footers parsed).
 */
export async function collectRuns(octokit: Octokit, params: CollectParams): Promise<CollectedRuns> {
  const { owner, repo, lookbackDays, now } = params;
  const cutoffMs = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;

  // sort: "updated" descending lets done() stop as soon as a page falls fully
  // outside the window — plain pagination would walk the entire PR history.
  const prs = await octokit.paginate(
    octokit.rest.pulls.list,
    { owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 100 },
    (response, done) => {
      const inWindow = response.data.filter((pr) => Date.parse(pr.updated_at) >= cutoffMs);
      if (inWindow.length < response.data.length) done();
      return inWindow;
    },
  );

  const runs: RunRecord[] = [];
  let scannedReviews = 0;

  for (const pr of prs) {
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });
    scannedReviews += reviews.length;

    const parsed = reviews.flatMap((review) => {
      if (!review.submitted_at || Date.parse(review.submitted_at) < cutoffMs) return [];
      const metrics = parseFooterMetrics(review.body);
      return metrics ? [{ metrics, submittedAt: review.submitted_at }] : [];
    });
    if (parsed.length === 0) continue;

    // pulls.list payloads omit additions/deletions; one pulls.get per matched
    // PR keeps the fan-out bounded by the lookback window.
    const { data: details } = await octokit.rest.pulls.get({ owner, repo, pull_number: pr.number });
    for (const { metrics, submittedAt } of parsed) {
      runs.push({
        ...metrics,
        prNumber: pr.number,
        submittedAt,
        additions: details.additions,
        deletions: details.deletions,
      });
    }
  }

  if (scannedReviews > 0 && runs.length === 0) {
    throw new Error(
      `No run-summary footers parsed from ${scannedReviews} reviews in the last ` +
        `${lookbackDays} days — the footer format may have changed (see runSummaryFooter.ts).`,
    );
  }

  return { runs, scannedReviews };
}
