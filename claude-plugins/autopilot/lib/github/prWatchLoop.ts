// The watcher's fetch → verify → classify → decide → sleep loop, written against
// injected dependencies (gh reads, clock, sleep, state store, log, cancellation)
// so prWatchLoop.test.ts drives hours of simulated waiting in milliseconds and
// proves that no output leaves the process until a single actionable or
// terminal event exists. watch-pr.ts binds the real dependencies.
//
// Runs under Node's native type stripping (Node >=24) and Bun without a build
// step, so it ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// Usage:
//   import { runWatch } from "./prWatchLoop.ts";
//   const { event, state } = await runWatch(options, deps);

import {
  applyAck,
  buildEvent,
  buildGhWatchReads,
  classifySnapshot,
  decideEvent,
  emptyState,
  maxConsecutiveTransientErrors,
  maxIntervalSeconds,
  maxPolicyReadFailures,
  maxRateLimitedCycles,
  mergeWatchThreadPages,
  observeHead,
  parseState,
  pruneState,
  rateLimitSleepSeconds,
  recordPending,
} from "./prWatch.ts";
import type {
  BlockedReason,
  ClassifiedSnapshot,
  RawCheckRunsPage,
  RawCombinedStatus,
  RawPull,
  RawReview,
  RawRule,
  RawSnapshot,
  WatchDecision,
  WatchEvent,
  WatchOptions,
  WatchState,
  WatchThreadPage,
} from "./prWatch.ts";
import { parseGhPaginatedJson } from "./reviewThreads.ts";

/** How a `gh` read ended; anything but `ok` and `not-found` is an error class. */
export type GhReadKind = "ok" | "not-found" | "auth" | "rate-limited" | "transient";

/** One `gh` read as the loop sees it. */
export interface GhReadResult {
  stdout: string | null;
  kind: GhReadKind;
  error: string | null;
}

/** The dependencies `runWatch` needs; the CLI binds real ones, tests bind fakes. */
export interface WatchDeps {
  readGh: (args: string[]) => Promise<GhReadResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  loadState: () => Promise<string | null>;
  saveState: (state: WatchState) => Promise<void>;
  log: (line: string) => void;
  isCancelled: () => boolean;
  stateFile: string | null;
  logFile: string | null;
}

/** What one run produced. */
export interface WatchRun {
  event: WatchEvent;
  state: WatchState;
  cycles: number;
  requestCount: number;
}

interface PolicyReads {
  head: string;
  rules: RawRule[] | null;
  hasWorkflows: boolean | null;
}

type Collected = { snapshot: RawSnapshot; requests: number } | { failure: GhReadKind; detail: string };

interface LoopCounters {
  transientErrors: number;
  rateLimitedCycles: number;
  policyFailures: number;
  interval: number;
  fingerprint: string | null;
  cycles: number;
  requests: number;
}

const parsePull = (stdout: string): RawPull | null => {
  const [document] = parseGhPaginatedJson<RawPull>(stdout);
  return document && typeof document.state === "string" ? document : null;
};

const errorPriority: Record<GhReadKind, number> = {
  auth: 3,
  "rate-limited": 2,
  transient: 1,
  "not-found": 1,
  ok: 0,
};

const worstFailure = (reads: GhReadResult[]): GhReadResult | null =>
  reads
    .filter((read) => read.kind !== "ok")
    .sort((a, b) => errorPriority[b.kind] - errorPriority[a.kind])[0] ?? null;

const readPolicy = async (
  deps: WatchDeps,
  reads: { rules: string[]; workflows: string[] },
  head: string,
): Promise<PolicyReads> => {
  const [rules, workflows] = await Promise.all([deps.readGh(reads.rules), deps.readGh(reads.workflows)]);
  const parsedRules =
    rules.kind === "ok"
      ? parseGhPaginatedJson<RawRule[]>(rules.stdout ?? "")[0] ?? []
      : rules.kind === "not-found"
        ? []
        : null;
  const parsedWorkflows =
    workflows.kind === "ok"
      ? (parseGhPaginatedJson<unknown[]>(workflows.stdout ?? "")[0] ?? []).length > 0
      : workflows.kind === "not-found"
        ? false
        : null;
  return { head, rules: parsedRules, hasWorkflows: parsedWorkflows };
};

