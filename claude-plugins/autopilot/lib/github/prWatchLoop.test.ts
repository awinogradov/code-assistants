import { describe, expect, test } from "bun:test";

import { maxConsecutiveTransientErrors, maxRateLimitedCycles, rateLimitSleepSeconds } from "./prWatch.ts";
import type { RawCheckRun, RawPull, RawReview, WatchOptions, WatchState } from "./prWatch.ts";
import { runWatch } from "./prWatchLoop.ts";
import type { GhReadKind, GhReadResult, WatchDeps, WatchRun } from "./prWatchLoop.ts";

const startedAt = Date.parse("2026-09-11T12:00:00Z");
const minute = 60_000;

const options: WatchOptions = {
  owner: "o",
  repo: "r",
  pr: 7,
  waitForApproval: false,
  ack: null,
  timeoutSeconds: 6 * 60 * 60,
  intervalSeconds: 30,
  checkGraceSeconds: 600,
  stateDir: null,
  expectChecks: [],
};

const pull = (overrides: Partial<RawPull> = {}): RawPull => ({
  state: "open",
  merged: false,
  mergeable: true,
  mergeable_state: "clean",
  html_url: "https://github.com/o/r/pull/7",
  head: { sha: "aaa111" },
  base: { ref: "main" },
  user: { login: "author" },
  ...overrides,
});

const run = (overrides: Partial<RawCheckRun> = {}): RawCheckRun => ({
  id: 1,
  name: "Test",
  status: "completed",
  conclusion: "success",
  app: { slug: "github-actions" },
  html_url: "https://ci/1",
  completed_at: new Date(startedAt).toISOString(),
  ...overrides,
});

/** One scripted cycle: the documents each read returns, or a read that fails. */
interface CycleScript {
  pull?: RawPull;
  pullAgain?: RawPull;
  checkRuns?: RawCheckRun[];
  reviews?: RawReview[];
  reviewDecision?: string | null;
  rules?: unknown[];
  workflows?: unknown[];
  fail?: { read: "pull" | "checkRuns" | "reviews" | "rules"; kind: Exclude<GhReadKind, "ok"> };
}

const pending = (): CycleScript => ({ checkRuns: [run({ id: 2, name: "Lint", status: "in_progress", conclusion: null })] });
const ready = (): CycleScript => ({ checkRuns: [run(), run({ id: 2, name: "Lint" })] });
const failing = (id = 3): CycleScript => ({ checkRuns: [run({ id, conclusion: "failure" })] });

const ok = (document: unknown): GhReadResult => ({ stdout: JSON.stringify(document), kind: "ok", error: null });
const failed = (kind: Exclude<GhReadKind, "ok">): GhReadResult => ({ stdout: null, kind, error: `${kind} error` });

/**
 * A fake `gh` that serves one scripted cycle per pull read. Failures end the
 * cycle early, the way a real loop stops collecting after a failed read.
 */
const fakeGh = (cycles: CycleScript[]) => {
  let index = -1;
  let pullReads = 0;
  const calls: string[][] = [];
  const readGh = async (args: string[]): Promise<GhReadResult> => {
    calls.push(args);
    const target = args[1] ?? "";
    const isPull = /\/pulls\/\d+$/.test(target);
    if (isPull && pullReads === 0) index += 1;
    const script = cycles[index];
    if (script === undefined) return failed("transient");
    // Every read but `rules` aborts the cycle when it fails, so the next pull
    // read starts a fresh one; a failed policy read leaves the cycle running.
    const read = (name: NonNullable<CycleScript["fail"]>["read"], document: unknown): GhReadResult => {
      if (script.fail?.read !== name) return ok(document);
      if (name !== "rules") pullReads = 0;
      return failed(script.fail.kind);
    };
    if (isPull) {
      pullReads = pullReads === 0 ? 1 : 0;
      if (pullReads === 1) return read("pull", script.pull ?? pull());
      return ok(script.pullAgain ?? script.pull ?? pull());
    }
    if (target.includes("/check-runs")) return read("checkRuns", { check_runs: script.checkRuns ?? [run()] });
    if (target.endsWith("/status")) return ok({ statuses: [] });
    if (target.includes("/reviews")) return read("reviews", script.reviews ?? []);
    if (target === "graphql") {
      return ok({ data: { repository: { pullRequest: { reviewDecision: script.reviewDecision ?? null, reviewThreads: { nodes: [] } } } } });
    }
    if (target.includes("/rules/branches/")) return read("rules", script.rules ?? []);
    if (target.includes("/contents/")) return ok(script.workflows ?? [{ name: "ci.yml" }]);
    throw new Error(`unexpected read ${args.join(" ")}`);
  };
  return { readGh, calls };
};

