import { describe, expect, test } from "bun:test";

import {
  applyAck,
  buildEvent,
  buildGhWatchReads,
  classifyChecks,
  classifySnapshot,
  decideEvent,
  deriveApproval,
  deriveFeedback,
  deriveMergeability,
  emptyState,
  maxFailedChecks,
  maxFeedbackItems,
  maxHandledKeys,
  mergeWatchThreadPages,
  observeHead,
  parseState,
  parseWatchArgs,
  pruneState,
  reconcileCheckRuns,
  recordPending,
} from "./prWatch.ts";
import type {
  Mergeability,
  RawCheckRun,
  RawPull,
  RawReview,
  RawSnapshot,
  RawStatusContext,
  RawThread,
  RawThreadComment,
  WatchDecision,
  WatchOptions,
  WatchState,
} from "./prWatch.ts";

const now = Date.parse("2026-09-11T12:00:00Z");
const minute = 60_000;
const iso = (offsetMs: number): string => new Date(now + offsetMs).toISOString();

const options: WatchOptions = {
  owner: "o",
  repo: "r",
  pr: 7,
  waitForApproval: false,
  ack: null,
  timeoutSeconds: 100,
  intervalSeconds: 1,
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
  completed_at: iso(-minute),
  ...overrides,
});

const review = (overrides: Partial<RawReview> = {}): RawReview => ({
  id: 10,
  state: "COMMENTED",
  body: "please rename this",
  commit_id: "aaa111",
  user: { login: "reviewer", type: "User" },
  html_url: "https://github.com/o/r/pull/7#pullrequestreview-10",
  ...overrides,
});

const comment = (overrides: Partial<RawThreadComment> = {}): RawThreadComment => ({
  databaseId: 100,
  url: "https://github.com/o/r/pull/7#discussion_r100",
  body: "consider a guard here",
  createdAt: iso(-10 * minute),
  updatedAt: iso(-10 * minute),
  author: { login: "reviewer", __typename: "User" },
  ...overrides,
});

const thread = (overrides: Partial<RawThread> = {}): RawThread => ({
  id: "T1",
  isResolved: false,
  path: "src/a.ts",
  line: 5,
  comments: { nodes: [comment()] },
  ...overrides,
});

const snapshot = (overrides: Partial<RawSnapshot> = {}): RawSnapshot => ({
  pull: pull(),
  head: "aaa111",
  headAfter: "aaa111",
  checkRuns: [run()],
  statuses: [],
  reviews: [],
  threads: [],
  reviewDecision: null,
  rules: [],
  hasWorkflows: true,
  ...overrides,
});

const state = (overrides: Partial<WatchState> = {}): WatchState => ({
  ...emptyState("o/r", 7, now),
  headSha: "aaa111",
  headFirstSeenAt: now - 20 * minute,
  ...overrides,
});

const decide = (
  snap: RawSnapshot,
  carried: WatchState = state(),
  opts: WatchOptions = options,
): WatchDecision => decideEvent(classifySnapshot(snap, carried, opts, now), carried, opts);

const emitted = (decision: WatchDecision) => {
  if (decision.kind !== "emit") throw new Error(`expected emit, got wait: ${decision.blocker}`);
  return decision;
};

