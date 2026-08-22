import { describe, expect, test } from "bun:test";

import {
  buildGhReadCommands,
  buildReviewPayload,
  mergeReviewThreadPages,
  parseGhPaginatedJson,
} from "./reviewThreads.mjs";

interface RestCommentOverrides {
  id?: number;
  path?: string;
  line?: number | null;
  user?: { login: string };
  body?: string;
  in_reply_to_id?: number;
  pull_request_review_id?: number;
}

const restComment = (overrides: RestCommentOverrides = {}) => ({
  id: 1,
  path: "src/a.ts",
  line: 5,
  user: { login: "reviewer" },
  body: "plain remark",
  pull_request_review_id: 10,
  ...overrides,
});

interface ThreadOverrides {
  path?: string;
  line?: number | null;
  isResolved?: boolean;
  isOutdated?: boolean;
  comments?: {
    nodes: { author: { login: string } | null; body: string }[];
    pageInfo: { hasNextPage: boolean };
  };
}

const thread = (overrides: ThreadOverrides = {}) => ({
  path: "src/a.ts",
  line: 5,
  isResolved: false,
  isOutdated: false,
  comments: {
    nodes: [{ author: { login: "reviewer" }, body: "plain remark" }],
    pageInfo: { hasNextPage: false },
  },
  ...overrides,
});

const gqlPage = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  data: {
    repository: {
      pullRequest: {
        reviewThreads: { nodes, pageInfo: { hasNextPage, endCursor } },
      },
    },
  },
});

interface PayloadOverrides {
  pr?: number;
  author?: string;
  meta?: { title: string | null; reviewDecision: string | null };
  reviews?: { id: number; user: { login: string }; state: string }[];
  comments?: ReturnType<typeof restComment>[];
  threads?: ReturnType<typeof thread>[];
}

const payload = (overrides: PayloadOverrides = {}) =>
  buildReviewPayload({
    pr: 604,
    author: "prauthor",
    meta: { title: "Test PR", reviewDecision: "REVIEW_REQUIRED" },
    reviews: [{ id: 10, user: { login: "reviewer" }, state: "COMMENTED" }],
    comments: [],
    threads: [],
    ...overrides,
  });

describe("parseGhPaginatedJson", () => {
  test("splits concatenated top-level JSON documents (gh --paginate page-per-document output)", () => {
    const stdout = `[{"id":1},{"id":2}]\n[{"id":3}]`;
    expect(parseGhPaginatedJson(stdout)).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
  });

  test("splits concatenated objects and ignores braces inside strings", () => {
    const stdout = `{"a":"}{"}{"b":"[not json]"}`;
    expect(parseGhPaginatedJson(stdout)).toEqual([{ a: "}{" }, { b: "[not json]" }]);
  });

  test("returns empty array for blank stdout", () => {
    expect(parseGhPaginatedJson("  \n")).toEqual([]);
  });

  test("survives astral characters (emoji) inside string values", () => {
    const stdout = `{"body":"🚧 must fix 🙋‍♂️"}{"body":"plain"}`;
    expect(parseGhPaginatedJson(stdout)).toEqual([
      { body: "🚧 must fix 🙋‍♂️" },
      { body: "plain" },
    ]);
  });
});

