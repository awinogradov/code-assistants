/**
 * Event-driven auto-merge for release PRs.
 *
 * Re-evaluated on every relevant event (check_suite, status, review), the action
 * merges a PR only when ALL of these hold: the head ref matches `^release-`, the
 * PR is open, the repo-root `package.json` opts in via `release.automerge === true`,
 * every sibling check is green, and the review decision is APPROVED. The opt-in is
 * read from the root `package.json` at the triggering head SHA, so the policy
 * travels with the release branch. Any unmet condition or unexpected error is
 * fail-closed — the action never merges on doubt. The merge is pinned to the
 * triggering head SHA so a push that lands mid-evaluation cannot be merged
 * unreviewed.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo HEAD_SHA=abc JOB_NAME=automerge bun run src/automerge.ts
 */
import { fetchCheckStatuses } from "@code-assistants/actions-core/checkStatus";
import { fetchRawContent } from "@code-assistants/actions-core/fetchRawContent";
import { parseRepo } from "@code-assistants/actions-core/parseRepo";
import { readRootRelease } from "@code-assistants/actions-core/releaseField";
import { Octokit } from "@octokit/rest";

/** Minimal PR shape needed to pick the release PR for a commit. */
export interface PrRef {
  number: number;
  state: string;
  head: { ref: string };
}

/** Repository merge-method permission flags. */
export interface MergeMethodFlags {
  allowRebase: boolean;
  allowSquash: boolean;
  allowMerge: boolean;
}

/** A merge method accepted by the GitHub merge API. */
export type MergeMethod = "rebase" | "squash" | "merge";

const releaseBranch = /^release-/;
// Repo-wide auto-merge opt-in lives in the root package.json's `release` object.
const rootPackageJsonPath = "package.json";
// GitHub merge-API responses that mean "nothing to do" rather than a real error:
// 405 not mergeable / already merged, 409 head SHA moved (sha mismatch), 422 unprocessable.
const idempotentMergeStatuses = new Set([405, 409, 422]);

/** Configuration parsed from environment. */
interface AutomergeConfig {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  jobName: string;
}

/** Parse and validate required environment variables, initialize Octokit. */
function parseEnv(): AutomergeConfig {
  const token = process.env.GH_TOKEN;
  const repository = process.env.REPO;
  const headSha = process.env.HEAD_SHA;
  const jobName = process.env.JOB_NAME;

  if (!token || !repository || !headSha || !jobName) {
    throw new Error("Missing required environment variables: GH_TOKEN, REPO, HEAD_SHA, JOB_NAME");
  }

  const { owner, repo } = parseRepo(repository);

  return { octokit: new Octokit({ auth: token }), owner, repo, headSha, jobName };
}

/** Pick the open release PR (head ref `^release-`) from commit-associated PRs. */
export function pickReleasePr(prs: PrRef[]): PrRef | null {
  return prs.find((pr) => pr.state === "open" && releaseBranch.test(pr.head.ref)) ?? null;
}

/** Choose a merge method, preferring rebase then squash then merge. */
export function selectMergeMethod(flags: MergeMethodFlags): MergeMethod | null {
  if (flags.allowRebase) {
    return "rebase";
  }
  if (flags.allowSquash) {
    return "squash";
  }
  if (flags.allowMerge) {
    return "merge";
  }
  return null;
}

/** True only for an explicit APPROVED review decision. */
export function isApprovedDecision(decision: string | null): boolean {
  return decision === "APPROVED";
}

/**
 * Repo-wide auto-merge opt-in: true only when the root `package.json` declares
 * `release.automerge === true`. Any other value — including an absent field —
 * leaves auto-merge disabled, so the action no-ops and a human merges instead.
 */
export function isAutomergeEnabled(rootPackageJson: unknown): boolean {
  return readRootRelease(rootPackageJson).automerge === true;
}

/**
 * Read the root `package.json` at the triggering head SHA and decide whether
 * the repo opted into auto-merge. A missing file is a clean "disabled" (no-op);
 * a malformed file throws so the fail-closed wrapper never merges on doubt.
 */
