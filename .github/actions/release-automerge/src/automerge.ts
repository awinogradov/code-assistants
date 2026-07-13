/**
 * Event-driven auto-merge for release PRs.
 *
 * Re-evaluated on every relevant event (check_suite, status, review), the action
 * merges a PR only when ALL of these hold: the head ref matches `^release-`, the
 * PR is open, the releasing member opts in via `release.automerge === true`
 * (the member's own `package.json` overrides the root default), every sibling
 * check is green, and the review decision is APPROVED. The opt-in is read at the
 * triggering head SHA, so the policy travels with the release branch. Any unmet
 * condition or unexpected error is fail-closed — the action never merges on
 * doubt. The merge is pinned to the triggering head SHA so a push that lands
 * mid-evaluation cannot be merged unreviewed.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo HEAD_SHA=abc JOB_NAME=automerge bun run src/automerge.ts
 */
import { fetchCheckStatuses, pollCheckStatuses } from "@code-assistants/actions-core/checkStatus";
import { createOctokit } from "@code-assistants/actions-core/createOctokit";
import { fetchRawContent } from "@code-assistants/actions-core/fetchRawContent";
import { parseRepo } from "@code-assistants/actions-core/parseRepo";
import { readRootRelease } from "@code-assistants/actions-core/releaseField";
import type { Octokit } from "@octokit/rest";

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
// Auto-merge opt-in lives in the `release` object of a member (or root) package.json.
const rootPackageJsonPath = "package.json";
// Per-member release-notes file that identifies the member a release PR belongs to.
const releaseNotesFile = /(?:^|\/)\.release_notes\/[^/]+\.md$/;
// GitHub merge-API responses that mean "nothing to do" rather than a real error:
// 405 not mergeable / already merged, 409 head SHA moved (sha mismatch), 422 unprocessable.
// The retrying client (createOctokit) does not fast-fail 405/409 — only 422 is in
// plugin-retry's doNotRetry list — so those two surface here after ~14s of backoff.
// That is intended: GitHub computes mergeability asynchronously, so a 405 often clears
// on retry, and the skip below stays correct either way.
const idempotentMergeStatuses = new Set([405, 409, 422]);
// An approval usually triggers this action while CI is still running, and GitHub
// does not redeliver `check_suite` events for `GITHUB_TOKEN` check suites — so no
// later event would re-run the merge once CI turns green. Poll until checks settle
// instead of skipping on the first pending read. Bounded well inside the workflow's
// 10-minute job timeout. Repo-agnostic: no consumer-specific workflow names.
const checksPollIntervalMs = 15_000;
const checksTimeoutMs = 480_000;

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

  return { octokit: createOctokit(token), owner, repo, headSha, jobName };
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
 * Read the `release.automerge` tri-state from raw `package.json` content.
 *
 * Returns `undefined` when the file is absent (`raw === null`) or the field is
 * unset, so the caller can inherit the root default. Malformed JSON or an
 * invalid `release` object throws, naming `source`, so the fail-closed caller
 * never merges on doubt.
 */