describe("mergeReviewThreadPages", () => {
  test("merges thread nodes across GraphQL pages", () => {
    const pageOne = gqlPage([thread({ path: "src/a.ts" })], true, "c1");
    const pageTwo = gqlPage([thread({ path: "src/b.ts" })]);
    const merged = mergeReviewThreadPages([pageOne, pageTwo]);
    expect(merged.map((node) => node.path)).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("buildReviewPayload filtering", () => {
  test("keeps an unresolved comment and reports PR metadata", () => {
    const result = payload({
      comments: [restComment({ body: "must fix: broken null check" })],
      threads: [thread({ comments: { nodes: [{ author: { login: "reviewer" }, body: "must fix: broken null check" }], pageInfo: { hasNextPage: false } } })],
    });
    expect(result.pr).toBe(604);
    expect(result.reviewState).toBe("REVIEW_REQUIRED");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].commentId).toBe(1);
    expect(result.note).toBeNull();
  });

  test("drops a comment whose thread is resolved, matched by path+line", () => {
    const result = payload({
      comments: [restComment()],
      threads: [thread({ isResolved: true })],
    });
    expect(result.comments).toHaveLength(0);
    expect(result.note).toBe("all-resolved");
  });

  test("never merges two outdated (line: null) threads in one file on a (path, null) key", () => {
    const keep = restComment({ id: 1, line: null, body: "first outdated finding" });
    const drop = restComment({ id: 2, line: null, body: "second outdated finding" });
    const result = payload({
      comments: [keep, drop],
      threads: [
        thread({
          line: null,
          isOutdated: true,
          isResolved: false,
          comments: { nodes: [{ author: { login: "reviewer" }, body: "first outdated finding" }], pageInfo: { hasNextPage: false } },
        }),
        thread({
          line: null,
          isOutdated: true,
          isResolved: true,
          comments: { nodes: [{ author: { login: "reviewer" }, body: "second outdated finding" }], pageInfo: { hasNextPage: false } },
        }),
      ],
    });
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].body).toBe("first outdated finding");
    expect(result.comments[0].line).toBeNull();
  });

  test("keeps an unresolved outdated thread — isOutdated is informational only", () => {
    const result = payload({
      comments: [restComment()],
      threads: [thread({ isOutdated: true })],
    });
    expect(result.comments).toHaveLength(1);
  });

  test("drops CI bots but keeps real review bots", () => {
    const bots = ["github-actions[bot]", "dependabot[bot]", "codecov[bot]", "coderabbitai[bot]"];
    const comments = [
      ...bots.map((login, index) =>
        restComment({ id: index + 1, line: index + 10, user: { login }, body: `bot noise ${index}` }),
      ),
      restComment({ id: 90, line: 90, user: { login: "cubic-dev-ai[bot]" }, body: "real finding" }),
      restComment({ id: 91, line: 91, user: { login: "symbiot-bot" }, body: "another real finding" }),
    ];
    const threads = comments.map((comment) =>
      thread({
        line: comment.line,
        comments: { nodes: [{ author: { login: comment.user.login }, body: comment.body }], pageInfo: { hasNextPage: false } },
      }),
    );
    const result = payload({ comments, threads });
    expect(result.comments.map((comment) => comment.reviewer).sort()).toEqual([
      "cubic-dev-ai[bot]",
      "symbiot-bot",
    ]);
  });

  test("drops the PR author's own root comments", () => {
    const result = payload({
      comments: [restComment({ user: { login: "prauthor" } })],
      threads: [thread({ comments: { nodes: [{ author: { login: "prauthor" }, body: "plain remark" }], pageInfo: { hasNextPage: false } } })],
    });
    expect(result.comments).toHaveLength(0);
    expect(result.note).toBe("no-comments");
  });
});

describe("author replies", () => {
  test("author reply sets authorReplied and lastAuthorReply from REST replies", () => {
    const result = payload({
      comments: [
        restComment({ id: 1, body: "must fix: broken" }),
        restComment({ id: 2, user: { login: "prauthor" }, body: "Fixed in abc123, thanks!", in_reply_to_id: 1 }),
      ],
      threads: [thread({ comments: { nodes: [{ author: { login: "reviewer" }, body: "must fix: broken" }], pageInfo: { hasNextPage: false } } })],
    });
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].authorReplied).toBe(true);
    expect(result.comments[0].lastAuthorReply).toBe("Fixed in abc123, thanks!");
  });

  test("authorReplied stays correct when the GraphQL nested comment page is truncated", () => {
    const result = payload({
      comments: [
        restComment({ id: 1 }),
        restComment({ id: 2, user: { login: "prauthor" }, body: "done", in_reply_to_id: 1 }),
      ],
      threads: [
        thread({
          comments: {
            nodes: [{ author: { login: "reviewer" }, body: "plain remark" }],
            pageInfo: { hasNextPage: true },
          },
        }),
      ],
    });
    expect(result.comments[0].authorReplied).toBe(true);
  });

  test("no author reply yields authorReplied false and null lastAuthorReply", () => {
    const result = payload({
      comments: [restComment()],
      threads: [thread()],
    });
    expect(result.comments[0].authorReplied).toBe(false);
    expect(result.comments[0].lastAuthorReply).toBeNull();
  });
});

