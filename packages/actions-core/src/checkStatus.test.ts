/**
 * Contract tests for the shared check-status aggregation.
 *
 * These pin the subtle behaviors both consumers (code-review preflight poll and
 * release-automerge merge gate) rely on: dedup by run id, cancelled-only runs
 * counting as pending, combined-status classification, and self-exclusion.
 */
import type { Octokit } from "@octokit/rest";

import { describe, expect, test } from "bun:test";

import { deduplicateCheckRuns, fetchCheckStatuses, normalizeCheckName } from "./checkStatus.ts";

interface FakeRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

interface FakeStatus {
  context: string;
  state: string;
}

/** Build a minimal Octokit stand-in returning the supplied runs and statuses. */
function fakeOctokit(runs: FakeRun[], statuses: FakeStatus[]): Octokit {
  const octokit = {
    paginate: async () => runs,
    rest: {
      checks: { listForRef: () => undefined },
      repos: {
        getCombinedStatusForRef: async () => ({ data: { statuses } }),
      },
    },
  };

  return octokit as unknown as Octokit;
}

describe("normalizeCheckName", () => {
  test("strips non-alphanumerics and lowercases", () => {
    expect(normalizeCheckName("Code Review")).toBe("codereview");
    expect(normalizeCheckName("code-review")).toBe("codereview");
  });
});

describe("deduplicateCheckRuns", () => {
  test("keeps the highest id per name", () => {
    const runs = [
      { id: 1, name: "build" },
      { id: 3, name: "build" },
      { id: 2, name: "test" },
    ];
    expect(deduplicateCheckRuns(runs)).toEqual([
      { id: 3, name: "build" },
      { id: 2, name: "test" },
    ]);
  });
});

describe("fetchCheckStatuses", () => {
  test("all green completed runs pass", async () => {
    const octokit = fakeOctokit(
      [{ id: 1, name: "build", status: "completed", conclusion: "success" }],
      []
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result).toEqual({
      allCompleted: true,
      hasFailed: false,
      failedNames: [],
      pendingNames: [],
    });
  });

  test("excludes its own check by normalized name", async () => {
    const octokit = fakeOctokit(
      [{ id: 1, name: "Release Automerge", status: "in_progress", conclusion: null }],
      []
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "release-automerge");
    expect(result.allCompleted).toBe(true);
    expect(result.pendingNames).toEqual([]);
  });

  test("incomplete sibling run counts as pending", async () => {
    const octokit = fakeOctokit(
      [{ id: 1, name: "build", status: "in_progress", conclusion: null }],
      []
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.allCompleted).toBe(false);
    expect(result.pendingNames).toEqual(["build"]);
  });

  test("superseded failed run is ignored when a newer success exists", async () => {
    const octokit = fakeOctokit(
      [
        { id: 1, name: "build", status: "completed", conclusion: "failure" },
        { id: 2, name: "build", status: "completed", conclusion: "success" },
      ],
      []
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.hasFailed).toBe(false);
    expect(result.allCompleted).toBe(true);
  });

  test("cancelled-only run counts as pending, not green", async () => {
    const octokit = fakeOctokit(
      [{ id: 1, name: "flaky", status: "completed", conclusion: "cancelled" }],
      []
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.allCompleted).toBe(false);
    expect(result.pendingNames).toEqual(["flaky"]);
  });

  test("failed conclusion is reported", async () => {
    const octokit = fakeOctokit(
      [{ id: 1, name: "lint", status: "completed", conclusion: "timed_out" }],
      []
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.hasFailed).toBe(true);
    expect(result.failedNames).toEqual(["lint"]);
  });

  test("combined commit statuses classify pending and failure", async () => {
    const octokit = fakeOctokit(
      [],
      [
        { context: "ci/pending", state: "pending" },
        { context: "ci/broken", state: "error" },
      ]
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.allCompleted).toBe(false);
    expect(result.pendingNames).toEqual(["ci/pending"]);
    expect(result.hasFailed).toBe(true);
    expect(result.failedNames).toEqual(["ci/broken"]);
  });
});
