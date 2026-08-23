import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assigneeStatusMarkers,
  buildIssueContext,
  degradedIssueContext,
  deriveAssigneeStatus,
  maxCommentLength,
  maxComments,
  maxDescriptionLength,
  parseIssueJson,
} from "./issueContext.ts";
import type { AssignReads } from "./issueContext.ts";

const healthyReads: AssignReads = {
  login: "octocat",
  state: "OPEN",
  assignees: [],
  editExitCode: 0,
  editStderr: "",
  verifiedAssignees: ["octocat"],
};

describe("deriveAssigneeStatus", () => {
  test("just assigned: edit succeeded and the verifying re-read shows the login", () => {
    expect(deriveAssigneeStatus(healthyReads)).toBe("@octocat (just assigned)");
  });

  test("already assigned short-circuits before any edit", () => {
    expect(deriveAssigneeStatus({ ...healthyReads, assignees: ["octocat"] })).toBe(
      "@octocat (already assigned)",
    );
  });

  test("no authenticated login", () => {
    expect(deriveAssigneeStatus({ ...healthyReads, login: null })).toBe(
      "unassigned — gh not authenticated",
    );
  });

  test("closed issue", () => {
    expect(deriveAssigneeStatus({ ...healthyReads, state: "CLOSED" })).toBe(
      "unassigned — issue closed",
    );
  });

  test("silent drop: exit-0 edit not confirmed by the re-read", () => {
    expect(deriveAssigneeStatus({ ...healthyReads, verifiedAssignees: [] })).toBe(
      "unassigned — permission denied or assignee limit reached",
    );
  });

  test("failed edit reports the first stderr line", () => {
    expect(
      deriveAssigneeStatus({
        ...healthyReads,
        editExitCode: 1,
        editStderr: "GraphQL: boom\nsecond line",
      }),
    ).toBe("unassigned — gh edit error: GraphQL: boom");
  });
});

describe("assignee-status vocabulary sync", () => {
  const vocabularyHomes = [
    join(import.meta.dirname, "../../agents/resolve-issue-context.md"),
    join(import.meta.dirname, "../../skills/branch-create/references/self-assign.md"),
  ];

  test.each(vocabularyHomes)("all six status markers appear verbatim in %s", async (home) => {
    const content = await readFile(home, "utf8");
    for (const marker of assigneeStatusMarkers) {
      expect(content).toContain(marker);
    }
  });
});

describe("parseIssueJson", () => {
  test("accepts a payload with the load-bearing fields", () => {
    expect(parseIssueJson('{"title":"T","state":"OPEN"}')).toEqual({ title: "T", state: "OPEN" });
  });

  test.each(["not json", "[1,2]", "null", '{"title":42,"state":"OPEN"}', '{"title":"T"}'])(
    "rejects malformed payload %s",
    (stdout) => {
      expect(parseIssueJson(stdout)).toBeNull();
    },
  );
});

describe("buildIssueContext", () => {
  test("maps the gh payload to the issue contract", () => {
    const context = buildIssueContext(42, {
      title: "Add JWT refresh endpoint",
      body: "We need a refresh endpoint...",
      state: "OPEN",
      url: "https://github.com/octocat/hello-world/issues/42",
      labels: [{ name: "enhancement" }, {}],
      comments: [{ author: { login: "octocat" }, createdAt: "2026-05-30T10:00:00Z", body: "Agreed." }],
    });
    expect(context).toEqual({
      source: "GitHub Issue #42",
      issueId: 42,
      title: "Add JWT refresh endpoint",
      status: "OPEN",
      labels: ["enhancement"],
      assignee: null,
      url: "https://github.com/octocat/hello-world/issues/42",
      description: "We need a refresh endpoint...",
      comments: [{ author: "octocat", date: "2026-05-30", body: "Agreed." }],
      truncated: false,
      resolveError: null,
    });
  });

  test("caps description and comments and flags truncation", () => {
    const context = buildIssueContext(7, {
      title: "T",
      state: "OPEN",
      body: "x".repeat(maxDescriptionLength + 1),
      comments: Array.from({ length: maxComments + 1 }, () => ({
        body: "y".repeat(maxCommentLength + 1),
      })),
    });
    expect(context.description).toHaveLength(maxDescriptionLength);
    expect(context.comments).toHaveLength(maxComments);
    expect(context.comments[0].body).toHaveLength(maxCommentLength);
    expect(context.truncated).toBe(true);
  });

  test("degraded fetch carries the reason and the unresolved status", () => {
    const context = degradedIssueContext(9, "gh invocation failed");
    expect(context.status).toBe("unresolved");
    expect(context.resolveError).toBe("gh invocation failed");
    expect(context.issueId).toBe(9);
  });
});
