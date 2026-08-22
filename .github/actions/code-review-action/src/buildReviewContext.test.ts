/**
 * Fixture-driven tests for buildReviewContext.ts: small and >100-file PRs,
 * generated-file-heavy diffs, first-review vs re-review rounds, diverged and
 * missing compare refs, partial API failures, rate-limit classification, the
 * mid-build head-move retry, and the streamed diff byte cap. All GitHub access
 * goes through an injected mock Octokit that records its arguments, so every
 * test also proves the calls are fully qualified with owner/repo/PR.
 */
import type { CheckResult } from "@code-assistants/actions-core/checkStatus";
import type { Octokit } from "@octokit/rest";

import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  anyTruncation,
  assembleBundle,
  buildWithRetry,
  countUnavailable,
  sectionReason,
  streamDiffToFile,
  type BuilderDeps,
} from "./buildReviewContext.ts";
import type { ReviewThread } from "./github/githubReview.ts";
import { bundleBounds } from "./reviewContextBundle.ts";

/** Recorded parameters of every Octokit call, for the fully-qualified assertion. */
type RecordedCall = { route: string; params: Record<string, unknown> };

interface FixtureOptions {
  changedFiles?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  totalFiles?: number;
  reviews?: Array<{
    user: { login: string } | null;
    state: string;
    commit_id: string | null;
    submitted_at: string | null;
    body: string | null;
  }>;
  reviewsError?: Error;
  compare?: { status: string; files: Array<{ filename: string }>; total_commits: number; commits: unknown[] };
  compareError?: Error & { status?: number };
  headShaSequence?: string[];
}

/** Build a mock Octokit + recorded-calls list for one scenario. */
function makeOctokit(options: FixtureOptions): { octokit: Octokit; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const heads = [...(options.headShaSequence ?? ["head-sha", "head-sha"])];
  const files = options.changedFiles ?? [
    { filename: "src/a.ts", status: "modified", additions: 3, deletions: 1 },
  ];

  const pullsGet = (params: Record<string, unknown>) => {
    calls.push({ route: "pulls.get", params });
    const sha = heads.length > 1 ? heads.shift() : heads[0];
    return Promise.resolve({
      data: {
        html_url: "https://github.com/o/r/pull/5",
        title: "Add feature",
        user: { login: "octocat" },
        changed_files: options.totalFiles ?? files.length,
        base: { ref: "main", sha: "base-sha" },
        head: { ref: "issue-5-feature", sha },
      },
    });
  };

  const listFiles = Object.assign(() => {}, { route: "pulls.listFiles" });
  const listReviews = Object.assign(() => {}, { route: "pulls.listReviews" });

  const paginate = (route: { route: string }, params: Record<string, unknown>, mapFn?: unknown) => {
    calls.push({ route: route.route, params });
    if (route.route === "pulls.listFiles") {
      const done = { called: false };
      for (let page = 0; page * 100 < files.length; page += 1) {
        const slice = files.slice(page * 100, page * 100 + 100);
        (mapFn as (r: { data: unknown[] }, d: () => void) => unknown[])(
          { data: slice },
          () => {
            done.called = true;
          },
        );
        if (done.called) break;
      }
      return Promise.resolve([]);
    }
    if (options.reviewsError) return Promise.reject(options.reviewsError);
    return Promise.resolve(options.reviews ?? []);
  };

  const compare = (params: Record<string, unknown>) => {
    calls.push({ route: "repos.compareCommitsWithBasehead", params });
    if (options.compareError) return Promise.reject(options.compareError);
    const data = options.compare ?? { status: "ahead", files: [], total_commits: 0, commits: [] };
    return Promise.resolve({ data });
  };

  const octokit = {
    rest: {
      pulls: { get: pullsGet, listFiles, listReviews },
      repos: { compareCommitsWithBasehead: compare },
    },
    paginate,
  } as unknown as Octokit;

  return { octokit, calls };
}

const passingChecks: CheckResult = {
  allCompleted: true,
  hasFailed: false,
  failed: [],
  pendingNames: [],
};

/** Assemble deps around a mock Octokit with quiet check/thread/diff fetchers. */
async function makeDeps(
  options: FixtureOptions,
  overrides: Partial<BuilderDeps> = {},
): Promise<{ deps: BuilderDeps; calls: RecordedCall[] }> {
  const { octokit, calls } = makeOctokit(options);
  const runnerTemp = await mkdtemp(join(tmpdir(), "bundle-test-"));
  const deps: BuilderDeps = {
    octokit,
    owner: "o",
    repoName: "r",
    pullNumber: 5,
    reviewer: "review-bot",
    token: "tok",
    runnerTemp,
    jobName: "review",
    fetchImpl: () => Promise.resolve(new Response("diff --git a b\n")),
    fetchChecks: () => Promise.resolve(passingChecks),
    fetchThreads: () => Promise.resolve([] as ReviewThread[]),
    ...overrides,
  };
  return { deps, calls };
}

