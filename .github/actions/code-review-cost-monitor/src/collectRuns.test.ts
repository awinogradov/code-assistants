/**
 * Tests for collectRuns.ts.
 * Covers the updated-desc pagination cutoff via done(), footer filtering and
 * window bounds on reviews, the throw-on-API-error path, and the zero-parsed
 * parser-drift tripwire — all against a mocked Octokit.
 */
import { describe, expect, test } from "bun:test";
import type { Octokit } from "@octokit/rest";

import { collectRuns } from "./collectRuns.ts";

const now = new Date("2026-06-12T00:00:00Z");

/** Minimal footer body the parser accepts, with a configurable cost. */
function footer(costUsd: string): string {
  return [
    "Review prose.",
    "<!-- run-summary-start -->",
    "| Metric | Value |",
    "| --- | --- |",
    "| Mode | review |",
    "| Model time | 34.0s |",
    "| Tool round-trips | 10 |",
    "| Assistant turns | 3 |",
    "| Tokens in / out | 157825 / 36705 |",
    "| Cache read / write | 157000 / 800 |",
    `| Cost (USD) | $${costUsd} |`,
    "<!-- run-summary-end -->",
  ].join("\n");
}

interface MockData {
  prPages: { number: number; updated_at: string }[][];
  reviewsByPr: Record<number, { body: string; submitted_at?: string }[]>;
  detailsByPr?: Record<number, { additions: number; deletions: number }>;
}

/** Build a paginate-compatible Octokit stub dispatching on route identity. */
function makeOctokit(data: MockData): { octokit: Octokit; reviewCalls: number[] } {
  const reviewCalls: number[] = [];
  const listRoute = Symbol("pulls.list");
  const reviewsRoute = Symbol("pulls.listReviews");

  const paginate = async (
    route: unknown,
    options: { pull_number?: number },
    mapFn?: (response: { data: unknown[] }, done: () => void) => unknown[],
  ): Promise<unknown[]> => {
    if (route === listRoute) {
      const collected: unknown[] = [];
      for (const page of data.prPages) {
        let stopped = false;
        const mapped = mapFn ? mapFn({ data: page }, () => (stopped = true)) : page;
        collected.push(...mapped);
        if (stopped) break;
      }
      return collected;
    }
    if (route === reviewsRoute) {
      const prNumber = options.pull_number ?? 0;
      reviewCalls.push(prNumber);
      return data.reviewsByPr[prNumber] ?? [];
    }
    throw new Error("Unexpected route");
  };

  const octokit = {
    paginate,
    rest: {
      pulls: {
        list: listRoute,
        listReviews: reviewsRoute,
        get: ({ pull_number }: { pull_number: number }) =>
          Promise.resolve({
            data: data.detailsByPr?.[pull_number] ?? { additions: 0, deletions: 0 },
          }),
      },
    },
  } as unknown as Octokit;

  return { octokit, reviewCalls };
}

describe("collectRuns()", () => {
  test("parses footers in window and attaches PR size", async () => {
    const { octokit } = makeOctokit({
      prPages: [[{ number: 7, updated_at: "2026-06-10T00:00:00Z" }]],
      reviewsByPr: {
        7: [
          { body: footer("0.35"), submitted_at: "2026-06-09T00:00:00Z" },
          { body: "human review, no footer", submitted_at: "2026-06-09T01:00:00Z" },
          { body: footer("9.99"), submitted_at: "2026-04-01T00:00:00Z" },
        ],
      },
      detailsByPr: { 7: { additions: 120, deletions: 8 } },
    });

    const result = await collectRuns(octokit, { owner: "o", repo: "r", lookbackDays: 30, now });

    expect(result.scannedReviews).toBe(3);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      prNumber: 7,
      costUsd: 0.35,
      additions: 120,
      deletions: 8,
      submittedAt: "2026-06-09T00:00:00Z",
    });
  });

  test("stops paginating and skips PRs outside the lookback window", async () => {
    const { octokit, reviewCalls } = makeOctokit({
      prPages: [
        [
          { number: 1, updated_at: "2026-06-11T00:00:00Z" },
          { number: 2, updated_at: "2026-01-01T00:00:00Z" },
        ],
        [{ number: 3, updated_at: "2025-12-01T00:00:00Z" }],
      ],
      reviewsByPr: { 1: [{ body: footer("0.20"), submitted_at: "2026-06-11T00:00:00Z" }] },
    });

    const result = await collectRuns(octokit, { owner: "o", repo: "r", lookbackDays: 30, now });

    expect(reviewCalls).toEqual([1]);
    expect(result.runs).toHaveLength(1);
  });

  test("throws when the API fails", () => {
    const { octokit } = makeOctokit({ prPages: [], reviewsByPr: {} });
    octokit.paginate = (() => Promise.reject(new Error("boom"))) as unknown as Octokit["paginate"];

    expect(
      collectRuns(octokit, { owner: "o", repo: "r", lookbackDays: 30, now }),
    ).rejects.toThrow("boom");
  });

  test("throws the parser-drift tripwire when reviews exist but none parse", () => {
    const { octokit } = makeOctokit({
      prPages: [[{ number: 5, updated_at: "2026-06-11T00:00:00Z" }]],
      reviewsByPr: { 5: [{ body: "no footer here", submitted_at: "2026-06-11T00:00:00Z" }] },
    });

    expect(
      collectRuns(octokit, { owner: "o", repo: "r", lookbackDays: 30, now }),
    ).rejects.toThrow("footer format may have changed");
  });

  test("returns empty without throwing when no reviews were scanned", async () => {
    const { octokit } = makeOctokit({ prPages: [], reviewsByPr: {} });

    const result = await collectRuns(octokit, { owner: "o", repo: "r", lookbackDays: 30, now });

    expect(result).toEqual({ runs: [], scannedReviews: 0 });
  });
});
