/**
 * Tests for githubReview.ts. Pure helpers (normalizeBody) plus the Octokit-backed
 * functions exercised with a fake Octokit — no network, no real GitHub.
 */
import type { Octokit } from "@octokit/rest";

import { describe, expect, test } from "bun:test";

import {
  deletePendingReviews,
  fetchReviewThreads,
  getLastBotReview,
  hasRecentBotReply,
  hasRecentBotReview,
  normalizeBody,
} from "./githubReview.ts";

describe("normalizeBody", () => {
  test("strips per-line trailing whitespace", () => {
    expect(normalizeBody("line one   \nline two\t\n")).toBe("line one\nline two");
  });

  test("collapses 3+ blank lines to a single blank line", () => {
    expect(normalizeBody("a\n\n\n\nb")).toBe("a\n\nb");
  });

  test("treats bodies differing only in trailing space / extra blanks as equal", () => {
    expect(normalizeBody("### Blockers\n\n- one")).toBe(
      normalizeBody("### Blockers   \n\n\n- one  ")
    );
  });

  test("preserves line breaks — structurally different bodies stay different", () => {
    expect(normalizeBody("a\nb")).not.toBe(normalizeBody("a b"));
  });

  test("trims leading and trailing newlines", () => {
    expect(normalizeBody("\n\nbody\n\n")).toBe("body");
  });
});

/** Build a GraphQL review-thread node in the shape fetchReviewThreads expects. */
function threadNode(id: string, path: string, line: number, author: string) {
  return {
    id,
    path,
    line,
    isOutdated: false,
    isResolved: false,
    comments: { nodes: [{ author: { login: author }, body: "b", pullRequestReview: { id: "rev1" } }] },
  };
}

describe("fetchReviewThreads", () => {
  test("paginates across pages and flattens nodes", async () => {
    const pages = [
      { nodes: [threadNode("t1", "a.ts", 1, "bot")], pageInfo: { hasNextPage: true, endCursor: "c1" } },
      { nodes: [threadNode("t2", "b.ts", 2, "alice")], pageInfo: { hasNextPage: false, endCursor: null } },
    ];
    const cursors: Array<string | null> = [];
    let call = 0;
    const octokit = {
      graphql: async (_q: string, vars: { cursor: string | null }) => {
        cursors.push(vars.cursor);
        return { repository: { pullRequest: { reviewThreads: pages[call++] } } };
      },
    } as unknown as Octokit;

    const threads = await fetchReviewThreads(octokit, "o", "r", 1);

    expect(threads.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(threads[0]?.firstCommentAuthor).toBe("bot");
    expect(cursors).toEqual([null, "c1"]); // second page requested with the prior endCursor
  });
});

describe("getLastBotReview", () => {
  test("returns the last non-pending review by the reviewer", async () => {
    const octokit = {
      rest: {
        pulls: {
          listReviews: async () => ({
            data: [
              { user: { login: "alice" }, state: "COMMENTED", body: "x" },
              { user: { login: "bot" }, state: "APPROVED", body: "first" },
              { user: { login: "bot" }, state: "PENDING", body: "pending" },
              { user: { login: "bot" }, state: "CHANGES_REQUESTED", body: "last" },
            ],
          }),
        },
      },
    } as unknown as Octokit;

    expect((await getLastBotReview(octokit, "o", "r", 1, "bot"))?.body).toBe("last");
  });

  test("returns undefined when the bot has no review", async () => {
    const octokit = {
      rest: { pulls: { listReviews: async () => ({ data: [{ user: { login: "alice" }, state: "APPROVED" }] }) } },
    } as unknown as Octokit;
    expect(await getLastBotReview(octokit, "o", "r", 1, "bot")).toBeUndefined();
  });
});

describe("deletePendingReviews", () => {
  test("deletes only PENDING reviews", async () => {
    const deleted: number[] = [];
    const octokit = {
      rest: {
        pulls: {
          listReviews: async () => ({
            data: [
              { id: 1, state: "PENDING" },
              { id: 2, state: "APPROVED" },
              { id: 3, state: "PENDING" },
            ],
          }),
          deletePendingReview: async ({ review_id }: { review_id: number }) => {
            deleted.push(review_id);
            return {};
          },
        },
      },
    } as unknown as Octokit;

    await deletePendingReviews(octokit, "o", "r", 1);
    expect(deleted).toEqual([1, 3]);
  });
});

describe("hasRecentBotReview", () => {
  const reviews = (data: unknown[]) =>
    ({ rest: { pulls: { listReviews: async () => ({ data }) } } }) as unknown as Octokit;

  test("matches the bot's review on the given head SHA", async () => {
    const o = reviews([{ user: { login: "bot" }, state: "APPROVED", commit_id: "sha1" }]);
    expect(await hasRecentBotReview(o, "o", "r", 1, "bot", "sha1")).toBe(true);
    expect(await hasRecentBotReview(o, "o", "r", 1, "bot", "sha2")).toBe(false);
  });

  test("returns false when the bot has no review", async () => {
    const o = reviews([{ user: { login: "alice" }, state: "APPROVED", commit_id: "sha1" }]);
    expect(await hasRecentBotReview(o, "o", "r", 1, "bot", "sha1")).toBe(false);
  });
});

describe("hasRecentBotReply", () => {
  test("detects an inline reply by the bot to the given comment", async () => {
    const octokit = {
      rest: {
        pulls: { listReviewComments: async () => ({ data: [{ in_reply_to_id: 42, user: { login: "bot" } }] }) },
        issues: { listComments: async () => ({ data: [] }) },
      },
    } as unknown as Octokit;

    expect(await hasRecentBotReply(octokit, "o", "r", 1, "bot", "42", "a.ts")).toBe(true);
    expect(await hasRecentBotReply(octokit, "o", "r", 1, "bot", "99", "a.ts")).toBe(false);
  });

  test("detects a bot issue comment when no path is given", async () => {
    const octokit = {
      rest: {
        issues: { listComments: async () => ({ data: [{ user: { login: "bot" } }] }) },
        pulls: { listReviewComments: async () => ({ data: [] }) },
      },
    } as unknown as Octokit;

    expect(await hasRecentBotReply(octokit, "o", "r", 1, "bot", undefined, undefined)).toBe(true);
  });
});
