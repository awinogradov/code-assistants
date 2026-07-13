/**
 * Collect per-run review metrics from the run-summary footers of recent PR
 * reviews.
 *
 * Walks pull requests by `updated` descending and stops paginating once a page
 * falls fully outside the lookback window, then parses every review body via
 * `parseFooterMetrics`. The Octokit instance is injected so tests mock it; build
 * it with actions-core's `createOctokit`, which wires `@octokit/plugin-retry` so
 * a transient 5xx or secondary rate limit doesn't redden a scheduled run. Failure
 * semantics are deliberate: an API error (after retries) throws, and so does a
 * scan where at least `minRuns` reviews carry a run-summary data comment yet none
 * parse — genuine format drift. A window with too few footers to judge degrades to
 * an empty result instead, mirroring the `minRuns` gate, so a newly-adopting or
 * quiet repo never reddens its scheduled run.
 *
 * @example
 * const octokit = createOctokit(token);
 * const { runs, scannedReviews } = await collectRuns(octokit, {
 *   owner, repo, lookbackDays: 30, now: new Date(), minRuns: 8,
 * });
 */
import type { Octokit } from "@octokit/rest";

import type { RunMetrics } from "./footerMetrics.ts";
import { hasRunSummaryData, parseFooterMetrics } from "./footerMetrics.ts";

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
  /**
   * Minimum data-bearing reviews before the drift tripwire arms; below it a
   * zero-parse scan reads as insufficient footer history, not drift. Mirrors
   * the monitor's `minRuns` threshold.
   */
  minRuns: number;
}

/**
 * Thrown by the parser-drift tripwire: at least `minRuns` reviews carried a
 * run-summary data comment yet none parsed — genuine format drift. The message
 * stays static (stable error-tracker grouping); the data-bearing count rides
 * along as a context property.
 */
export class FooterDriftError extends Error {
  constructor(
    readonly dataBearingReviews: number,
    readonly lookbackDays: number,
  ) {
    super(
      "No run-summary footers parsed — the footer format may have changed (see runSummaryFooter.ts)",
    );
    this.name = "FooterDriftError";
  }
}

/**
 * Scrape the run-summary footers of all reviews submitted inside the lookback
 * window. Throws on API failure and on the parser-drift tripwire (at least
 * `minRuns` reviews carry a data comment, yet none parse).
 */
export async function collectRuns(octokit: Octokit, params: CollectParams): Promise<CollectedRuns> {
  const { owner, repo, lookbackDays, now, minRuns } = params;
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
  let dataBearingReviews = 0;

  for (const pr of prs) {
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });
    scannedReviews += reviews.length;
    dataBearingReviews += reviews.filter(
      (review) =>
        review.submitted_at &&
        Date.parse(review.submitted_at) >= cutoffMs &&
        hasRunSummaryData(review.body),
    ).length;

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

  if (dataBearingReviews >= minRuns && runs.length === 0) {
    throw new FooterDriftError(dataBearingReviews, lookbackDays);
  }

  return { runs, scannedReviews };
}