describe("parseWatchArgs", () => {
  test("applies defaults and parses every flag", () => {
    const parsed = parseWatchArgs([
      "o/r",
      "7",
      "--wait-for-approval",
      "--ack",
      "checks_failed:aaa:1",
      "--timeout",
      "90",
      "--interval",
      "5",
      "--check-grace",
      "30",
      "--state-dir",
      "/tmp/x",
      "--expect-check",
      "Test",
      "--expect-check",
      "Lint",
    ]);
    expect(parsed.error).toBeNull();
    expect(parsed.options).toMatchObject({
      owner: "o",
      repo: "r",
      pr: 7,
      waitForApproval: true,
      ack: "checks_failed:aaa:1",
      timeoutSeconds: 90,
      intervalSeconds: 5,
      checkGraceSeconds: 30,
      stateDir: "/tmp/x",
      expectChecks: ["Test", "Lint"],
    });
    expect(parseWatchArgs(["o/r", "7"]).options).toMatchObject({
      waitForApproval: false,
      ack: null,
      timeoutSeconds: 6 * 60 * 60,
      intervalSeconds: 30,
      checkGraceSeconds: 600,
    });
  });

  test.each([
    [[], "arguments missing"],
    [["o", "7"], "arguments missing"],
    [["o/r", "x"], "arguments missing"],
    [["o/r", "7", "--ack"], "needs a value"],
    [["o/r", "7", "--timeout", "soon"], "expects seconds"],
    [["o/r", "7", "--bogus"], "unknown flag"],
  ])("rejects %j", (argv, message) => {
    const parsed = parseWatchArgs(argv);
    expect(parsed.options).toBeNull();
    expect(parsed.error).toContain(message);
    expect(parsed.error).toContain("usage:");
  });
});

describe("buildGhWatchReads", () => {
  const reads = buildGhWatchReads({ owner: "o", repo: "r", pr: 7, head: "aaa111", base: "main" });

  test("every read is read-only and none uses gh pr checks", () => {
    for (const argv of Object.values(reads)) {
      expect(argv[0]).toBe("api");
      expect(argv).not.toContain("--method");
      expect(argv).not.toContain("-X");
      expect(argv).not.toContain("--input");
      expect(argv.join(" ")).not.toContain("pr checks");
    }
    const bindings = reads.threads.filter((arg) => arg === "-f" || arg === "-F");
    expect(bindings).toHaveLength(4);
    expect(reads.threads.at(-1)).toContain("reviewThreads(first: 100, after: $endCursor)");
    expect(reads.threads.at(-1)).toContain("pageInfo { hasNextPage endCursor }");
  });

  test("paginates the multi-page reads and targets the head", () => {
    expect(reads.checkRuns).toContain("--paginate");
    expect(reads.reviews).toContain("--paginate");
    expect(reads.threads).toContain("--paginate");
    expect(reads.checkRuns[1]).toContain("/commits/aaa111/check-runs");
    expect(reads.statuses[1]).toContain("/commits/aaa111/status");
    expect(reads.rules[1]).toBe("repos/o/r/rules/branches/main");
  });
});

describe("mergeWatchThreadPages", () => {
  test("merges thread nodes across pages and keeps the review decision", () => {
    const page = (ids: string[], decision: string) => ({
      data: {
        repository: {
          pullRequest: {
            reviewDecision: decision,
            reviewThreads: { nodes: ids.map((id) => thread({ id })) },
          },
        },
      },
    });
    const merged = mergeWatchThreadPages([page(["T1", "T2"], "APPROVED"), page(["T3"], "APPROVED")]);
    expect(merged.threads.map((node) => node.id)).toEqual(["T1", "T2", "T3"]);
    expect(merged.reviewDecision).toBe("APPROVED");
    expect(mergeWatchThreadPages([])).toEqual({ threads: [], reviewDecision: null });
  });
});

describe("reconcileCheckRuns", () => {
  test("keeps the newest run per name and app, so a rerun supersedes a cancelled first attempt", () => {
    const runs = [
      run({ id: 1, conclusion: "cancelled" }),
      run({ id: 2, conclusion: "success" }),
      run({ id: 3, name: "Test", app: { slug: "other-app" }, conclusion: "failure" }),
    ];
    const kept = reconcileCheckRuns(runs).map((item) => item.id);
    expect(kept).toEqual([2, 3]);
  });
});

