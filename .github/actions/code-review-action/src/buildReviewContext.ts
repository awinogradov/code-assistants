/**
 * Deterministic review-context builder (issue #605).
 *
 * Runs as an action step before the Claude review session, fetches everything
 * the pr-review skill's Phase 1 used to rediscover call-by-call, and writes a
 * version-1 bundle (see `reviewContextBundle.ts`) plus a bounded diff file to
 * `RUNNER_TEMP`. Always emits the `path` and `telemetry` step outputs — empty
 * `path` on any fatal failure — so the prompt wiring never dangles and the
 * skill degrades to its legacy discovery path.
 *
 * All GitHub calls go through Octokit, so every request is fully qualified
 * with owner/repo/PR (this action has a recorded incident of silent repo
 * inference failure with bare `gh` calls). Independent fetches run
 * concurrently; a per-section failure degrades that section, never the build.
 *
 * @example
 * GH_TOKEN=xxx REPO=owner/repo PR_NUMBER=123 REVIEWER=bot JOB_NAME=review bun run src/buildReviewContext.ts
 */
import { fetchCheckStatuses, type CheckResult } from "@code-assistants/actions-core/checkStatus";
import type { Octokit } from "@octokit/rest";

import { setOutput } from "./actionsOutput.ts";
import { fetchReviewThreads, parseRepoEnv, type ReviewThread } from "./github/githubReview.ts";
import {
  boundBody,
  bundleBounds,
  bundleVersion,
  contextBuilderTelemetrySchema,
  orderForTruncation,
  reviewContextBundleSchema,
  type ContextBuilderTelemetry,
  type ReviewContextBundle,
} from "./reviewContextBundle.ts";

/** Minimal fetch signature the diff streamer needs; injectable in tests. */
export type DiffFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Everything the builder needs; fetchers are injectable so tests never hit the network. */
export interface BuilderDeps {
  octokit: Octokit;
  owner: string;
  repoName: string;
  pullNumber: number;
  reviewer: string;
  /** GitHub token used only for the streamed diff request. */
  token: string;
  runnerTemp: string;
  /** Current job name, excluded from check aggregation (self-check). */
  jobName: string;
  fetchImpl?: DiffFetch;
  fetchChecks?: typeof fetchCheckStatuses;
  fetchThreads?: typeof fetchReviewThreads;
}

/** A fallible section outcome before schema assembly. */
type Section<T> = ({ available: true } & T) | { available: false; reason: string };

/** Map an error to the section-unavailable reason, classifying rate limits distinctly. */
export function sectionReason(error: unknown): string {
  const status = (error as { status?: number }).status;
  if (status === 403 || status === 429) return "rate-limited";
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0] ?? "unknown";
}

/** Run one fallible fetch, degrading to an explicit unavailable arm on error. */
async function section<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { available: true, ...(await fn()) };
  } catch (error) {
    return { available: false, reason: sectionReason(error) };
  }
}

/**
 * Stream the PR's unified diff to `destPath`, enforcing the byte cap
 * mid-stream — the diff is never buffered in memory (a generated-file-heavy
 * PR can produce hundreds of MB). Records bytes written, not the unknown
 * full size.
 */