/** One cycle's reads: pull, the per-head reads in parallel, then the pull again. */
async function collect(
  options: WatchOptions,
  deps: WatchDeps,
  policy: PolicyReads | null,
): Promise<Collected & { policy?: PolicyReads }> {
  const first = await deps.readGh(buildGhWatchReads({ ...options, head: "", base: "" }).pull);
  if (first.kind !== "ok") return { failure: first.kind, detail: `pull: ${first.error}` };
  const pull = parsePull(first.stdout ?? "");
  if (pull === null) return { failure: "transient", detail: "pull: unrecognized payload shape" };
  const head = pull.head?.sha ?? "";
  const base = pull.base?.ref ?? "";

  if (pull.state === "closed") {
    const snapshot: RawSnapshot = {
      pull,
      head,
      headAfter: head,
      checkRuns: [],
      statuses: [],
      reviews: [],
      threads: [],
      reviewDecision: null,
      rules: [],
      hasWorkflows: null,
    };
    return { snapshot, requests: 1 };
  }

  const reads = buildGhWatchReads({ ...options, head, base });
  const [checkRuns, statuses, reviews, threads, nextPolicy] = await Promise.all([
    deps.readGh(reads.checkRuns),
    deps.readGh(reads.statuses),
    deps.readGh(reads.reviews),
    deps.readGh(reads.threads),
    policy?.head === head && policy.rules !== null ? Promise.resolve(policy) : readPolicy(deps, reads, head),
  ]);
  const failed = worstFailure([checkRuns, statuses, reviews, threads]);
  if (failed !== null) return { failure: failed.kind === "not-found" ? "transient" : failed.kind, detail: failed.error ?? "" };

  const again = await deps.readGh(reads.pull);
  if (again.kind !== "ok") return { failure: again.kind, detail: `pull re-read: ${again.error}` };
  const headAfter = parsePull(again.stdout ?? "")?.head?.sha ?? "";

  const pages = parseGhPaginatedJson<WatchThreadPage>(threads.stdout ?? "");
  const merged = mergeWatchThreadPages(pages);
  const snapshot: RawSnapshot = {
    pull,
    head,
    headAfter,
    checkRuns: parseGhPaginatedJson<RawCheckRunsPage>(checkRuns.stdout ?? "").flatMap(
      (page) => page.check_runs ?? [],
    ),
    statuses: parseGhPaginatedJson<RawCombinedStatus>(statuses.stdout ?? "")[0]?.statuses ?? [],
    reviews: parseGhPaginatedJson<RawReview[]>(reviews.stdout ?? "").flat(),
    threads: merged.threads,
    reviewDecision: merged.reviewDecision,
    rules: nextPolicy.rules,
    hasWorkflows: nextPolicy.hasWorkflows,
  };
  const requests = 6 + (nextPolicy === policy ? 0 : 2);
  return { snapshot, requests, policy: nextPolicy };
}

const fingerprintOf = (classified: ClassifiedSnapshot): string =>
  JSON.stringify({
    head: classified.head,
    mergeability: classified.mergeability,
    failed: classified.checks.failed.map((item) => item.runId),
    pending: classified.checks.pendingCount,
    passed: classified.checks.passedCount,
    missing: classified.checks.missing,
    feedback: classified.feedback.map((item) => item.key),
    review: classified.review,
  });

const blockedDecision = (reason: BlockedReason): Extract<WatchDecision, { kind: "emit" }> => ({
  kind: "emit",
  event: "blocked",
  reason,
  keys: [],
  terminal: true,
  feedback: [],
});

/**
 * Wait inside the process until one event exists. Pending CI, unknown
 * mergeability and unchanged feedback never leave this function; the model is
 * woken exactly once, by the return value.
 */