describe("classifyChecks", () => {
  const classify = (
    runs: RawCheckRun[],
    extra: Partial<Parameters<typeof classifyChecks>[0]> = {},
  ) =>
    classifyChecks({
      runs,
      statuses: [],
      expected: [],
      hasWorkflows: true,
      headFirstSeenAt: now - 20 * minute,
      now,
      graceMs: 600_000,
      ...extra,
    });

  test("queued and in-progress runs are pending, never settled", () => {
    const summary = classify([run({ id: 1, status: "in_progress", conclusion: null })]);
    expect(summary.pendingCount).toBe(1);
    expect(summary.settled).toBe(false);
  });

  test.each(["success", "skipped", "neutral"])("%s passes", (conclusion) => {
    const summary = classify([run({ conclusion })]);
    expect(summary.passedCount).toBe(1);
    expect(summary.settled).toBe(true);
  });

  test.each(["failure", "timed_out", "action_required", "stale"])("%s fails", (conclusion) => {
    const summary = classify([run({ id: 9, conclusion })]);
    expect(summary.failed.map((item) => item.runId)).toEqual(["9"]);
  });

  test("a fresh unsuperseded cancellation is pending, an old one is a failure", () => {
    const fresh = classify([run({ conclusion: "cancelled", completed_at: iso(-minute) })]);
    expect(fresh.pendingCount).toBe(1);
    const old = classify([run({ conclusion: "cancelled", completed_at: iso(-30 * minute) })]);
    expect(old.failed).toHaveLength(1);
  });

  test("a cancelled run superseded by a green rerun reads green", () => {
    const summary = classify([run({ id: 1, conclusion: "cancelled" }), run({ id: 2 })]);
    expect(summary.passedCount).toBe(1);
    expect(summary.pendingCount).toBe(0);
    expect(summary.settled).toBe(true);
  });

  test("commit statuses classify alongside check runs", () => {
    const statuses: RawStatusContext[] = [
      { id: 5, context: "ci/lint", state: "failure", target_url: "https://ci/5" },
      { id: 6, context: "ci/build", state: "pending" },
    ];
    const summary = classify([], { statuses });
    expect(summary.failed.map((item) => item.name)).toEqual(["ci/lint"]);
    expect(summary.pendingCount).toBe(1);
  });

  test("an empty head with no workflows and no policy is settled as check-free evidence", () => {
    const summary = classify([], { hasWorkflows: false });
    expect(summary).toMatchObject({ settled: true, note: "no-checks-configured", blockedReason: null });
  });

  test("an empty head with workflows waits the grace period, then blocks — never green", () => {
    const early = classify([], { headFirstSeenAt: now - minute });
    expect(early).toMatchObject({ settled: false, blockedReason: null });
    const late = classify([]);
    expect(late).toMatchObject({ settled: false, blockedReason: "no-checks-registered" });
    const unknown = classify([], { hasWorkflows: null });
    expect(unknown.settled).toBe(false);
  });

  test("an expected check that never registers is pending, then a blocker; once registered it counts", () => {
    const early = classify([run()], { expected: ["Lint"], headFirstSeenAt: now - minute });
    expect(early).toMatchObject({ missing: ["Lint"], settled: false, blockedReason: null });
    const late = classify([run()], { expected: ["Lint"] });
    expect(late.blockedReason).toBe("expected-check-missing");
    const registered = classify([run(), run({ id: 2, name: "Lint" })], { expected: ["Lint"] });
    expect(registered).toMatchObject({ missing: [], settled: true });
  });
});

describe("deriveMergeability", () => {
  const cases: [RawPull, Mergeability][] = [
    [pull({ merged: true, state: "closed" }), "merged"],
    [pull({ state: "closed" }), "closed"],
    [pull({ mergeable: false, mergeable_state: "dirty" }), "conflicting"],
    [pull({ mergeable: null, mergeable_state: "unknown" }), "unknown"],
    [pull({ mergeable: true, mergeable_state: "blocked" }), "ok"],
  ];

  test.each(cases)("reads %j", (raw, expected) => {
    expect(deriveMergeability(raw)).toBe(expected);
  });
});