export async function streamDiffToFile(
  deps: Pick<BuilderDeps, "owner" | "repoName" | "pullNumber" | "token">,
  destPath: string,
  maxBytes: number,
  fetchImpl: DiffFetch,
): Promise<{ path: string; bytes: number; truncated: boolean }> {
  const url = `https://api.github.com/repos/${deps.owner}/${deps.repoName}/pulls/${deps.pullNumber}`;
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/vnd.github.diff",
      authorization: `Bearer ${deps.token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`diff fetch failed: http-${response.status}`);
  }

  const writer = Bun.file(destPath).writer();
  const reader = response.body.getReader();
  let bytes = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = maxBytes - bytes;
      // Strictly-over check: a diff of exactly maxBytes is complete, not cut.
      if (value.length > room) {
        writer.write(value.subarray(0, room));
        bytes += room;
        truncated = true;
        await reader.cancel();
        break;
      }
      writer.write(value);
      bytes += value.length;
    }
  } finally {
    await writer.end();
  }
  return { path: destPath, bytes, truncated };
}

/** Fetch changed files, paginating but stopping once the bundle bound is exceeded. */
async function fetchChangedFiles(
  deps: BuilderDeps,
  totalFiles: number,
): Promise<{
  files: Array<{ path: string; status: string; additions: number; deletions: number }>;
  totalFiles: number;
  truncated: boolean;
}> {
  const collected: Array<{ path: string; status: string; additions: number; deletions: number }> =
    [];
  const raw = await deps.octokit.paginate(
    deps.octokit.rest.pulls.listFiles,
    { owner: deps.owner, repo: deps.repoName, pull_number: deps.pullNumber, per_page: 100 },
    (response, done) => {
      collected.push(
        ...response.data.map((f) => ({
          path: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        })),
      );
      // One page past the bound is enough to order generated files to the tail
      // before cutting; fetching the rest would burn requests on discarded rows.
      if (collected.length > bundleBounds.maxChangedFiles) done();
      return [];
    },
  );
  void raw;

  const truncated = totalFiles > collected.length || collected.length > bundleBounds.maxChangedFiles;
  const files = orderForTruncation(collected).slice(0, bundleBounds.maxChangedFiles);
  return { files, totalFiles, truncated };
}

/** Review-state fields plus the builder-internal `lastReviewedSha`. */
interface ReviewStateData {
  existingVerdict: string | null;
  priorReviews: Array<{
    state: string;
    submittedAt: string | null;
    commitId: string | null;
    body: string;
    bodyTruncated: boolean;
  }>;
  priorReviewsTruncated: boolean;
  unresolvedThreads: Array<{
    path: string;
    line: number | null;
    author: string | null;
    body: string;
    bodyTruncated: boolean;
  }>;
  threadsTruncated: boolean;
  lastReviewedSha: string | null;
}

/** The reviewer's non-pending reviews plus unresolved threads, both paginated. */
async function fetchReviewState(deps: BuilderDeps): Promise<ReviewStateData> {
  const fetchThreads = deps.fetchThreads ?? fetchReviewThreads;
  const [allReviews, allThreads] = await Promise.all([
    deps.octokit.paginate(deps.octokit.rest.pulls.listReviews, {
      owner: deps.owner,
      repo: deps.repoName,
      pull_number: deps.pullNumber,
      per_page: 100,
    }),
    fetchThreads(deps.octokit, deps.owner, deps.repoName, deps.pullNumber),
  ]);

  const botReviews = allReviews.filter(
    (r) => r.user?.login === deps.reviewer && r.state !== "PENDING",
  );
  const latest = botReviews.at(-1);
  const recent = botReviews.slice(-bundleBounds.maxPriorReviews);
  const unresolved = allThreads.filter((t: ReviewThread) => !t.isResolved);

  return {
    existingVerdict: latest?.state ?? null,
    priorReviews: recent.map((r) => ({
      state: r.state,
      submittedAt: r.submitted_at ?? null,
      commitId: r.commit_id ?? null,
      ...boundBody(r.body ?? ""),
    })),
    priorReviewsTruncated: botReviews.length > recent.length,
    unresolvedThreads: unresolved.slice(0, bundleBounds.maxThreads).map((t) => ({
      path: t.path,
      line: t.line,
      author: t.firstCommentAuthor,
      ...boundBody(t.firstCommentBody),
    })),
    threadsTruncated: unresolved.length > bundleBounds.maxThreads,
    lastReviewedSha: latest?.commit_id ?? null,
  };
}

/**
 * Re-review delta from the last-reviewed SHA. Any compare status other than
 * `ahead` (diverged, behind, identical) means the delta cannot be trusted as
 * "what changed since the last review" — rebases move the goalposts — so it
 * degrades explicitly and the reviewer works from the full diff.
 */
async function fetchDelta(
  deps: BuilderDeps,
  lastReviewedSha: string,
  headSha: string,
): Promise<Section<{ files: string[]; commitCount: number; truncated: boolean }>> {
  try {
    const { data } = await deps.octokit.rest.repos.compareCommitsWithBasehead({
      owner: deps.owner,
      repo: deps.repoName,
      basehead: `${lastReviewedSha}...${headSha}`,
    });
    if (data.status !== "ahead") {
      return { available: false, reason: `compare-status-${data.status}` };
    }
    const allFiles = (data.files ?? []).map((f) => f.filename);
    return {
      available: true,
      files: allFiles.slice(0, bundleBounds.maxDeltaFiles),
      commitCount: data.total_commits,
      // The compare API silently caps its response at 250 commits / 300 files.
      truncated:
        allFiles.length > bundleBounds.maxDeltaFiles ||
        data.total_commits > data.commits.length ||
        allFiles.length >= 300,
    };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return { available: false, reason: "ref-missing" };
    return { available: false, reason: sectionReason(error) };
  }
}

/** Count truncation across sections for the telemetry `truncated` flag. */
export function anyTruncation(bundle: ReviewContextBundle): boolean {
  const flags = [
    bundle.changedFiles.available && bundle.changedFiles.truncated,
    bundle.diff.available && bundle.diff.truncated,
    bundle.checks.available && bundle.checks.truncated,
    bundle.reviewState.available &&
      (bundle.reviewState.priorReviewsTruncated || bundle.reviewState.threadsTruncated),
    !bundle.round.firstReview && bundle.round.delta.available && bundle.round.delta.truncated,
  ];
  return flags.some(Boolean);
}

/** Count sections that degraded to `available: false`. */
export function countUnavailable(bundle: ReviewContextBundle): number {
  const sections = [bundle.changedFiles, bundle.diff, bundle.checks, bundle.reviewState];
  const delta = bundle.round.firstReview ? [] : [bundle.round.delta];
  return [...sections, ...delta].filter((s) => !s.available).length;
}

/**
 * One full assembly pass against the current head. Returns the validated
 * bundle; throws only when PR identity itself cannot be fetched (the caller
 * then falls back to an empty-path output).
 */
export async function assembleBundle(
  deps: BuilderDeps,
  countRequest: () => void,
): Promise<{ bundle: ReviewContextBundle; headMoved: boolean }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchChecks = deps.fetchChecks ?? fetchCheckStatuses;

  countRequest();
  const { data: pr } = await deps.octokit.rest.pulls.get({
    owner: deps.owner,
    repo: deps.repoName,
    pull_number: deps.pullNumber,
  });

  const diffPath = `${deps.runnerTemp}/review-context-diff.patch`;
  const [changedFiles, diff, checks, reviewState] = await Promise.all([
    section(() => {
      countRequest();
      return fetchChangedFiles(deps, pr.changed_files);
    }),
    section(() => {
      countRequest();
      return streamDiffToFile(deps, diffPath, bundleBounds.maxDiffBytes, fetchImpl);
    }),
    section(async () => {
      countRequest();
      const result: CheckResult = await fetchChecks(
        deps.octokit,
        deps.owner,
        deps.repoName,
        pr.head.sha,
        deps.jobName,
      );
      return {
        allCompleted: result.allCompleted,
        failing: result.failed.map((f) => f.name).slice(0, bundleBounds.maxCheckNames),
        pending: result.pendingNames.slice(0, bundleBounds.maxCheckNames),
        truncated:
          result.failed.length > bundleBounds.maxCheckNames ||
          result.pendingNames.length > bundleBounds.maxCheckNames,
      };
    }),
    section(() => {
      countRequest();
      return fetchReviewState(deps);
    }),
  ]);

  const lastReviewedSha = reviewState.available ? reviewState.lastReviewedSha : null;
  const round: ReviewContextBundle["round"] =
    lastReviewedSha === null
      ? { firstReview: true }
      : {
          firstReview: false,
          lastReviewedSha,
          delta: await (async () => {
            countRequest();
            return fetchDelta(deps, lastReviewedSha, pr.head.sha);
          })(),
        };

  // Drop the builder-internal field before schema assembly.
  const reviewStateSection = reviewState.available
    ? (({ lastReviewedSha: _dropped, ...rest }) => rest)(reviewState)
    : reviewState;

  countRequest();
  const { data: recheck } = await deps.octokit.rest.pulls.get({
    owner: deps.owner,
    repo: deps.repoName,
    pull_number: deps.pullNumber,
  });

  const prBody = boundBody(pr.body ?? "");
  const bundle = reviewContextBundleSchema.parse({
    version: bundleVersion,
    identity: {
      repo: `${deps.owner}/${deps.repoName}`,
      prNumber: deps.pullNumber,
      url: pr.html_url,
      title: pr.title,
      body: prBody.body,
      bodyTruncated: prBody.bodyTruncated,
      author: pr.user?.login ?? "",
      baseRefName: pr.base.ref,
      headRefName: pr.head.ref,
    },
    refs: { baseSha: pr.base.sha, headSha: pr.head.sha, lastReviewedSha },
    changedFiles,
    diff,
    checks,
    reviewState: reviewStateSection,
    round,
  });

  return { bundle, headMoved: recheck.head.sha !== pr.head.sha };
}

/**
 * Build the bundle with one mid-build-push retry: a head that moved between
 * the first and last fetch yields an internally inconsistent bundle, so the
 * pass reruns once; a second move degrades to the fallback (empty path).
 */
export async function buildWithRetry(
  deps: BuilderDeps,
): Promise<{ bundle: ReviewContextBundle; telemetry: ContextBuilderTelemetry } | null> {
  const started = performance.now();
  let requestCount = 0;
  const countRequest = (): void => {
    requestCount += 1;
  };

  let result = await assembleBundle(deps, countRequest);
  if (result.headMoved) {
    console.log("::warning title=Review context builder::head moved mid-build, rebuilding once");
    result = await assembleBundle(deps, countRequest);
    if (result.headMoved) return null;
  }

  const { bundle } = result;
  const bundleBytes = Buffer.byteLength(JSON.stringify(bundle));
  const telemetry = contextBuilderTelemetrySchema.parse({
    builder_ms: Math.round(performance.now() - started),
    request_count: requestCount,
    bundle_bytes: bundleBytes,
    diff_bytes: bundle.diff.available ? bundle.diff.bytes : 0,
    truncated: anyTruncation(bundle),
    sections_unavailable: countUnavailable(bundle),
    cache_used: false,
  });
  return { bundle, telemetry };
}

// Main execution — only when run as the step entry point, so tests can import
// the helpers without triggering a build.
if (import.meta.main) {
  try {
    const { octokit, owner, repoName, pullNumber, reviewer } = parseRepoEnv();
    const deps: BuilderDeps = {
      octokit,
      owner,
      repoName,
      pullNumber,
      reviewer,
      token: process.env.GH_TOKEN ?? "",
      runnerTemp: process.env.RUNNER_TEMP ?? "/tmp",
      jobName: process.env.JOB_NAME ?? "",
    };

    const built = await buildWithRetry(deps);
    if (!built) {
      console.log(
        "::warning title=Review context builder::head kept moving; falling back to in-session discovery",
      );
      await setOutput("path", "");
      await setOutput("telemetry", "");
    } else {
      const bundlePath = `${deps.runnerTemp}/review-context-bundle.json`;
      await Bun.write(bundlePath, JSON.stringify(built.bundle));
      console.log(`Review context bundle: ${JSON.stringify(built.telemetry)}`);
      await setOutput("path", bundlePath);
      await setOutput("telemetry", JSON.stringify(built.telemetry));
    }
  } catch (error) {
    // Fail open: the review must still run on the legacy discovery path, but
    // the degradation is surfaced as a warning annotation, never silently.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Review context builder failed::${message}`);
    await setOutput("path", "");
    await setOutput("telemetry", "");
  }
}