async function fetchAutomergeOptIn(config: AutomergeConfig): Promise<boolean> {
  const { octokit, owner, repo, headSha } = config;
  const raw = await fetchRawContent({
    octokit,
    owner,
    repo,
    path: rootPackageJsonPath,
    ref: headSha,
  });

  if (raw === null) {
    return false;
  }

  try {
    return isAutomergeEnabled(JSON.parse(raw));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read auto-merge opt-in from ${owner}/${repo}:${rootPackageJsonPath}@${headSha.slice(0, 7)}: ${detail}`
    );
  }
}

/** Fetch the PR's aggregate review decision via GraphQL. */
async function fetchReviewDecision(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string | null> {
  const result = await octokit.graphql<{
    repository: { pullRequest: { reviewDecision: string | null } };
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) { reviewDecision }
      }
    }`,
    { owner, repo, number: pullNumber }
  );

  return result.repository.pullRequest.reviewDecision;
}

/** Read the repository's allowed merge methods. */
async function fetchMergeMethodFlags(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<MergeMethodFlags> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return {
    allowRebase: data.allow_rebase_merge ?? false,
    allowSquash: data.allow_squash_merge ?? false,
    allowMerge: data.allow_merge_commit ?? false,
  };
}

/**
 * Merge the PR, treating an already-merged / moved-head / not-mergeable response
 * as a clean no-op so concurrent events do not error.
 */
async function mergeRelease(config: AutomergeConfig, pullNumber: number): Promise<void> {
  const { octokit, owner, repo, headSha } = config;
  const method = selectMergeMethod(await fetchMergeMethodFlags(octokit, owner, repo));

  if (!method) {
    console.log("Skip: repository allows no merge method");
    return;
  }

  try {
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: method,
      sha: headSha,
    });
    console.log(`✓ Merged PR #${pullNumber} via ${method}`);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status && idempotentMergeStatuses.has(status)) {
      console.log(`Skip: PR #${pullNumber} not mergeable now (HTTP ${status}) — head moved or already merged`);
      return;
    }
    throw error;
  }
}

/** Evaluate the merge gate for the triggering commit and merge when satisfied. */
async function run(config: AutomergeConfig): Promise<void> {
  const { octokit, owner, repo, headSha, jobName } = config;

  const { data: associated } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
    owner,
    repo,
    commit_sha: headSha,
  });
  const pr = pickReleasePr(associated);

  if (!pr) {
    console.log(`Skip: no open release PR for ${headSha.slice(0, 7)}`);
    return;
  }

  if (!(await fetchAutomergeOptIn(config))) {
    console.log(
      "Skip: auto-merge disabled — set release.automerge:true in the root package.json (see docs/release-automerge.md)"
    );
    return;
  }

  const checks = await fetchCheckStatuses(octokit, owner, repo, headSha, jobName);
  if (checks.hasFailed) {
    console.log(`Skip: failed checks — ${checks.failedNames.join(", ")}`);
    return;
  }
  if (!checks.allCompleted) {
    console.log(`Skip: pending checks — ${checks.pendingNames.join(", ")}`);
    return;
  }

  const decision = await fetchReviewDecision(octokit, owner, repo, pr.number);
  if (!isApprovedDecision(decision)) {
    console.log(`Skip: review decision is ${decision ?? "none"}, not APPROVED`);
    return;
  }

  await mergeRelease(config, pr.number);
}

/** Entry point: fail-closed wrapper around the merge gate. */
async function main(): Promise<void> {
  try {
    await run(parseEnv());
  } catch (error) {
    // Fail-closed: never merge on doubt. Surface the error with a non-zero exit.
    console.error("Auto-merge error (no merge performed):", error);
    process.exitCode = 1;
  }
}

// Run only when executed directly (`bun run automerge.ts`), not when imported by tests.
if (import.meta.main) {
  void main();
}