describe("deriveFeedback", () => {
  const feedback = (reviews: RawReview[], threads: RawThread[], previouslyResolved: string[] = []) =>
    deriveFeedback({ author: "author", reviews, threads, previouslyResolved });

  test("changes-requested and commented reviews with a body are actionable; approvals, bots and the author are not", () => {
    const items = feedback(
      [
        review({ id: 1, state: "CHANGES_REQUESTED", body: "" }),
        review({ id: 2, state: "COMMENTED" }),
        review({ id: 3, state: "COMMENTED", body: "  " }),
        review({ id: 4, state: "APPROVED", body: "lgtm" }),
        review({ id: 5, state: "COMMENTED", user: { login: "coderabbitai[bot]", type: "Bot" } }),
        review({ id: 6, state: "COMMENTED", user: { login: "author", type: "User" } }),
      ],
      [],
    ).items;
    expect(items.map((item) => item.key)).toEqual(["review:1", "review:2"]);
    expect(items[0]).toMatchObject({ kind: "review", state: "CHANGES_REQUESTED", commitSha: "aaa111" });
  });

  test("an unresolved reviewer thread is actionable until the author replies after it", () => {
    expect(feedback([], [thread()]).items.map((item) => item.key)).toEqual([
      `thread:T1:${iso(-10 * minute)}`,
    ]);
    const answered = thread({
      comments: {
        nodes: [comment(), comment({ databaseId: 101, author: { login: "author" }, createdAt: iso(-5 * minute), updatedAt: iso(-5 * minute) })],
      },
    });
    expect(feedback([], [answered]).items).toEqual([]);
  });

  test("a reviewer edit after the author's reply is a new, edited item with a new key", () => {
    const edited = thread({
      comments: {
        nodes: [
          comment({ updatedAt: iso(-2 * minute) }),
          comment({ databaseId: 101, author: { login: "author" }, createdAt: iso(-5 * minute), updatedAt: iso(-5 * minute) }),
        ],
      },
    });
    const [item] = feedback([], [edited]).items;
    expect(item).toMatchObject({ key: `thread:T1:${iso(-2 * minute)}`, edited: true, reviewer: "reviewer" });
  });

  test("resolved threads produce nothing and are reported; a reopened one is actionable even when answered", () => {
    const resolved = feedback([], [thread({ isResolved: true })]);
    expect(resolved.items).toEqual([]);
    expect(resolved.resolvedThreadIds).toEqual(["T1"]);
    const answered = thread({
      comments: {
        nodes: [comment(), comment({ databaseId: 101, author: { login: "author" }, createdAt: iso(-5 * minute), updatedAt: iso(-5 * minute) })],
      },
    });
    const reopened = feedback([], [answered], ["T1"]);
    expect(reopened.items.map((item) => item.key)).toEqual(["thread:T1:reopened:100"]);
    expect(reopened.items[0].reopened).toBe(true);
  });

  test("bot-only and author-only threads never wake, and output order is deterministic", () => {
    const botThread = thread({
      id: "T2",
      comments: { nodes: [comment({ author: { login: "coderabbitai[bot]", __typename: "Bot" } })] },
    });
    const authorThread = thread({ id: "T3", comments: { nodes: [comment({ author: { login: "author" } })] } });
    expect(feedback([], [botThread, authorThread]).items).toEqual([]);
    const a = feedback([review({ id: 2 })], [thread(), thread({ id: "T0" })]).items.map((item) => item.key);
    const b = feedback([review({ id: 2 })], [thread({ id: "T0" }), thread()]).items.map((item) => item.key);
    expect(a).toEqual(b);
  });
});

