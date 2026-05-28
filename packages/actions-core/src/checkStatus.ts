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

/** Aggregated check status result from both GitHub APIs. */
export interface CheckResult {
  allCompleted: boolean;
  hasFailed: boolean;
  failedNames: string[];
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