const noop = (): void => {};

describe("assembleBundle", () => {
  test("small first-review PR: valid bundle, no delta, null lastReviewedSha", async () => {
    const { deps } = await makeDeps({});
    const { bundle, headMoved } = await assembleBundle(deps, noop);

    expect(headMoved).toBe(false);
    expect(bundle.version).toBe(1);
    expect(bundle.round).toEqual({ firstReview: true });
    expect(bundle.refs.lastReviewedSha).toBeNull();
    expect(bundle.changedFiles).toMatchObject({ available: true, totalFiles: 1, truncated: false });
    expect(bundle.diff.available && bundle.diff.bytes).toBeGreaterThan(0);
    expect(anyTruncation(bundle)).toBe(false);
    expect(countUnavailable(bundle)).toBe(0);
  });

  test("every Octokit call is fully qualified with owner/repo/PR", async () => {
    const { deps, calls } = await makeDeps({
      reviews: [
        {
          user: { login: "review-bot" },
          state: "CHANGES_REQUESTED",
          commit_id: "old-sha",
          submitted_at: "2026-08-01T00:00:00Z",
          body: "blocker",
        },
      ],
    });
    await assembleBundle(deps, noop);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.params.owner).toBe("o");
      expect(call.params.repo).toBe("r");
      const target = call.route.startsWith("pulls")
        ? call.params.pull_number
        : call.params.basehead;
      expect(target).toBeDefined();
    }
  });

  test("large PR beyond the file bound: pagination stops, generated paths cut first", async () => {
    const generated = Array.from({ length: 60 }, (_, i) => ({
      filename: `dist/out${i}.js`,
      status: "modified",
      additions: 1,
      deletions: 0,
    }));
    const authored = Array.from({ length: 290 }, (_, i) => ({
      filename: `src/f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
    }));
    const { deps } = await makeDeps({
      changedFiles: [...generated, ...authored],
      totalFiles: 450,
    });

    const { bundle } = await assembleBundle(deps, noop);
    if (!bundle.changedFiles.available) throw new Error("changedFiles degraded");

    expect(bundle.changedFiles.truncated).toBe(true);
    expect(bundle.changedFiles.totalFiles).toBe(450);
    expect(bundle.changedFiles.files.length).toBe(bundleBounds.maxChangedFiles);
    const kept = bundle.changedFiles.files.map((f) => f.path);
    expect(kept.filter((p) => p.startsWith("src/")).length).toBe(290);
    expect(kept.filter((p) => p.startsWith("dist/")).length).toBe(
      bundleBounds.maxChangedFiles - 290,
    );
  });

  test("re-review: delta computed from the reviewer's latest review commit", async () => {
    const { deps, calls } = await makeDeps({
      reviews: [
        {
          user: { login: "review-bot" },
          state: "CHANGES_REQUESTED",
          commit_id: "old-sha",
          submitted_at: "2026-08-01T00:00:00Z",
          body: "blocker found",
        },
        {
          user: { login: "someone-else" },
          state: "APPROVED",
          commit_id: "newer-sha",
          submitted_at: "2026-08-02T00:00:00Z",
          body: "lgtm",
        },
      ],
      compare: {
        status: "ahead",
        files: [{ filename: "src/a.ts" }],
        total_commits: 2,
        commits: [{}, {}],
      },
    });

    const { bundle } = await assembleBundle(deps, noop);
    expect(bundle.refs.lastReviewedSha).toBe("old-sha");
    if (bundle.round.firstReview) throw new Error("expected re-review round");
    expect(bundle.round.lastReviewedSha).toBe("old-sha");
    expect(bundle.round.delta).toMatchObject({
      available: true,
      files: ["src/a.ts"],
      commitCount: 2,
    });

    const compareCall = calls.find((c) => c.route === "repos.compareCommitsWithBasehead");
    expect(compareCall?.params.basehead).toBe("old-sha...head-sha");
  });

  test("diverged compare status degrades the delta explicitly", async () => {
    const { deps } = await makeDeps({
      reviews: [
        {
          user: { login: "review-bot" },
          state: "APPROVED",
          commit_id: "old-sha",
          submitted_at: null,
          body: null,
        },
      ],
      compare: { status: "diverged", files: [], total_commits: 0, commits: [] },
    });

    const { bundle } = await assembleBundle(deps, noop);
    if (bundle.round.firstReview) throw new Error("expected re-review round");
    expect(bundle.round.delta).toEqual({
      available: false,
      reason: "compare-status-diverged",
    });
  });

  test("missing compare ref (404) degrades the delta as ref-missing", async () => {
    const compareError = Object.assign(new Error("Not Found"), { status: 404 });
    const { deps } = await makeDeps({
      reviews: [
        {
          user: { login: "review-bot" },
          state: "APPROVED",
          commit_id: "gone-sha",
          submitted_at: null,
          body: null,
        },
      ],
      compareError,
    });

    const { bundle } = await assembleBundle(deps, noop);
    if (bundle.round.firstReview) throw new Error("expected re-review round");
    expect(bundle.round.delta).toEqual({ available: false, reason: "ref-missing" });
  });

  test("reviews endpoint failure degrades only the review-state section", async () => {
    const { deps } = await makeDeps({ reviewsError: new Error("boom\nstack") });
    const { bundle } = await assembleBundle(deps, noop);

    expect(bundle.reviewState).toEqual({ available: false, reason: "boom" });
    expect(bundle.changedFiles.available).toBe(true);
    expect(bundle.diff.available).toBe(true);
    expect(countUnavailable(bundle)).toBe(1);
    // With prior reviews unknowable, the round degrades to first-review; the
    // unavailable review-state section is the consumer's signal to verify.
    expect(bundle.round).toEqual({ firstReview: true });
  });
});

describe("sectionReason", () => {
  test("classifies 403/429 as rate-limited and keeps first error line otherwise", () => {
    expect(sectionReason(Object.assign(new Error("nope"), { status: 403 }))).toBe("rate-limited");
    expect(sectionReason(Object.assign(new Error("nope"), { status: 429 }))).toBe("rate-limited");
    expect(sectionReason(new Error("first line\nsecond"))).toBe("first line");
  });
});

describe("buildWithRetry", () => {
  test("head moving once triggers a single rebuild with telemetry intact", async () => {
    const { deps } = await makeDeps({
      headShaSequence: ["head-1", "head-2", "head-2", "head-2"],
    });
    const built = await buildWithRetry(deps);

    expect(built).not.toBeNull();
    expect(built?.bundle.refs.headSha).toBe("head-2");
    expect(built?.telemetry.request_count).toBeGreaterThan(6);
    expect(built?.telemetry.cache_used).toBe(false);
  });

  test("head moving twice degrades to null (caller emits empty path)", async () => {
    const { deps } = await makeDeps({
      headShaSequence: ["head-1", "head-2", "head-3", "head-4"],
    });
    expect(await buildWithRetry(deps)).toBeNull();
  });

  test("telemetry counts requests and flags truncation", async () => {
    const { deps } = await makeDeps({});
    const built = await buildWithRetry(deps);

    expect(built?.telemetry).toMatchObject({
      request_count: 6,
      truncated: false,
      sections_unavailable: 0,
      cache_used: false,
    });
    expect(built?.telemetry.bundle_bytes).toBeGreaterThan(0);
  });
});

describe("streamDiffToFile", () => {
  const target = { owner: "o", repoName: "r", pullNumber: 5, token: "tok" };

  test("writes the full diff untruncated when under the cap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diff-test-"));
    const dest = join(dir, "diff.patch");
    const fetchImpl = (() => Promise.resolve(new Response("0123456789")));

    const result = await streamDiffToFile(target, dest, 10, fetchImpl);
    expect(result).toEqual({ path: dest, bytes: 10, truncated: false });
    expect(await Bun.file(dest).text()).toBe("0123456789");
  });

  test("enforces the byte cap mid-stream and flags truncation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diff-test-"));
    const dest = join(dir, "diff.patch");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("aaaaa"));
        controller.enqueue(new TextEncoder().encode("bbbbb"));
        controller.enqueue(new TextEncoder().encode("ccccc"));
        controller.close();
      },
    });
    const fetchImpl = (() => Promise.resolve(new Response(body)));

    const result = await streamDiffToFile(target, dest, 7, fetchImpl);
    expect(result.bytes).toBe(7);
    expect(result.truncated).toBe(true);
    expect(await Bun.file(dest).text()).toBe("aaaaabb");
  });

  test("throws with the http status when the diff endpoint refuses (e.g. 406 too large)", async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response("too big", { status: 406 })));

    expect(streamDiffToFile(target, "/tmp/unused.patch", 10, fetchImpl)).rejects.toThrow(
      "http-406",
    );
  });
});