describe("deriveApproval", () => {
  const approval = (reviews: RawReview[], reviewDecision: string | null = null, requiredApprovals: number | null = null) =>
    deriveApproval({ author: "author", reviews, reviewDecision, requiredApprovals });

  test("the latest binding review per login wins; a comment never clears an approval, a dismissal does", () => {
    const stillApproved = approval([review({ id: 1, state: "APPROVED" }), review({ id: 2, state: "COMMENTED" })]);
    expect(stillApproved).toMatchObject({ approvedBy: ["reviewer"], humanApproval: true });
    const dismissed = approval([review({ id: 1, state: "APPROVED" }), review({ id: 2, state: "DISMISSED" })]);
    expect(dismissed).toMatchObject({ approvedBy: [], humanApproval: false });
  });

  test("bot approvals never substitute for a required human approval", () => {
    const summary = approval([review({ id: 1, state: "APPROVED", user: { login: "ai-review[bot]", type: "Bot" } })], "APPROVED");
    expect(summary.humanApproval).toBe(false);
  });

  test("the repository's review decision and required count both gate approval", () => {
    expect(approval([review({ id: 1, state: "APPROVED" })], "REVIEW_REQUIRED").humanApproval).toBe(false);
    expect(approval([review({ id: 1, state: "APPROVED" })], "APPROVED", 2).humanApproval).toBe(false);
    const two = [review({ id: 1, state: "APPROVED" }), review({ id: 2, state: "APPROVED", user: { login: "second" } })];
    expect(approval(two, "APPROVED", 2).humanApproval).toBe(true);
  });

  test("a changes-requested review stays binding on an older commit and is reported with it", () => {
    const summary = approval([review({ id: 1, state: "CHANGES_REQUESTED", commit_id: "old000" })], "CHANGES_REQUESTED");
    expect(summary.changesRequestedBy).toEqual([{ login: "reviewer", commitSha: "old000" }]);
    expect(summary.humanApproval).toBe(false);
  });
});