export async function runWatch(options: WatchOptions, deps: WatchDeps): Promise<WatchRun> {
  const repo = `${options.owner}/${options.repo}`;
  const raw = await deps.loadState();
  let state = applyAck(
    raw === null ? emptyState(repo, options.pr, deps.now()) : parseState(raw, repo, options.pr, deps.now()),
    options.ack,
  );
  const counters: LoopCounters = {
    transientErrors: 0,
    rateLimitedCycles: 0,
    policyFailures: 0,
    interval: options.intervalSeconds,
    fingerprint: null,
    cycles: 0,
    requests: 0,
  };
  const finish = (event: WatchEvent, nextState: WatchState): WatchRun => ({
    event,
    state: nextState,
    cycles: counters.cycles,
    requestCount: counters.requests,
  });
  const build = (decision: Extract<WatchDecision, { kind: "emit" }>, classified: ClassifiedSnapshot | null) =>
    buildEvent({ decision, classified, options, stateFile: deps.stateFile, logFile: deps.logFile });

  if (options.ack !== null) await deps.saveState(state);
  if (state.pending !== null) {
    deps.log(`re-emitting unacknowledged event ${state.pending.eventId}`);
    return finish(state.pending.event, state);
  }

  const deadline = deps.now() + options.timeoutSeconds * 1000;
  let policy: PolicyReads | null = null;
  let lastClassified: ClassifiedSnapshot | null = null;

  const stop = async (reason: BlockedReason): Promise<WatchRun> => {
    deps.log(`blocked: ${reason}`);
    await deps.saveState(state);
    return finish(build(blockedDecision(reason), lastClassified), state);
  };

  while (true) {
    if (deps.isCancelled()) return stop("cancelled");
    if (deps.now() >= deadline) return stop("deadline");
    counters.cycles += 1;

    const collected = await collect(options, deps, policy);
    if ("failure" in collected) {
      deps.log(`cycle ${counters.cycles}: read failed (${collected.failure}) ${collected.detail}`);
      if (collected.failure === "auth") return stop("auth");
      if (collected.failure === "rate-limited") {
        counters.rateLimitedCycles += 1;
        if (counters.rateLimitedCycles >= maxRateLimitedCycles) return stop("rate-limited");
        await deps.sleep(rateLimitSleepSeconds * 1000);
        continue;
      }
      counters.transientErrors += 1;
      if (counters.transientErrors >= maxConsecutiveTransientErrors) return stop("transient-errors-exhausted");
      await deps.sleep(Math.min(counters.interval * 2, maxIntervalSeconds) * 1000);
      continue;
    }

    counters.requests += collected.requests;
    counters.transientErrors = 0;
    counters.rateLimitedCycles = 0;
    policy = collected.policy ?? policy;
    const { snapshot } = collected;
    state = observeHead(state, snapshot.head, deps.now());

    if (snapshot.rules === null) {
      counters.policyFailures += 1;
      deps.log(`cycle ${counters.cycles}: required-check policy unreadable (${counters.policyFailures})`);
      if (counters.policyFailures >= maxPolicyReadFailures) return stop("policy-unreadable");
      await deps.sleep(counters.interval * 1000);
      continue;
    }
    counters.policyFailures = 0;

    const classified = classifySnapshot(snapshot, state, options, deps.now());
    lastClassified = classified;
    const decision = decideEvent(classified, state, options);
    state = pruneState({ ...state, resolvedThreads: classified.resolvedThreadIds });

    if (decision.kind === "emit") {
      const event = build(decision, classified);
      if (!decision.terminal) state = recordPending(state, event, decision.keys);
      await deps.saveState(state);
      deps.log(`cycle ${counters.cycles}: emit ${event.eventId}`);
      return finish(event, state);
    }

    const fingerprint = fingerprintOf(classified);
    counters.interval =
      fingerprint === counters.fingerprint
        ? Math.min(counters.interval * 1.5, maxIntervalSeconds)
        : options.intervalSeconds;
    counters.fingerprint = fingerprint;
    await deps.saveState(state);
    deps.log(`cycle ${counters.cycles}: wait (${decision.blocker}) next in ${counters.interval}s`);
    await deps.sleep(counters.interval * 1000);
  }
}
