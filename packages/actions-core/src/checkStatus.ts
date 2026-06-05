/**
 * Shared PR check-status aggregation across the repository's GitHub Actions.
 *
 * Merges GitHub's two independent signals for a commit — Check Runs
 * (`checks.listForRef`) and Commit Statuses (`repos.getCombinedStatusForRef`) —
 * into a single verdict, deduplicating superseded check runs and excluding the
 * caller's own check by normalized name. Used by `code-review-action`'s
 * preflight poll loop and by `release-automerge`'s one-shot merge gate.
 *
 * @example
 *   const result = await fetchCheckStatuses(octokit, owner, repo, headSha, jobName);
 *   if (result.hasFailed || !result.allCompleted) return; // not green yet
 */
import type { Octokit } from "@octokit/rest";

/**
 * A single failed check, carrying a link to its run log so consumers can render
 * an actionable reference instead of a bare name.
 */
export interface FailedCheck {
  /** Display name: a check-run name or a commit-status context. */
  name: string;
  /**
   * Link to the failing run's logs — a check-run `details_url`/`html_url`, or a
   * commit-status `target_url`. Null when GitHub exposes none.
   */
  url: string | null;
  /** Check-run id for fetching annotations; null for commit statuses (no annotations). */
  checkRunId: number | null;
}

/** Aggregated check status result from both GitHub APIs. */
export interface CheckResult {
  allCompleted: boolean;
  hasFailed: boolean;
  failed: FailedCheck[];
  pendingNames: string[];
}

const failedConclusions = new Set(["failure", "timed_out"]);
const failedStatuses = new Set(["failure", "error"]);

/**
 * Normalize a check name for self-exclusion comparison.
 * Strips non-alphanumeric characters so "code-review" matches "Code Review".
 */
export function normalizeCheckName(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/**
 * Deduplicate check runs by name, keeping only the most recent run per name.
 * GitHub's Check Runs API returns all runs including superseded ones from previous pushes.
 * Uses the auto-incrementing `id` field as the recency indicator.
 */
export function deduplicateCheckRuns<T extends { id: number; name: string }>(runs: T[]): T[] {
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
export async function fetchCheckStatuses(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  jobName: string,
): Promise<CheckResult> {
  const normalizedJobName = normalizeCheckName(jobName);

  const [checkRuns, commitStatus] = await Promise.all([
    octokit.paginate(octokit.rest.checks.listForRef, { owner, repo, ref, per_page: 100 }),
    octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref }),
  ]);

  const allSiblingRuns = checkRuns.filter(
    (run) => normalizeCheckName(run.name) !== normalizedJobName,
  );
  // A cancelled run carries no pass/fail/pending signal (e.g. a path-filter-skipped
  // job, or a run superseded by a newer push). Excluding cancelled runs entirely —
  // rather than treating a cancelled-only check as pending — keeps a permanently
  // cancelled check from blocking the gate forever. The one-shot merge gate has no
  // poll loop to recover, and GitHub's merge API still enforces genuinely required
  // checks regardless.
  const siblingRuns = deduplicateCheckRuns(
    allSiblingRuns.filter((run) => run.conclusion !== "cancelled"),
  );

  const pendingRuns = siblingRuns
    .filter((run) => run.status !== "completed")
    .map((run) => run.name);
  const failedRuns = siblingRuns
    .filter((run) => run.status === "completed" && failedConclusions.has(run.conclusion ?? ""))
    .map((run) => ({
      name: run.name,
      url: run.details_url ?? run.html_url ?? null,
      checkRunId: run.id,
    }));

  const pendingStatuses = commitStatus.data.statuses
    .filter((s) => s.state === "pending")
    .map((s) => s.context);
  const failedCommitStatuses = commitStatus.data.statuses
    .filter((s) => failedStatuses.has(s.state))
    .map((s) => ({ name: s.context, url: s.target_url ?? null, checkRunId: null }));

  const allPending = [...pendingRuns, ...pendingStatuses];
  const allFailed: FailedCheck[] = [...failedRuns, ...failedCommitStatuses];

  return {
    allCompleted: allPending.length === 0,
    hasFailed: allFailed.length > 0,
    failed: allFailed,
    pendingNames: allPending,
  };
}

/** Options for {@link pollCheckStatuses}. */
export interface PollCheckOptions {
  /** Delay between polls, in milliseconds. */
  pollIntervalMs: number;
  /** Wall-clock budget before giving up, in milliseconds. */
  timeoutMs: number;
  /** Sleep implementation; injected in tests. Defaults to a `setTimeout` promise. */
  sleep?: (ms: number) => Promise<void>;
  /** Monotonic clock in milliseconds; injected in tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Invoked once per still-pending tick before sleeping (e.g. to log progress). */
  onPending?: (pendingNames: string[], elapsedMs: number) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Poll a {@link CheckResult} source until checks fail, all complete, or the
 * timeout elapses. Elapsed time is measured on a wall clock (`now()`), so the
 * latency of each status fetch counts toward the cap — the loop cannot overrun
 * the budget by the aggregate fetch time. Returns the final result; the caller
 * decides how to treat a still-pending (timed-out) result.
 *
 * `fetchStatus`, `sleep`, and `now` are injectable so the loop is testable
 * without real timers or a GitHub client.
 *
 * @example
 *   const result = await pollCheckStatuses(
 *     () => fetchCheckStatuses(octokit, owner, repo, sha, jobName),
 *     { pollIntervalMs: 15_000, timeoutMs: 480_000 },
 *   );
 */
export async function pollCheckStatuses(
  fetchStatus: () => Promise<CheckResult>,
  options: PollCheckOptions,
): Promise<CheckResult> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const start = now();

  let result = await fetchStatus();
  let elapsed = now() - start;
  while (!result.hasFailed && !result.allCompleted && elapsed < options.timeoutMs) {
    options.onPending?.(result.pendingNames, elapsed);
    await sleep(options.pollIntervalMs);
    result = await fetchStatus();
    elapsed = now() - start;
  }

  return result;
}