describe("decideEvent precedence", () => {
  test("merged and closed are terminal before anything else", () => {
    expect(emitted(decide(snapshot({ pull: pull({ merged: true, state: "closed" }), checkRuns: [run({ conclusion: "failure" })] }))).event).toBe("merged");
    expect(emitted(decide(snapshot({ pull: pull({ state: "closed" }) }))).event).toBe("closed");
  });

  test("a head that changed during collection discards the cycle instead of reporting stale green or red", () => {
    expect(decide(snapshot({ headAfter: "bbb222" }))).toEqual({ kind: "wait", blocker: "head-changed" });
    expect(decide(snapshot({ headAfter: "bbb222", checkRuns: [run({ conclusion: "failure" })] }))).toEqual({
      kind: "wait",
      blocker: "head-changed",
    });
  });

  test("a conflict wins over an approval and over failed checks, and an acknowledged conflict waits", () => {
    const conflicting = snapshot({
      pull: pull({ mergeable: false, mergeable_state: "dirty" }),
      checkRuns: [run({ conclusion: "failure" })],
      reviews: [review({ state: "APPROVED" })],
      reviewDecision: "APPROVED",
    });
    const decision = emitted(decide(conflicting, state(), { ...options, waitForApproval: true }));
    expect(decision).toMatchObject({ event: "conflict", keys: ["conflict:aaa111"], terminal: false });
    const acked = state({ handledKeys: ["conflict:aaa111", "check:aaa111:1"] });
    expect(decide(conflicting, acked)).toEqual({ kind: "wait", blocker: "conflict-acknowledged" });
  });

  test("failed checks emit once per run id; an acknowledged failure waits and a rerun wakes again", () => {
    const failing = snapshot({
      checkRuns: [run({ id: 3, conclusion: "failure" }), run({ id: 4, name: "Lint", status: "in_progress", conclusion: null })],
    });
    expect(emitted(decide(failing))).toMatchObject({ event: "checks_failed", keys: ["check:aaa111:3"], terminal: false });
    const acked = state({ handledKeys: ["check:aaa111:3"] });
    expect(decide(failing, acked)).toEqual({ kind: "wait", blocker: "checks-failed-acknowledged" });
    const rerun = snapshot({ checkRuns: [run({ id: 5, conclusion: "failure" })] });
    expect(emitted(decide(rerun, acked)).keys).toEqual(["check:aaa111:5"]);
  });

  test("unresolved check discovery becomes a blocker after the grace period", () => {
    expect(emitted(decide(snapshot({ checkRuns: [] })))).toMatchObject({ event: "blocked", reason: "no-checks-registered" });
    const expecting = { ...options, expectChecks: ["Lint"] };
    expect(emitted(decide(snapshot(), state(), expecting))).toMatchObject({ event: "blocked", reason: "expected-check-missing" });
  });

  test("new feedback wakes with only the unhandled items; acknowledged feedback lets readiness through", () => {
    const withFeedback = snapshot({ reviews: [review({ id: 2 })], threads: [thread()] });
    const decision = emitted(decide(withFeedback, state({ handledKeys: ["review:2"] })));
    expect(decision).toMatchObject({ event: "review_action_required", keys: [`thread:T1:${iso(-10 * minute)}`], terminal: false });
    expect(decision.feedback.map((item) => item.kind)).toEqual(["thread"]);
    const acked = state({ handledKeys: ["review:2", `thread:T1:${iso(-10 * minute)}`] });
    expect(emitted(decide(withFeedback, acked)).event).toBe("ready_for_review");
  });

  test("feedback is reported while checks are still pending — the model need not wait for green to answer", () => {
    const pending = snapshot({ checkRuns: [run({ status: "queued", conclusion: null })], reviews: [review({ id: 2 })] });
    expect(emitted(decide(pending)).event).toBe("review_action_required");
  });

  test("unknown mergeability, pending checks and missing expected checks wait silently", () => {
    expect(decide(snapshot({ pull: pull({ mergeable: null, mergeable_state: "unknown" }) }))).toEqual({ kind: "wait", blocker: "mergeability-unknown" });
    expect(decide(snapshot({ checkRuns: [run({ status: "queued", conclusion: null })] }))).toEqual({ kind: "wait", blocker: "checks-pending: 1" });
    const early = state({ headFirstSeenAt: now - minute });
    expect(decide(snapshot(), early, { ...options, expectChecks: ["Lint"] })).toEqual({ kind: "wait", blocker: "checks-missing: Lint" });
  });

  test("changing only the count of successful jobs never produces an event", () => {
    const pendingOne = snapshot({ checkRuns: [run({ id: 1 }), run({ id: 2, name: "Lint", status: "in_progress", conclusion: null })] });
    const pendingMore = snapshot({
      checkRuns: [run({ id: 1 }), run({ id: 3, name: "Build" }), run({ id: 4, name: "Pack" }), run({ id: 2, name: "Lint", status: "in_progress", conclusion: null })],
    });
    expect(decide(pendingOne).kind).toBe("wait");
    expect(decide(pendingMore).kind).toBe("wait");
  });

  test("readiness is the default terminal; approval waits for a human under --wait-for-approval", () => {
    expect(emitted(decide(snapshot())).event).toBe("ready_for_review");
    const waiting = { ...options, waitForApproval: true };
    expect(decide(snapshot(), state(), waiting)).toEqual({ kind: "wait", blocker: "awaiting-approval" });
    const botApproved = snapshot({ reviews: [review({ state: "APPROVED", user: { login: "ai[bot]", type: "Bot" } })], reviewDecision: "APPROVED" });
    expect(decide(botApproved, state(), waiting)).toEqual({ kind: "wait", blocker: "awaiting-approval" });
    const humanApproved = snapshot({ reviews: [review({ state: "APPROVED" })], reviewDecision: "APPROVED" });
    expect(emitted(decide(humanApproved, state(), waiting)).event).toBe("approved");
  });

  test("a standing changes-requested verdict is reported on readiness rather than blocking it forever", () => {
    const standing = snapshot({ reviews: [review({ id: 2, state: "CHANGES_REQUESTED", body: "" })], reviewDecision: "CHANGES_REQUESTED" });
    const classified = classifySnapshot(standing, state({ handledKeys: ["review:2"] }), options, now);
    expect(decideEvent(classified, state({ handledKeys: ["review:2"] }), options)).toMatchObject({ kind: "emit", event: "ready_for_review" });
    expect(classified.review.changesRequestedBy).toEqual([{ login: "reviewer", commitSha: "aaa111" }]);
  });
});