interface Harness {
  deps: WatchDeps;
  sleeps: number[];
  saved: WatchState[];
  logs: string[];
  clock: { now: number };
  cancel: () => void;
}

const harness = (cycles: CycleScript[], extra: Partial<WatchDeps> & { initialState?: WatchState | null } = {}): Harness & { calls: string[][] } => {
  const clock = { now: startedAt };
  const sleeps: number[] = [];
  const saved: WatchState[] = [];
  const logs: string[] = [];
  let cancelled = false;
  const gh = fakeGh(cycles);
  const deps: WatchDeps = {
    readGh: gh.readGh,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
    now: () => clock.now,
    loadState: async () => (extra.initialState ? JSON.stringify(extra.initialState) : null),
    saveState: async (state) => {
      saved.push(state);
    },
    log: (line) => {
      logs.push(line);
    },
    isCancelled: () => cancelled,
    stateFile: "/state.json",
    logFile: "/state.log",
    ...extra,
  };
  return { deps, sleeps, saved, logs, clock, calls: gh.calls, cancel: () => (cancelled = true) };
};

const watch = (cycles: CycleScript[], opts: Partial<WatchOptions> = {}, extra: Parameters<typeof harness>[1] = {}) => {
  const h = harness(cycles, extra);
  return { ...h, run: runWatch({ ...options, ...opts }, h.deps) as Promise<WatchRun> };
};

describe("runWatch waits inside the process", () => {
  test("pending → pending → ready emits exactly one event after three cycles", async () => {
    const { run: result, sleeps, saved } = watch([pending(), pending(), ready()]);
    const outcome = await result;
    expect(outcome.event.event).toBe("ready_for_review");
    expect(outcome.cycles).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(saved.at(-1)?.pending).toBeNull();
  });

  test("pending → failed emits checks_failed once and records it as pending", async () => {
    const outcome = await watch([pending(), failing()]).run;
    expect(outcome.event).toMatchObject({ event: "checks_failed", terminal: false });
    expect(outcome.state.pending?.eventId).toBe(outcome.event.eventId);
    expect(outcome.state.pending?.keys).toEqual(["check:aaa111:3"]);
  });

  test("a growing count of successful jobs never wakes the model", async () => {
    const more = (): CycleScript => ({ checkRuns: [run(), run({ id: 4, name: "Build" }), run({ id: 5, name: "Pack" }), run({ id: 2, name: "Lint", status: "in_progress", conclusion: null })] });
    const outcome = await watch([pending(), more(), more(), failing(9)]).run;
    expect(outcome.event.event).toBe("checks_failed");
    expect(outcome.cycles).toBe(4);
  });

  test("a wait far longer than the 600 s foreground tool timeout completes inside one call with backoff", async () => {
    const cycles = [...Array.from({ length: 150 }, pending), ready()];
    const { run: result, sleeps, clock } = watch(cycles);
    const outcome = await result;
    expect(outcome.event.event).toBe("ready_for_review");
    expect(outcome.cycles).toBe(151);
    expect(clock.now - startedAt).toBeGreaterThan(600_000);
    expect(Math.max(...sleeps)).toBe(120_000);
    expect(sleeps[0]).toBe(30_000);
  });

  test("a head that changes mid-collection discards the cycle, then the consistent one settles", async () => {
    const moved = { ...ready(), pullAgain: pull({ head: { sha: "bbb222" } }) };
    const consistent = { ...ready(), pull: pull({ head: { sha: "bbb222" } }) };
    const outcome = await watch([moved, consistent]).run;
    expect(outcome.event).toMatchObject({ event: "ready_for_review", headSha: "bbb222", headVerified: true });
    expect(outcome.cycles).toBe(2);
  });

  test("a merged pull request needs a single read", async () => {
    const outcome = await watch([{ pull: pull({ merged: true, state: "closed" }) }]).run;
    expect(outcome.event.event).toBe("merged");
    expect(outcome.requestCount).toBe(1);
  });

  test("--wait-for-approval keeps waiting past readiness until a human approves", async () => {
    const approved: CycleScript = { ...ready(), reviews: [{ id: 1, state: "APPROVED", user: { login: "human", type: "User" } }], reviewDecision: "APPROVED" };
    const outcome = await watch([ready(), ready(), approved], { waitForApproval: true }).run;
    expect(outcome.event.event).toBe("approved");
    expect(outcome.cycles).toBe(3);
  });
});

