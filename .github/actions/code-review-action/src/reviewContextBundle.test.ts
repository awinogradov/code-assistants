/**
 * Tests for reviewContextBundle.ts: version gating, strictness, discriminated
 * union shapes, the bounds constants, the generated-path truncation ordering,
 * and body bounding — the parts of the contract the pr-review skill and the
 * builder both rely on staying exact.
 */
import { describe, expect, test } from "bun:test";

import {
  boundBody,
  bundleBounds,
  bundleVersion,
  contextBuilderTelemetrySchema,
  isGeneratedPath,
  orderForTruncation,
  reviewContextBundleSchema,
} from "./reviewContextBundle.ts";

/** Minimal valid version-1 bundle used as the mutation base for negative cases. */
function validBundle(): Record<string, unknown> {
  return {
    version: bundleVersion,
    identity: {
      repo: "owner/repo",
      prNumber: 5,
      url: "https://github.com/owner/repo/pull/5",
      title: "Add feature",
      body: "**Issues:**\n\nCloses #5",
      bodyTruncated: false,
      author: "octocat",
      baseRefName: "main",
      headRefName: "issue-5-feature",
    },
    refs: { baseSha: "base-sha", headSha: "head-sha", lastReviewedSha: null },
    changedFiles: {
      available: true,
      files: [{ path: "src/a.ts", status: "modified", additions: 3, deletions: 1 }],
      totalFiles: 1,
      truncated: false,
    },
    diff: { available: true, path: "/tmp/diff.patch", bytes: 120, truncated: false },
    checks: { available: true, allCompleted: true, failing: [], pending: [], truncated: false },
    reviewState: {
      available: true,
      existingVerdict: null,
      priorReviews: [],
      priorReviewsTruncated: false,
      unresolvedThreads: [],
      threadsTruncated: false,
    },
    round: { firstReview: true },
  };
}

describe("reviewContextBundleSchema", () => {
  test("accepts a minimal first-review bundle", () => {
    expect(reviewContextBundleSchema.parse(validBundle()).version).toBe(1);
  });

  test("rejects a wrong version literal — the skill's consumption gate", () => {
    expect(reviewContextBundleSchema.safeParse({ ...validBundle(), version: 2 }).success).toBe(
      false,
    );
  });

  test("rejects unknown top-level keys (strict contract)", () => {
    expect(
      reviewContextBundleSchema.safeParse({ ...validBundle(), extra: true }).success,
    ).toBe(false);
  });

  test("accepts an unavailable section with a reason and rejects one without", () => {
    const degraded = { ...validBundle(), checks: { available: false, reason: "rate-limited" } };
    expect(reviewContextBundleSchema.parse(degraded).checks.available).toBe(false);

    const bare = { ...validBundle(), checks: { available: false } };
    expect(reviewContextBundleSchema.safeParse(bare).success).toBe(false);
  });

  test("accepts a re-review round with a delta and rejects one missing lastReviewedSha", () => {
    const reReview = {
      ...validBundle(),
      round: {
        firstReview: false,
        lastReviewedSha: "old-sha",
        delta: { available: true, files: ["src/a.ts"], commitCount: 2, truncated: false },
      },
    };
    const parsed = reviewContextBundleSchema.parse(reReview);
    expect(parsed.round.firstReview).toBe(false);

    const missingSha = {
      ...validBundle(),
      round: { firstReview: false, delta: { available: false, reason: "ref-missing" } },
    };
    expect(reviewContextBundleSchema.safeParse(missingSha).success).toBe(false);
  });

  test("enforces the changed-files bound", () => {
    const over = {
      ...validBundle(),
      changedFiles: {
        available: true,
        files: Array.from({ length: bundleBounds.maxChangedFiles + 1 }, (_, i) => ({
          path: `src/f${i}.ts`,
          status: "modified",
          additions: 1,
          deletions: 0,
        })),
        totalFiles: bundleBounds.maxChangedFiles + 1,
        truncated: true,
      },
    };
    expect(reviewContextBundleSchema.safeParse(over).success).toBe(false);
  });
});

describe("contextBuilderTelemetrySchema", () => {
  test("accepts the builder's telemetry shape and rejects unknown keys", () => {
    const telemetry = {
      builder_ms: 812,
      request_count: 6,
      bundle_bytes: 2048,
      diff_bytes: 120,
      truncated: false,
      sections_unavailable: 0,
      cache_used: false,
    };
    expect(contextBuilderTelemetrySchema.parse(telemetry).request_count).toBe(6);
    expect(
      contextBuilderTelemetrySchema.safeParse({ ...telemetry, surprise: 1 }).success,
    ).toBe(false);
  });
});

describe("isGeneratedPath", () => {
  test.each([
    ["bun.lock", true],
    ["package-lock.json", true],
    ["apps/web/yarn.lock", true],
    ["dist/index.js", true],
    ["packages/x/dist/out.js", true],
    [".repomix/pack.xml", true],
    ["assets/app.min.js", true],
    ["src/__snapshots__/a.snap", true],
    ["src/index.ts", false],
    ["docs/lockfile-guide.md", false],
    ["distribution.ts", false],
  ])("%s → %p", (path, expected) => {
    expect(isGeneratedPath(path)).toBe(expected);
  });
});

describe("orderForTruncation", () => {
  test("moves generated paths to the tail preserving API order within groups", () => {
    const files = [
      { path: "bun.lock" },
      { path: "src/a.ts" },
      { path: "dist/bundle.js" },
      { path: "src/b.ts" },
    ];
    expect(orderForTruncation(files).map((f) => f.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "bun.lock",
      "dist/bundle.js",
    ]);
  });
});

describe("boundBody", () => {
  test("keeps short bodies intact and flags cut ones", () => {
    expect(boundBody("short")).toEqual({ body: "short", bodyTruncated: false });

    const long = "x".repeat(bundleBounds.maxBodyChars + 5);
    const bounded = boundBody(long);
    expect(bounded.body.length).toBe(bundleBounds.maxBodyChars);
    expect(bounded.bodyTruncated).toBe(true);
  });
});