describe("severity", () => {
  const severityCase = (body: string, reviewState = "COMMENTED") => {
    const result = payload({
      reviews: [{ id: 10, user: { login: "reviewer" }, state: reviewState }],
      comments: [restComment({ body })],
      threads: [thread({ comments: { nodes: [{ author: { login: "reviewer" }, body }], pageInfo: { hasNextPage: false } } })],
    });
    return result.comments[0].severity;
  };

  test("maps marker vocabulary to severities", () => {
    expect(severityCase("🚧 must fix before merge")).toBe("blocker");
    expect(severityCase("suggestion: consider extracting this")).toBe("suggestion");
    expect(severityCase("nit: rename this variable")).toBe("nitpick");
    expect(severityCase("💡 optional: could memoize")).toBe("nitpick");
  });

  test("a comment from a CHANGES_REQUESTED review is a blocker even without markers", () => {
    expect(severityCase("this branch drops the error", "CHANGES_REQUESTED")).toBe("blocker");
  });

  test("an unmarked comment ending in a question mark is a question", () => {
    expect(severityCase("why does this loop twice?")).toBe("question");
  });

  test("an unmarked comment defaults to suggestion", () => {
    expect(severityCase("this could use the shared parser")).toBe("suggestion");
  });
});

describe("output shape", () => {
  test("groups by path and sorts by line, null lines last within a file", () => {
    const comments = [
      restComment({ id: 1, path: "src/b.ts", line: 3, body: "b3" }),
      restComment({ id: 2, path: "src/a.ts", line: null, body: "a-null" }),
      restComment({ id: 3, path: "src/a.ts", line: 7, body: "a7" }),
      restComment({ id: 4, path: "src/a.ts", line: 2, body: "a2" }),
    ];
    const threads = comments.map((comment) =>
      thread({
        path: comment.path,
        line: comment.line,
        comments: { nodes: [{ author: { login: "reviewer" }, body: comment.body }], pageInfo: { hasNextPage: false } },
      }),
    );
    const result = payload({ comments, threads });
    expect(result.comments.map((comment) => comment.body)).toEqual(["a2", "a7", "a-null", "b3"]);
  });

  test("bounds comment bodies to 400 characters", () => {
    const longBody = `x${"y".repeat(600)}`;
    const result = payload({
      comments: [restComment({ body: longBody })],
      threads: [thread({ comments: { nodes: [{ author: { login: "reviewer" }, body: longBody }], pageInfo: { hasNextPage: false } } })],
    });
    expect(result.comments[0].body).toHaveLength(400);
  });

  test("caps the payload at 100 comments keeping blockers first and flags truncation", () => {
    const comments = Array.from({ length: 120 }, (_, index) =>
      restComment({
        id: index + 1,
        line: index + 1,
        body: index < 110 ? `plain remark ${index}` : `must fix: blocker ${index}`,
      }),
    );
    const threads = comments.map((comment) =>
      thread({
        line: comment.line,
        comments: { nodes: [{ author: { login: "reviewer" }, body: comment.body }], pageInfo: { hasNextPage: false } },
      }),
    );
    const result = payload({ comments, threads });
    expect(result.comments).toHaveLength(100);
    expect(result.truncated).toBe(true);
    const blockers = result.comments.filter((comment) => comment.severity === "blocker");
    expect(blockers).toHaveLength(10);
  });

  test("reports reviewers with their latest review state", () => {
    const result = payload({
      reviews: [
        { id: 10, user: { login: "reviewer" }, state: "CHANGES_REQUESTED" },
        { id: 11, user: { login: "reviewer" }, state: "APPROVED" },
        { id: 12, user: { login: "prauthor" }, state: "COMMENTED" },
      ],
    });
    expect(result.reviewers).toEqual([{ login: "reviewer", state: "APPROVED" }]);
  });

  test("note is no-comments when nothing was ever unresolved", () => {
    expect(payload().note).toBe("no-comments");
  });
});

describe("buildGhReadCommands", () => {
  test("defines exactly four read-only gh invocations", () => {
    const reads = buildGhReadCommands({ owner: "octo", repo: "demo", pr: 42 });
    const writeFlags = ["-X", "--method", "--input"];
    expect(Object.keys(reads).sort()).toEqual(["comments", "meta", "reviews", "threads"]);
    for (const args of Object.values(reads)) {
      for (const flag of writeFlags) {
        expect(args).not.toContain(flag);
      }
    }
    // -f/-F are GraphQL variable flags, permitted only on the fixed threads query.
    for (const [name, args] of Object.entries(reads)) {
      if (name === "threads") continue;
      expect(args).not.toContain("-f");
      expect(args).not.toContain("-F");
      expect(args).not.toContain("--field");
      expect(args).not.toContain("--raw-field");
    }
    expect(reads.threads).toContain("graphql");
    const threadsQuery = reads.threads.join(" ");
    expect(threadsQuery).toContain("$endCursor");
    expect(threadsQuery).not.toContain("mutation");
  });
});