describe("runWatch failure handling", () => {
  test("a transient failure recovers on the next cycle", async () => {
    const outcome = await watch([{ fail: { read: "checkRuns", kind: "transient" } }, ready()]).run;
    expect(outcome.event.event).toBe("ready_for_review");
    expect(outcome.cycles).toBe(2);
  });

  test("consecutive transient failures exhaust the budget into blocked", async () => {
    const cycles = Array.from({ length: maxConsecutiveTransientErrors }, (): CycleScript => ({ fail: { read: "pull", kind: "transient" } }));
    const outcome = await watch(cycles).run;
    expect(outcome.event).toMatchObject({ event: "blocked", reason: "transient-errors-exhausted" });
  });

  test("rate limiting backs off long and eventually blocks", async () => {
    const cycles = Array.from({ length: maxRateLimitedCycles }, (): CycleScript => ({ fail: { read: "reviews", kind: "rate-limited" } }));
    const { run: result, sleeps } = watch(cycles);
    const outcome = await result;
    expect(outcome.event).toMatchObject({ event: "blocked", reason: "rate-limited" });
    expect(sleeps).toEqual(Array.from({ length: maxRateLimitedCycles - 1 }, () => rateLimitSleepSeconds * 1000));
  });

  test("auth loss blocks immediately", async () => {
    const outcome = await watch([{ fail: { read: "pull", kind: "auth" } }, ready()]).run;
    expect(outcome.event).toMatchObject({ event: "blocked", reason: "auth" });
    expect(outcome.cycles).toBe(1);
  });

  test("the waiting deadline blocks with state flushed", async () => {
    const { run: result, saved } = watch(Array.from({ length: 10 }, pending), { timeoutSeconds: 45 });
    const outcome = await result;
    expect(outcome.event).toMatchObject({ event: "blocked", reason: "deadline" });
    expect(saved.length).toBeGreaterThan(0);
  });

  test("cancellation ends the wait cleanly with state flushed", async () => {
    const h = harness([pending(), pending(), ready()]);
    h.deps.sleep = async (ms) => {
      h.sleeps.push(ms);
      h.cancel();
    };
    const outcome = await runWatch(options, h.deps);
    expect(outcome.event).toMatchObject({ event: "blocked", reason: "cancelled" });
    expect(h.saved.at(-1)).toBeDefined();
  });

  test("an unreadable required-check policy never yields green and blocks once the budget is spent", async () => {
    const unreadable = (): CycleScript => ({ ...ready(), fail: { read: "rules", kind: "transient" } });
    const recovered = await watch([unreadable(), ready()]).run;
    expect(recovered.event.event).toBe("ready_for_review");
    expect(recovered.cycles).toBe(2);
    const exhausted = await watch(Array.from({ length: 5 }, unreadable)).run;
    expect(exhausted.event).toMatchObject({ event: "blocked", reason: "policy-unreadable" });
  });
});

describe("runWatch acknowledgement and restart", () => {
  test("a restart re-emits the unacknowledged event without touching GitHub", async () => {
    const first = await watch([failing()]).run;
    const restarted = watch([ready()], {}, { initialState: first.state });
    const outcome = await restarted.run;
    expect(outcome.event.eventId).toBe(first.event.eventId);
    expect(restarted.calls).toHaveLength(0);
  });

  test("--ack releases the pending event; the same failure stays silent and a new run wakes again", async () => {
    const first = await watch([failing()]).run;
    const acked = watch([failing(), failing(8)], { ack: first.event.eventId }, { initialState: first.state });
    const outcome = await acked.run;
    expect(outcome.event.event).toBe("checks_failed");
    expect(outcome.event.eventId).not.toBe(first.event.eventId);
    expect(outcome.cycles).toBe(2);
    expect(outcome.state.handledKeys).toContain("check:aaa111:3");
  });

  test("an ack for a different id keeps the pending event", async () => {
    const first = await watch([failing()]).run;
    const outcome = await watch([ready()], { ack: "nope" }, { initialState: first.state }).run;
    expect(outcome.event.eventId).toBe(first.event.eventId);
  });
});