export function parseAutomerge(raw: string | null, source: string): boolean | undefined {
  if (raw === null) {
    return undefined;
  }

  try {
    return readRootRelease(JSON.parse(raw)).automerge;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read auto-merge opt-in from ${source}: ${detail}`);
  }
}

/**
 * Effective opt-in: a release member's own `automerge` overrides the root
 * default; an unset member inherits root. Auto-merge holds only when the
 * resolved value is exactly `true`.
 */
export function resolveAutomergeOptIn(
  member: boolean | undefined,
  root: boolean | undefined,
): boolean {
  return (member ?? root) === true;
}

/**
 * Locate the releasing member's directory from a PR's changed file paths.
 *
 * Mirrors the publish pipeline's contract: a release PR carries exactly one
 * `<member-rel-path>/.release_notes/<version>.md` file (the root, `""`, for a
 * standalone repo). Returns `null` when zero or more than one distinct member
 * is referenced, so the caller can fail closed on an unclassifiable PR.
 */
export function releaseMemberDir(filenames: string[]): string | null {
  const dirs = new Set<string>();
  for (const name of filenames) {
    const marker = name.lastIndexOf(".release_notes/");
    if (marker !== -1 && releaseNotesFile.test(name)) {
      dirs.add(name.slice(0, marker));
    }
  }

  if (dirs.size !== 1) {
    return null;
  }

  const [dir] = dirs;
  return dir ?? null;
}

/**
 * Decide auto-merge opt-in for the release PR at the triggering head SHA.
 *
 * Resolves the releasing member from the PR's files, then reads
 * `release.automerge` from that member's `package.json` (overriding) and the
 * root `package.json` (default). An unclassifiable PR fails closed.
 */
async function fetchAutomergeOptIn(config: AutomergeConfig, pullNumber: number): Promise<boolean> {
  const { octokit, owner, repo, headSha } = config;

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  const memberDir = releaseMemberDir(files.map((file) => file.filename));

  if (memberDir === null) {
    console.log("Skip: could not resolve a single release member from the PR's files");
    return false;
  }

  const sourceAt = (path: string): string => `${owner}/${repo}:${path}@${headSha.slice(0, 7)}`;
  const readAutomergeAt = async (path: string): Promise<boolean | undefined> =>
    parseAutomerge(
      await fetchRawContent({ octokit, owner, repo, path, ref: headSha }),
      sourceAt(path),
    );

  // Standalone repo: the member IS the root, so only the root needs reading.
  if (memberDir === "") {
    return (await readAutomergeAt(rootPackageJsonPath)) === true;
  }

  // Member and root reads are independent — fetch them in one roundtrip.
  const [member, root] = await Promise.all([
    readAutomergeAt(`${memberDir}${rootPackageJsonPath}`),
    readAutomergeAt(rootPackageJsonPath),
  ]);
  return resolveAutomergeOptIn(member, root);
}

/** Fetch the PR's aggregate review decision via GraphQL. */
async function fetchReviewDecision(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string | null> {
  const result = await octokit.graphql<{
    repository: { pullRequest: { reviewDecision: string | null } };
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) { reviewDecision }
      }
    }`,
    { owner, repo, number: pullNumber },
  );

  return result.repository.pullRequest.reviewDecision;
}

/** Read the repository's allowed merge methods. */
async function fetchMergeMethodFlags(
  octokit: Octokit,
  owner: string,
  repo: string,
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
      console.log(
        `Skip: PR #${pullNumber} not mergeable now (HTTP ${status}) — head moved or already merged`,
      );
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

  if (!(await fetchAutomergeOptIn(config, pr.number))) {
    console.log(
      "Skip: auto-merge disabled — set release.automerge:true on the release member or root package.json (see docs/07-release-automerge.md)",
    );
    return;
  }

  // Gate on approval before waiting on checks: pull_request_review fires for every
  // review (comment, changes-requested, approval), so non-approval events skip
  // immediately instead of holding a runner polling their checks.
  const decision = await fetchReviewDecision(octokit, owner, repo, pr.number);
  if (!isApprovedDecision(decision)) {
    console.log(`Skip: review decision is ${decision ?? "none"}, not APPROVED`);
    return;
  }

  // An approval routinely fires this action before CI finishes, and GitHub does
  // not redeliver check_suite events for GITHUB_TOKEN suites — so poll until the
  // checks settle rather than skip on the first pending read.
  const checks = await pollCheckStatuses(
    () => fetchCheckStatuses(octokit, owner, repo, headSha, jobName),
    {
      pollIntervalMs: checksPollIntervalMs,
      timeoutMs: checksTimeoutMs,
      onPending: (pendingNames, elapsedMs) =>
        console.log(
          `Waiting for checks: ${pendingNames.join(", ")} (${Math.round(elapsedMs / 1000)}s / ${checksTimeoutMs / 1000}s)`,
        ),
    },
  );
  if (checks.hasFailed) {
    console.log(`Skip: failed checks — ${checks.failed.map((f) => f.name).join(", ")}`);
    return;
  }
  if (!checks.allCompleted) {
    console.log(
      `Skip: checks still pending after ${checksTimeoutMs / 1000}s — ${checks.pendingNames.join(", ")}`,
    );
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
