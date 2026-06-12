/**
 * Tests for reportIssue.ts.
 * Covers create/comment/cooldown-skip paths, the closed-issue cooldown, the
 * pull_request filter on the issues listing, attribution rendering, and the
 * annotation message format — all against a mocked Octokit.
 */
import { describe, expect, test } from "bun:test";
import type { Octokit } from "@octokit/rest";

import { buildIssueBody, parseAttribution, postReport, reportAnnotation, reportMarker } from "./reportIssue.ts";

const now = new Date("2026-06-12T00:00:00Z");

interface MockIssue {
  number: number;
  state: string;
  body: string;
  html_url: string;
  created_at: string;
  pull_request?: object;
}

interface MockState {
  issues: MockIssue[];
  commentsByIssue?: Record<number, { body: string; created_at: string }[]>;
}

interface Captured {
  created: object[];
  comments: object[];
}

function makeOctokit(state: MockState): { octokit: Octokit; captured: Captured } {
  const captured: Captured = { created: [], comments: [] };
  const listRoute = Symbol("issues.listForRepo");
  const commentsRoute = Symbol("issues.listComments");

  const paginate = async (route: unknown, options: { issue_number?: number }): Promise<unknown[]> => {
    if (route === listRoute) return state.issues;
    if (route === commentsRoute) return state.commentsByIssue?.[options.issue_number ?? 0] ?? [];
    throw new Error("Unexpected route");
  };

  const octokit = {
    paginate,
    rest: {
      issues: {
        listForRepo: listRoute,
        listComments: commentsRoute,
        create: (payload: object) => {
          captured.created.push(payload);
          return Promise.resolve({ data: { html_url: "https://github.com/o/r/issues/99" } });
        },
        createComment: (payload: object) => {
          captured.comments.push(payload);
          return Promise.resolve({ data: {} });
        },
      },
    },
  } as unknown as Octokit;

  return { octokit, captured };
}

const baseParams = {
  owner: "o",
  repo: "r",
  issueLabel: "code-review-cost",
  cooldownDays: 7,
  report: "## Code review cost report",
  attribution: { requested: false },
  now,
};

describe("postReport()", () => {
  test("creates a labeled marker issue when none exists", async () => {
    const { octokit, captured } = makeOctokit({ issues: [] });

    const result = await postReport(octokit, baseParams);

    expect(result.action).toBe("created");
    expect(captured.created[0]).toMatchObject({ labels: ["code-review-cost"] });
    expect((captured.created[0] as { body: string }).body).toStartWith(reportMarker);
  });

  test("comments on an open marker issue past the cooldown", async () => {
    const { octokit, captured } = makeOctokit({
      issues: [
        {
          number: 5,
          state: "open",
          body: `${reportMarker}\nold report`,
          html_url: "https://github.com/o/r/issues/5",
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
    });

    const result = await postReport(octokit, baseParams);

    expect(result).toEqual({ issueUrl: "https://github.com/o/r/issues/5", action: "commented" });
    expect(captured.comments).toHaveLength(1);
  });

  test("skips inside the cooldown measured against the newest marker comment", async () => {
    const { octokit, captured } = makeOctokit({
      issues: [
        {
          number: 5,
          state: "open",
          body: `${reportMarker}\nold report`,
          html_url: "https://github.com/o/r/issues/5",
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      commentsByIssue: {
        5: [
          { body: "human chatter", created_at: "2026-06-11T00:00:00Z" },
          { body: `${reportMarker}\nrecent report`, created_at: "2026-06-08T00:00:00Z" },
        ],
      },
    });

    const result = await postReport(octokit, baseParams);

    expect(result.action).toBe("skipped-cooldown");
    expect(captured.comments).toHaveLength(0);
    expect(captured.created).toHaveLength(0);
  });

  test("a recently closed marker issue still honors the cooldown", async () => {
    const { octokit, captured } = makeOctokit({
      issues: [
        {
          number: 6,
          state: "closed",
          body: `${reportMarker}\nold report`,
          html_url: "https://github.com/o/r/issues/6",
          created_at: "2026-06-10T00:00:00Z",
        },
      ],
    });

    const result = await postReport(octokit, baseParams);

    expect(result.action).toBe("skipped-cooldown");
    expect(captured.created).toHaveLength(0);
  });

  test("a closed marker issue past the cooldown gets a fresh issue", async () => {
    const { octokit, captured } = makeOctokit({
      issues: [
        {
          number: 6,
          state: "closed",
          body: `${reportMarker}\nold report`,
          html_url: "https://github.com/o/r/issues/6",
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
    });

    const result = await postReport(octokit, baseParams);

    expect(result.action).toBe("created");
    expect(captured.created).toHaveLength(1);
  });

  test("ignores pull requests and marker-less issues in the listing", async () => {
    const { octokit, captured } = makeOctokit({
      issues: [
        {
          number: 1,
          state: "open",
          body: `${reportMarker} in a PR body`,
          html_url: "https://github.com/o/r/pull/1",
          created_at: "2026-06-11T00:00:00Z",
          pull_request: {},
        },
        {
          number: 2,
          state: "open",
          body: "labeled but unrelated issue",
          html_url: "https://github.com/o/r/issues/2",
          created_at: "2026-06-11T00:00:00Z",
        },
      ],
    });

    const result = await postReport(octokit, baseParams);

    expect(result.action).toBe("created");
    expect(captured.created).toHaveLength(1);
  });
});

describe("buildIssueBody()", () => {
  test("appends the narrative when attribution succeeded", () => {
    const body = buildIssueBody("report", { requested: true, narrative: "The checklist grew." });
    expect(body).toContain("### Root cause (model-attributed)");
    expect(body).toContain("The checklist grew.");
  });

  test("says so when attribution was requested but unavailable", () => {
    const body = buildIssueBody("report", { requested: true });
    expect(body).toContain("Attribution unavailable (model step failed or was skipped).");
  });

  test("omits the section when attribution was not requested", () => {
    expect(buildIssueBody("report", { requested: false })).not.toContain("Root cause");
  });
});

describe("parseAttribution()", () => {
  test("extracts the narrative from valid structured output", () => {
    expect(parseAttribution(true, '{"narrative":"x"}')).toEqual({
      requested: true,
      narrative: "x",
    });
  });

  test("tolerates invalid JSON and schema mismatches", () => {
    expect(parseAttribution(true, "not json")).toEqual({ requested: true });
    expect(parseAttribution(true, '{"other":1}')).toEqual({ requested: true });
    expect(parseAttribution(false, '{"narrative":"x"}')).toEqual({ requested: false });
  });
});

describe("reportAnnotation()", () => {
  test("links the created issue", () => {
    expect(reportAnnotation({ issueUrl: "https://github.com/o/r/issues/99", action: "created" })).toBe(
      "Cost report created: https://github.com/o/r/issues/99",
    );
  });

  test("links the existing issue on a cooldown skip", () => {
    expect(reportAnnotation({ issueUrl: "https://github.com/o/r/issues/5", action: "skipped-cooldown" })).toBe(
      "Cost report skipped-cooldown: https://github.com/o/r/issues/5",
    );
  });
});