describe("buildEvent", () => {
  const build = (decision: WatchDecision, snap: RawSnapshot = snapshot()) =>
    buildEvent({ decision: emitted(decision), classified: classifySnapshot(snap, state(), options, now), options, stateFile: "/s.json", logFile: "/s.log" });

  test("carries schema version, verified head, links and state references", () => {
    const event = build(decide(snapshot()));
    expect(event).toMatchObject({ schemaVersion: 1, event: "ready_for_review", repo: "o/r", pr: 7, headSha: "aaa111", headVerified: true, base: "main", terminal: true, state: { file: "/s.json", log: "/s.log" } });
    expect(event.url).toBe("https://github.com/o/r/pull/7");
  });

  test("the event id is stable across identical evidence regardless of key order", () => {
    const decision = emitted(decide(snapshot({ checkRuns: [run({ id: 3, conclusion: "failure" }), run({ id: 4, name: "Lint", conclusion: "failure" })] })));
    const a = build({ ...decision, keys: [...decision.keys] });
    const b = build({ ...decision, keys: [...decision.keys].reverse() });
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId.startsWith("checks_failed:aaa111:")).toBe(true);
  });

  test("output is bounded: failed checks and feedback are capped and flagged", () => {
    const runs = Array.from({ length: maxFailedChecks + 30 }, (_, index) => run({ id: index + 1, name: `Job ${index}`, conclusion: "failure" }));
    const failed = build(decide(snapshot({ checkRuns: runs })), snapshot({ checkRuns: runs }));
    expect(failed.checks.failed).toHaveLength(maxFailedChecks);
    expect(failed.checks.truncated).toBe(true);
    const reviews = Array.from({ length: maxFeedbackItems + 5 }, (_, index) => review({ id: index + 1, body: "x".repeat(2000) }));
    const withFeedback = snapshot({ reviews });
    const feedback = build(decide(withFeedback), withFeedback);
    expect(feedback.feedback).toHaveLength(maxFeedbackItems);
    expect(feedback.feedbackTruncated).toBe(true);
    expect(feedback.feedback[0].body).toHaveLength(400);
    expect(JSON.stringify(feedback).length).toBeLessThan(64_000);
  });
});

describe("state", () => {
  test("parseState starts fresh on malformed, foreign or mis-keyed content", () => {
    expect(parseState("not json", "o/r", 7, now).handledKeys).toEqual([]);
    expect(parseState(JSON.stringify({ ...state(), repo: "x/y" }), "o/r", 7, now).headSha).toBeNull();
    expect(parseState(JSON.stringify({ schemaVersion: 2 }), "o/r", 7, now).pending).toBeNull();
  });

  test("parseState round-trips a valid file including the pending event", () => {
    const event = buildEvent({ decision: emitted(decide(snapshot({ checkRuns: [run({ conclusion: "failure" })] }))), classified: null, options, stateFile: null, logFile: null });
    const pending = recordPending(state(), event, ["check:aaa111:1"]);
    const restored = parseState(JSON.stringify(pending), "o/r", 7, now);
    expect(restored.pending?.eventId).toBe(event.eventId);
    expect(restored.headSha).toBe("aaa111");
  });

  test("applyAck moves the pending keys to handled only for the matching id", () => {
    const event = buildEvent({ decision: emitted(decide(snapshot({ checkRuns: [run({ conclusion: "failure" })] }))), classified: null, options, stateFile: null, logFile: null });
    const pending = recordPending(state(), event, ["check:aaa111:1"]);
    expect(applyAck(pending, "other").pending).not.toBeNull();
    expect(applyAck(pending, null).pending).not.toBeNull();
    const acked = applyAck(pending, event.eventId);
    expect(acked.pending).toBeNull();
    expect(acked.handledKeys).toEqual(["check:aaa111:1"]);
  });

  test("observeHead restarts the grace clock on a new head and pruneState bounds the keys", () => {
    const same = observeHead(state(), "aaa111", now);
    expect(same.headFirstSeenAt).toBe(now - 20 * minute);
    const moved = observeHead(state(), "bbb222", now);
    expect(moved).toMatchObject({ headSha: "bbb222", headFirstSeenAt: now });
    const many = Array.from({ length: maxHandledKeys + 50 }, (_, index) => `k${index}`);
    const pruned = pruneState(state({ handledKeys: [...many, "k0"] }));
    expect(pruned.handledKeys).toHaveLength(maxHandledKeys);
    expect(pruned.handledKeys.at(-1)).toBe(`k${maxHandledKeys + 49}`);
  });
});
