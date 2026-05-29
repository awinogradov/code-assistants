/**
 * Contract tests for the shared check-status aggregation.
 *
 * These pin the subtle behaviors both consumers (code-review preflight poll and
 * release-automerge merge gate) rely on: dedup by run id, cancelled runs carrying
 * no signal, combined-status classification, self-exclusion, and that the API args
 * (owner/repo/ref) are forwarded unchanged.
 */
import type { Octokit } from "@octokit/rest";

import { describe, expect, test } from "bun:test";

import {
  type CheckResult,
  deduplicateCheckRuns,
  fetchCheckStatuses,
  normalizeCheckName,
  pollCheckStatuses,
} from "./checkStatus.ts";

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

interface CapturedCalls {
  paginate: Array<Record<string, unknown>>;
  combined: Array<Record<string, unknown>>;
}

/**
 * Build a minimal Octokit stand-in returning the supplied runs and statuses, and
 * recording the params each API received so tests can assert they are forwarded.
 */
function fakeOctokit(
  runs: FakeRun[],
  statuses: FakeStatus[],
): { octokit: Octokit; calls: CapturedCalls } {
  const calls: CapturedCalls = { paginate: [], combined: [] };
  const octokit = {
    paginate: async (_fn: unknown, params: Record<string, unknown>) => {
      calls.paginate.push(params);
      return runs;
    },
    rest: {
      checks: { listForRef: () => undefined },
      repos: {
        getCombinedStatusForRef: async (params: Record<string, unknown>) => {
          calls.combined.push(params);
          return { data: { statuses } };
        },
      },
    },
  };

  return { octokit: octokit as unknown as Octokit, calls };
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
    const { octokit } = fakeOctokit(
      [{ id: 1, name: "build", status: "completed", conclusion: "success" }],
      [],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result).toEqual({
      allCompleted: true,
      hasFailed: false,
      failedNames: [],
      pendingNames: [],
    });
  });

  test("forwards owner, repo, and ref to both APIs", async () => {
    const { octokit, calls } = fakeOctokit([], []);
    await fetchCheckStatuses(octokit, "acme", "widgets", "deadbeef", "automerge");
    expect(calls.combined[0]).toMatchObject({ owner: "acme", repo: "widgets", ref: "deadbeef" });
    expect(calls.paginate[0]).toMatchObject({ owner: "acme", repo: "widgets", ref: "deadbeef" });
  });

  test("excludes its own check by normalized name", async () => {
    const { octokit } = fakeOctokit(
      [{ id: 1, name: "Release Automerge", status: "in_progress", conclusion: null }],
      [],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "release-automerge");
    expect(result.allCompleted).toBe(true);
    expect(result.pendingNames).toEqual([]);
  });

  test("incomplete sibling run counts as pending", async () => {
    const { octokit } = fakeOctokit(
      [{ id: 1, name: "build", status: "in_progress", conclusion: null }],
      [],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.allCompleted).toBe(false);
    expect(result.pendingNames).toEqual(["build"]);
  });

  test("superseded failed run is ignored when a newer success exists", async () => {
    const { octokit } = fakeOctokit(
      [
        { id: 1, name: "build", status: "completed", conclusion: "failure" },
        { id: 2, name: "build", status: "completed", conclusion: "success" },
      ],
      [],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.hasFailed).toBe(false);
    expect(result.allCompleted).toBe(true);
  });

  test("cancelled-only run carries no signal and does not block the gate", async () => {
    const { octokit } = fakeOctokit(
      [{ id: 1, name: "flaky", status: "completed", conclusion: "cancelled" }],
      [],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.allCompleted).toBe(true);
    expect(result.hasFailed).toBe(false);
    expect(result.pendingNames).toEqual([]);
  });

  test("failed conclusion is reported", async () => {
    const { octokit } = fakeOctokit(
      [{ id: 1, name: "lint", status: "completed", conclusion: "timed_out" }],
      [],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.hasFailed).toBe(true);
    expect(result.failedNames).toEqual(["lint"]);
  });

  test("combined commit statuses classify pending and failure", async () => {
    const { octokit } = fakeOctokit(
      [],
      [
        { context: "ci/pending", state: "pending" },
        { context: "ci/broken", state: "error" },
      ],
    );
    const result = await fetchCheckStatuses(octokit, "o", "r", "sha", "automerge");
    expect(result.allCompleted).toBe(false);
    expect(result.pendingNames).toEqual(["ci/pending"]);
    expect(result.hasFailed).toBe(true);
    expect(result.failedNames).toEqual(["ci/broken"]);
  });
});

describe("pollCheckStatuses", () => {
  const pending: CheckResult = {
    allCompleted: false,
    hasFailed: false,
    failedNames: [],
    pendingNames: ["ci"],
  };
  const completed: CheckResult = {
    allCompleted: true,
    hasFailed: false,
    failedNames: [],
    pendingNames: [],
  };
  const failed: CheckResult = {
    allCompleted: false,
    hasFailed: true,
    failedNames: ["ci"],
    pendingNames: [],
  };
  const noSleep = (): Promise<void> => Promise.resolve();

  test("returns immediately when all checks are already complete (no sleep)", async () => {
    let fetched = 0;
    let slept = 0;
    const result = await pollCheckStatuses(
      () => {
        fetched += 1;
        return Promise.resolve(completed);
      },
      {
        pollIntervalMs: 1000,
        timeoutMs: 10_000,
        sleep: () => {
          slept += 1;
          return Promise.resolve();
        },
      },
    );
    expect(result.allCompleted).toBe(true);
    expect(fetched).toBe(1);
    expect(slept).toBe(0);
  });

  test("returns immediately when a check has already failed", async () => {
    let fetched = 0;
    const result = await pollCheckStatuses(
      () => {
        fetched += 1;
        return Promise.resolve(failed);
      },
      { pollIntervalMs: 1000, timeoutMs: 10_000, sleep: noSleep },
    );
    expect(result.hasFailed).toBe(true);
    expect(fetched).toBe(1);
  });

  test("polls until checks settle, sleeping between fetches", async () => {
    const sequence = [pending, pending, completed];
    let i = 0;
    let slept = 0;
    const result = await pollCheckStatuses(() => Promise.resolve(sequence[i++] ?? completed), {
      pollIntervalMs: 1000,
      timeoutMs: 10_000,
      sleep: () => {
        slept += 1;
        return Promise.resolve();
      },
    });
    expect(result.allCompleted).toBe(true);
    expect(i).toBe(3); // fetched three times
    expect(slept).toBe(2); // slept between the three fetches
  });

  test("returns the pending result once the wall-clock timeout elapses", async () => {
    let fetched = 0;
    let tick = 0;
    const result = await pollCheckStatuses(
      () => {
        fetched += 1;
        return Promise.resolve(pending);
      },
      {
        pollIntervalMs: 1000,
        timeoutMs: 3000,
        sleep: noSleep,
        now: () => tick++ * 1000, // 0, 1000, 2000, ... advances each call
      },
    );
    expect(result.allCompleted).toBe(false);
    expect(result.pendingNames).toEqual(["ci"]);
    // Bounded: start + initial-elapsed + two ticks under 3000ms, then exits.
    expect(fetched).toBeLessThanOrEqual(4);
  });
});
