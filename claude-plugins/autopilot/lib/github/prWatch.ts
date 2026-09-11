// Pure transforms for the PR watcher: parse its arguments, name its read-only
// `gh` reads, classify one snapshot of a pull request (checks, mergeability,
// review feedback, approval), decide which single event — if any — the snapshot
// earns, and carry the durable acknowledgement state between runs. No I/O lives
// here — the loop in prWatchLoop.ts and the CLI in watch-pr.ts are thin shells
// around these functions, so the fixture tests in prWatch.test.ts exercise the
// exact production paths.
//
// Runs under Node's native type stripping (Node >=24) and Bun without a build
// step, so it ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// Usage:
//   import { classifySnapshot, decideEvent, parseWatchArgs } from "./prWatch.ts";
//   const { options } = parseWatchArgs(process.argv.slice(2));
//   const classified = classifySnapshot(snapshot, state, options, Date.now());
//   const decision = decideEvent(classified, state, options);

/** The one event type a watcher run ends with. */
export type WatchEventType =
  | "ready_for_review"
  | "approved"
  | "merged"
  | "closed"
  | "checks_failed"
  | "review_action_required"
  | "conflict"
  | "blocked";

/** Why a `blocked` event was emitted. */
export type BlockedReason =
  | "usage"
  | "auth"
  | "rate-limited"
  | "transient-errors-exhausted"
  | "policy-unreadable"
  | "no-checks-registered"
  | "expected-check-missing"
  | "deadline"
  | "cancelled";

/** Parsed CLI options. */
export interface WatchOptions {
  owner: string;
  repo: string;
  pr: number;
  waitForApproval: boolean;
  ack: string | null;
  timeoutSeconds: number;
  intervalSeconds: number;
  checkGraceSeconds: number;
  stateDir: string | null;
  expectChecks: string[];
}

/** `parseWatchArgs` result: exactly one of `options` and `error` is non-null. */
export interface ParsedWatchArgs {
  options: WatchOptions | null;
  error: string | null;
}

/** The REST `pulls/{n}` fields the watcher consumes. */
export interface RawPull {
  state: string;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  html_url?: string;
  head?: { sha?: string };
  base?: { ref?: string };
  user?: { login?: string };
}

/** One `check-runs` entry for a commit. */
export interface RawCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion?: string | null;
  html_url?: string | null;
  completed_at?: string | null;
  app?: { slug?: string | null } | null;
}

/** A page of the paginated `check-runs` read. */
export interface RawCheckRunsPage {
  check_runs?: RawCheckRun[];
}

/** One context of the combined `commits/{sha}/status` read. */
export interface RawStatusContext {
  id: number;
  context: string;
  state: string;
  target_url?: string | null;
}

/** The combined status document. */
export interface RawCombinedStatus {
  statuses?: RawStatusContext[];
}

/** A REST review from `pulls/{n}/reviews`. */
export interface RawReview {
  id: number;
  state: string;
  body?: string | null;
  commit_id?: string | null;
  submitted_at?: string | null;
  html_url?: string | null;
  user?: { login?: string; type?: string } | null;
}

/** A branch rule from `rules/branches/{base}`. */
export interface RawRule {
  type: string;
  parameters?: {
    required_status_checks?: { context: string }[];
    required_approving_review_count?: number;
  } | null;
}

/** One comment of a GraphQL review thread. */
export interface RawThreadComment {
  databaseId?: number | null;
  url?: string | null;
  body?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  author?: { login?: string; __typename?: string } | null;
}

/** A GraphQL `reviewThreads` node with the fields feedback detection needs. */
export interface RawThread {
  id: string;
  isResolved: boolean;
  path?: string | null;
  line?: number | null;
  comments?: { nodes?: RawThreadComment[] } | null;
}

/** A parsed page of the watcher's GraphQL query. */
export interface WatchThreadPage {
  data?: {
    repository?: {
      pullRequest?: {
        reviewDecision?: string | null;
        reviewThreads?: { nodes?: RawThread[] };
      };
    };
  };
}

/** Everything one cycle collected from GitHub, before classification. */
export interface RawSnapshot {
  pull: RawPull;
  /** The head SHA the per-head reads were issued against. */
  head: string;
  /** The head SHA re-read after the per-head reads completed. */
  headAfter: string;
  checkRuns: RawCheckRun[];
  statuses: RawStatusContext[];
  reviews: RawReview[];
  threads: RawThread[];
  reviewDecision: string | null;
  /** `null` when the rules read failed (policy unreadable this cycle). */
  rules: RawRule[] | null;
  /** `null` when the workflows read failed (evidence unknown). */
  hasWorkflows: boolean | null;
}

/** Classification of one check run or status context on the head. */
export interface CheckItem {
  name: string;
  app: string;
  runId: string;
  status: "pending" | "pass" | "fail";
  conclusion: string | null;
  url: string | null;
}

/** The head's checks after reconciliation against the monitored-check policy. */
export interface CheckSummary {
  failed: CheckItem[];
  pendingCount: number;
  passedCount: number;
  /** Expected (required or `--expect-check`) names not yet registered on the head. */
  missing: string[];
  settled: boolean;
  blockedReason: "no-checks-registered" | "expected-check-missing" | null;
  note: "no-checks-configured" | null;
}

/** One actionable piece of reviewer feedback, keyed for deduplication. */
export interface FeedbackItem {
  key: string;
  kind: "review" | "thread";
  id: string;
  reviewer: string;
  state: string | null;
  commitSha: string | null;
  path: string | null;
  line: number | null;
  body: string;
  url: string | null;
  edited: boolean;
  reopened: boolean;
}

/** Approval state derived from the latest human review per login. */
export interface ReviewSummary {
  decision: string | null;
  approvedBy: string[];
  changesRequestedBy: { login: string; commitSha: string | null }[];
  humanApproval: boolean;
}

/** Mergeability reading of the pull request. */
export type Mergeability = "merged" | "closed" | "conflicting" | "unknown" | "ok";

/** One classified snapshot — the input to `decideEvent`. */
export interface ClassifiedSnapshot {
  head: string;
  headVerified: boolean;
  url: string | null;
  base: string | null;
  mergeability: Mergeability;
  checks: CheckSummary;
  feedback: FeedbackItem[];
  resolvedThreadIds: string[];
  review: ReviewSummary;
}

/** The bounded JSON object the watcher prints. */
export interface WatchEvent {
  schemaVersion: 1;
  event: WatchEventType;
  eventId: string;
  reason: string | null;
  repo: string;
  pr: number;
  url: string | null;
  headSha: string | null;
  headVerified: boolean;
  base: string | null;
  checks: {
    failed: CheckItem[];
    pending: number;
    passed: number;
    missing: string[];
    note: "no-checks-configured" | null;
    truncated: boolean;
  };
  feedback: FeedbackItem[];
  feedbackTruncated: boolean;
  review: ReviewSummary;
  mergeability: Mergeability | null;
  terminal: boolean;
  state: { file: string | null; log: string | null };
}

/** A delivered, not yet acknowledged event. */
export interface PendingEvent {
  eventId: string;
  keys: string[];
  event: WatchEvent;
}

/** The durable state file, keyed by repository and PR. */
export interface WatchState {
  schemaVersion: 1;
  repo: string;
  pr: number;
  headSha: string | null;
  headFirstSeenAt: number | null;
  handledKeys: string[];
  pending: PendingEvent | null;
  resolvedThreads: string[];
  updatedAt: number;
}

/** What `decideEvent` concluded for one snapshot. */
export type WatchDecision =
  | {
      kind: "emit";
      event: WatchEventType;
      reason: string | null;
      keys: string[];
      terminal: boolean;
      feedback: FeedbackItem[];
    }
  | { kind: "wait"; blocker: string };

/** Output bounds. */
export const maxFailedChecks = 20;
export const maxFeedbackItems = 20;
export const maxBodyLength = 400;
export const maxHandledKeys = 200;
export const maxLogLines = 500;

/** Timing defaults, in seconds. */
export const defaultTimeoutSeconds = 6 * 60 * 60;
export const defaultIntervalSeconds = 30;
export const maxIntervalSeconds = 120;
export const rateLimitSleepSeconds = 300;
export const defaultCheckGraceSeconds = 600;

/** Error budgets before the watcher gives up with `blocked`. */
export const maxConsecutiveTransientErrors = 8;
export const maxRateLimitedCycles = 6;
export const maxPolicyReadFailures = 5;

const usage =
  "usage: watch-pr.ts <owner/repo> <pr-number> [--wait-for-approval] [--ack <event-id>] [--timeout <s>] [--interval <s>] [--check-grace <s>] [--state-dir <dir>] [--expect-check <name>]...";

const valueFlags: Record<string, keyof WatchOptions> = {
  "--ack": "ack",
  "--timeout": "timeoutSeconds",
  "--interval": "intervalSeconds",
  "--check-grace": "checkGraceSeconds",
  "--state-dir": "stateDir",
  "--expect-check": "expectChecks",
};

const numericFlags = new Set(["--timeout", "--interval", "--check-grace"]);

/** Parse argv into options; any malformed input yields `error` carrying the usage line. */
export function parseWatchArgs(argv: string[]): ParsedWatchArgs {
  const positional: string[] = [];
  const options: WatchOptions = {
    owner: "",
    repo: "",
    pr: 0,
    waitForApproval: false,
    ack: null,
    timeoutSeconds: defaultTimeoutSeconds,
    intervalSeconds: defaultIntervalSeconds,
    checkGraceSeconds: defaultCheckGraceSeconds,
    stateDir: null,
    expectChecks: [],
  };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    const field = valueFlags[arg];
    if (arg === "--wait-for-approval") {
      options.waitForApproval = true;
    } else if (field !== undefined) {
      const value = argv[index + 1];
      if (value === undefined) return { options: null, error: `${arg} needs a value — ${usage}` };
      const applied = applyValueFlag(options, arg, field, value);
      if (applied !== null) return { options: null, error: applied };
      index += 1;
    } else if (arg.startsWith("--")) {
      return { options: null, error: `unknown flag ${arg} — ${usage}` };
    } else {
      positional.push(arg);
    }
    index += 1;
  }
  const [repoArg, prArg] = positional;
  const [owner, repo] = (repoArg ?? "").split("/");
  const pr = Number.parseInt(prArg ?? "", 10);
  if (!owner || !repo || Number.isNaN(pr) || pr <= 0) {
    return { options: null, error: `arguments missing or invalid — ${usage}` };
  }
  return { options: { ...options, owner, repo, pr }, error: null };
}

const applyValueFlag = (
  options: WatchOptions,
  flag: string,
  field: keyof WatchOptions,
  value: string,
): string | null => {
  if (field === "expectChecks") {
    options.expectChecks = [...options.expectChecks, value];
    return null;
  }
  if (numericFlags.has(flag)) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return `${flag} expects seconds — ${usage}`;
    Object.assign(options, { [field]: seconds });
    return null;
  }
  Object.assign(options, { [field]: value });
  return null;
};

/**
 * The paginated GraphQL query: `reviewDecision` for approval policy, and every
 * review thread with the comment identity, author type and `updatedAt` that
 * deterministic feedback detection needs. `$endCursor` and `pageInfo` are
 * required by `gh api graphql --paginate`.
 */
export const watchThreadsQuery = `query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewDecision
      reviewThreads(first: 100, after: $endCursor) {
        nodes { id isResolved path line comments(first: 100) { nodes { databaseId url body createdAt updatedAt author { login __typename } } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

/** The read-only `gh` invocations one cycle runs, as argv arrays. */
export interface GhWatchReads {
  pull: string[];
  checkRuns: string[];
  statuses: string[];
  reviews: string[];
  threads: string[];
  rules: string[];
  workflows: string[];
}

/**
 * Every `gh` invocation the watcher runs. Exported so the read-only property is
 * an enforced test contract: no write flags, `-f`/`-F` only as variable
 * bindings on the fixed query, and no `gh pr checks` — the audited CLI rejected
 * its `--json` flag, so the watcher reads the REST endpoints directly.
 */
export function buildGhWatchReads({
  owner,
  repo,
  pr,
  head,
  base,
}: {
  owner: string;
  repo: string;
  pr: number;
  head: string;
  base: string;
}): GhWatchReads {
  const prefix = `repos/${owner}/${repo}`;
  return {
    pull: ["api", `${prefix}/pulls/${pr}`],
    checkRuns: ["api", `${prefix}/commits/${head}/check-runs?per_page=100`, "--paginate"],
    statuses: ["api", `${prefix}/commits/${head}/status`],
    reviews: ["api", `${prefix}/pulls/${pr}/reviews?per_page=100`, "--paginate"],
    threads: [
      "api",
      "graphql",
      "--paginate",
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${repo}`,
      "-F",
      `pr=${pr}`,
      "-f",
      `query=${watchThreadsQuery}`,
    ],
    rules: ["api", `${prefix}/rules/branches/${base}`],
    workflows: ["api", `${prefix}/contents/.github/workflows?ref=${base}`],
  };
}

/** Flatten the thread nodes and the (page-repeated) review decision out of parsed pages. */
export function mergeWatchThreadPages(pages: WatchThreadPage[]): {
  threads: RawThread[];
  reviewDecision: string | null;
} {
  const pull = pages[0]?.data?.repository?.pullRequest;
  return {
    threads: pages.flatMap((page) => page?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []),
    reviewDecision: pull?.reviewDecision ?? null,
  };
}

const isBotLogin = (login: string | undefined | null, type: string | undefined | null): boolean =>
  (login ?? "").endsWith("[bot]") || type === "Bot";

const excerpt = (body: string | null | undefined): string => (body ?? "").slice(0, maxBodyLength);

/**
 * Keep the newest run per `(name, app)`: a rerun or a second workflow event
 * supersedes the earlier run's verdict, so a cancelled first attempt followed
 * by a green second one reads as green, and a stale failure never survives a
 * successful rerun.
 */
export function reconcileCheckRuns(runs: RawCheckRun[]): RawCheckRun[] {
  const newest = new Map<string, RawCheckRun>();
  for (const run of runs) {
    const key = `${run.name} ${run.app?.slug ?? ""}`;
    const current = newest.get(key);
    if (current === undefined || run.id > current.id) newest.set(key, run);
  }
  return [...newest.values()];
}

const failingConclusions = new Set(["failure", "timed_out", "action_required", "stale"]);
const passingConclusions = new Set(["success", "skipped", "neutral"]);

const classifyRun = (run: RawCheckRun, now: number, graceMs: number): CheckItem => {
  const conclusion = run.conclusion ?? null;
  const base = {
    name: run.name,
    app: run.app?.slug ?? "",
    runId: String(run.id),
    conclusion,
    url: run.html_url ?? null,
  };
  if (run.status !== "completed" || conclusion === null) return { ...base, status: "pending" };
  if (passingConclusions.has(conclusion)) return { ...base, status: "pass" };
  if (failingConclusions.has(conclusion)) return { ...base, status: "fail" };
  // `cancelled` with no newer run: a rerun usually follows, so it is pending for
  // the grace period and a failure once nothing replaced it.
  const completedAt = Date.parse(run.completed_at ?? "") || now;
  return { ...base, status: now - completedAt < graceMs ? "pending" : "fail" };
};

const classifyStatus = (status: RawStatusContext): CheckItem => ({
  name: status.context,
  app: "status",
  runId: String(status.id),
  status: status.state === "success" ? "pass" : status.state === "pending" ? "pending" : "fail",
  conclusion: status.state,
  url: status.target_url ?? null,
});

/** Required check contexts and approval count from the base branch's rules. */
export function readPolicy(rules: RawRule[] | null): {
  requiredChecks: string[];
  requiredApprovals: number | null;
} {
  const requiredChecks = (rules ?? []).flatMap((rule) =>
    (rule.parameters?.required_status_checks ?? []).map((check) => check.context),
  );
  const approvals = (rules ?? [])
    .map((rule) => rule.parameters?.required_approving_review_count)
    .filter((count): count is number => typeof count === "number");
  return {
    requiredChecks: [...new Set(requiredChecks)],
    requiredApprovals: approvals.length ? Math.max(...approvals) : null,
  };
}

/**
 * Classify the head's checks against the monitored set (required policy ∪
 * observed ∪ `--expect-check`). Never infers green from an empty reading: an
 * empty head is settled only with explicit check-free evidence, and otherwise
 * waits the grace period before it becomes a blocker.
 */
export function classifyChecks(input: {
  runs: RawCheckRun[];
  statuses: RawStatusContext[];
  expected: string[];
  hasWorkflows: boolean | null;
  headFirstSeenAt: number;
  now: number;
  graceMs: number;
}): CheckSummary {
  const items = [
    ...reconcileCheckRuns(input.runs).map((run) => classifyRun(run, input.now, input.graceMs)),
    ...input.statuses.map(classifyStatus),
  ];
  const names = new Set(items.map((item) => item.name));
  const missing = input.expected.filter((name) => !names.has(name));
  const failed = items.filter((item) => item.status === "fail");
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const passedCount = items.filter((item) => item.status === "pass").length;
  const graceElapsed = input.now - input.headFirstSeenAt >= input.graceMs;
  const summary = { failed, pendingCount, passedCount, missing, note: null };

  if (missing.length > 0) {
    return {
      ...summary,
      settled: false,
      blockedReason: graceElapsed ? "expected-check-missing" : null,
    };
  }
  if (items.length === 0) {
    if (input.hasWorkflows === false) {
      return { ...summary, settled: true, blockedReason: null, note: "no-checks-configured" };
    }
    return { ...summary, settled: false, blockedReason: graceElapsed ? "no-checks-registered" : null };
  }
  return { ...summary, settled: pendingCount === 0, blockedReason: null };
}

/** Read the pull request's mergeability; `unknown` while GitHub is still computing it. */
export function deriveMergeability(pull: RawPull): Mergeability {
  if (pull.merged === true) return "merged";
  if (pull.state === "closed") return "closed";
  if (pull.mergeable_state === "dirty") return "conflicting";
  if (pull.mergeable === null || pull.mergeable === undefined || pull.mergeable_state === "unknown") {
    return "unknown";
  }
  return "ok";
}

const reviewFeedback = (review: RawReview, author: string): FeedbackItem | null => {
  const login = review.user?.login ?? "";
  if (login === author || isBotLogin(login, review.user?.type)) return null;
  const body = (review.body ?? "").trim();
  const actionable =
    review.state === "CHANGES_REQUESTED" || (review.state === "COMMENTED" && body.length > 0);
  if (!actionable) return null;
  return {
    key: `review:${review.id}`,
    kind: "review",
    id: String(review.id),
    reviewer: login,
    state: review.state,
    commitSha: review.commit_id ?? null,
    path: null,
    line: null,
    body: excerpt(body),
    url: review.html_url ?? null,
    edited: false,
    reopened: false,
  };
};

const newestBy = <T>(items: T[], time: (item: T) => number): T | null =>
  items.reduce<T | null>((best, item) => (best === null || time(item) > time(best) ? item : best), null);

const updatedAtOf = (comment: RawThreadComment): number => Date.parse(comment.updatedAt ?? "") || 0;
const createdAtOf = (comment: RawThreadComment): number => Date.parse(comment.createdAt ?? "") || 0;

const threadFeedback = (
  thread: RawThread,
  author: string,
  previouslyResolved: Set<string>,
): FeedbackItem | null => {
  const comments = thread.comments?.nodes ?? [];
  const humans = comments.filter(
    (comment) =>
      comment.author?.login !== author &&
      !isBotLogin(comment.author?.login, comment.author?.__typename),
  );
  const latestHuman = newestBy(humans, updatedAtOf);
  if (latestHuman === null) return null;
  const latestAuthorReply = newestBy(
    comments.filter((comment) => comment.author?.login === author),
    createdAtOf,
  );
  const reopened = previouslyResolved.has(thread.id);
  const answered =
    latestAuthorReply !== null && createdAtOf(latestAuthorReply) >= updatedAtOf(latestHuman);
  if (answered && !reopened) return null;
  const commentId = String(latestHuman.databaseId ?? "");
  return {
    key: reopened
      ? `thread:${thread.id}:reopened:${commentId}`
      : `thread:${thread.id}:${latestHuman.updatedAt ?? ""}`,
    kind: "thread",
    id: thread.id,
    reviewer: latestHuman.author?.login ?? "unknown",
    state: null,
    commitSha: null,
    path: thread.path ?? null,
    line: thread.line ?? null,
    body: excerpt(latestHuman.body),
    url: latestHuman.url ?? null,
    edited: updatedAtOf(latestHuman) > createdAtOf(latestHuman),
    reopened,
  };
};

/**
 * Deterministic feedback detection from ids, versions and thread state. Bots,
 * the author's own replies and resolved threads never produce an item; an
 * edited reviewer comment (newer `updatedAt`) and a thread reopened after being
 * seen resolved do. Sorted by key so identical snapshots yield identical lists.
 */
export function deriveFeedback(input: {
  author: string;
  reviews: RawReview[];
  threads: RawThread[];
  previouslyResolved: string[];
}): { items: FeedbackItem[]; resolvedThreadIds: string[] } {
  const previouslyResolved = new Set(input.previouslyResolved);
  const fromReviews = input.reviews.flatMap((review) => {
    const item = reviewFeedback(review, input.author);
    return item ? [item] : [];
  });
  const fromThreads = input.threads
    .filter((thread) => !thread.isResolved)
    .flatMap((thread) => {
      const item = threadFeedback(thread, input.author, previouslyResolved);
      return item ? [item] : [];
    });
  return {
    items: [...fromReviews, ...fromThreads].sort((a, b) => a.key.localeCompare(b.key)),
    resolvedThreadIds: input.threads.filter((thread) => thread.isResolved).map((thread) => thread.id),
  };
}

const bindingStates = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

/**
 * Approval from the latest binding review per human login. A `COMMENTED`
 * review never changes a login's standing, a `DISMISSED` one clears it, and a
 * `CHANGES_REQUESTED` one stays binding whatever commit it was made on until the
 * same login reviews again. Bot approvals never satisfy the policy.
 */
export function deriveApproval(input: {
  author: string;
  reviews: RawReview[];
  reviewDecision: string | null;
  requiredApprovals: number | null;
}): ReviewSummary {
  const latest = new Map<string, RawReview>();
  const ordered = [...input.reviews].sort((a, b) => a.id - b.id);
  for (const review of ordered) {
    const login = review.user?.login ?? "";
    const skip =
      !login || login === input.author || isBotLogin(login, review.user?.type) || !bindingStates.has(review.state);
    if (!skip) latest.set(login, review);
  }
  const approvedBy = [...latest.values()]
    .filter((review) => review.state === "APPROVED")
    .map((review) => review.user?.login ?? "");
  const changesRequestedBy = [...latest.values()]
    .filter((review) => review.state === "CHANGES_REQUESTED")
    .map((review) => ({ login: review.user?.login ?? "", commitSha: review.commit_id ?? null }));
  const needed = Math.max(1, input.requiredApprovals ?? 1);
  const decisionSatisfied = input.reviewDecision === "APPROVED" || input.reviewDecision === null;
  return {
    decision: input.reviewDecision,
    approvedBy,
    changesRequestedBy,
    humanApproval: decisionSatisfied && approvedBy.length >= needed && changesRequestedBy.length === 0,
  };
}

/** Classify one raw snapshot against the carried state. */
export function classifySnapshot(
  snapshot: RawSnapshot,
  state: WatchState,
  options: WatchOptions,
  now: number,
): ClassifiedSnapshot {
  const author = snapshot.pull.user?.login ?? "";
  const policy = readPolicy(snapshot.rules);
  const feedback = deriveFeedback({
    author,
    reviews: snapshot.reviews,
    threads: snapshot.threads,
    previouslyResolved: state.resolvedThreads,
  });
  return {
    head: snapshot.head,
    headVerified: snapshot.head === snapshot.headAfter,
    url: snapshot.pull.html_url ?? null,
    base: snapshot.pull.base?.ref ?? null,
    mergeability: deriveMergeability(snapshot.pull),
    checks: classifyChecks({
      runs: snapshot.checkRuns,
      statuses: snapshot.statuses,
      expected: [...new Set([...policy.requiredChecks, ...options.expectChecks])],
      hasWorkflows: snapshot.hasWorkflows,
      headFirstSeenAt: state.headFirstSeenAt ?? now,
      now,
      graceMs: options.checkGraceSeconds * 1000,
    }),
    feedback: feedback.items,
    resolvedThreadIds: feedback.resolvedThreadIds,
    review: deriveApproval({
      author,
      reviews: snapshot.reviews,
      reviewDecision: snapshot.reviewDecision,
      requiredApprovals: policy.requiredApprovals,
    }),
  };
}

const emit = (
  event: WatchEventType,
  keys: string[],
  extra: Partial<{ reason: string; terminal: boolean; feedback: FeedbackItem[] }> = {},
): WatchDecision => ({
  kind: "emit",
  event,
  keys,
  reason: extra.reason ?? null,
  terminal: extra.terminal ?? true,
  feedback: extra.feedback ?? [],
});

/**
 * The single decision for a snapshot, in fixed precedence: merged, closed,
 * conflict, failed checks, blocked discovery, new feedback, then — only with
 * every automated obligation settled — approval or readiness. Non-terminal
 * events fire only for keys the state has not handled, so an acknowledged
 * failure or comment never wakes the caller twice.
 */
export function decideEvent(
  classified: ClassifiedSnapshot,
  state: WatchState,
  options: Pick<WatchOptions, "waitForApproval">,
): WatchDecision {
  const handled = new Set(state.handledKeys);
  const unhandled = (keys: string[]): string[] => keys.filter((key) => !handled.has(key));
  const { checks, mergeability, head } = classified;

  if (mergeability === "merged") return emit("merged", []);
  if (mergeability === "closed") return emit("closed", []);
  if (!classified.headVerified) return { kind: "wait", blocker: "head-changed" };

  const conflictKeys = mergeability === "conflicting" ? unhandled([`conflict:${head}`]) : [];
  if (conflictKeys.length) return emit("conflict", conflictKeys, { terminal: false });

  const failedKeys = unhandled(checks.failed.map((item) => `check:${head}:${item.runId}`));
  if (failedKeys.length) return emit("checks_failed", failedKeys, { terminal: false });

  if (checks.blockedReason) return emit("blocked", [], { reason: checks.blockedReason });

  const newFeedback = classified.feedback.filter((item) => !handled.has(item.key));
  if (newFeedback.length) {
    return emit("review_action_required", newFeedback.map((item) => item.key), {
      terminal: false,
      feedback: newFeedback,
    });
  }

  if (mergeability === "conflicting") return { kind: "wait", blocker: "conflict-acknowledged" };
  if (mergeability === "unknown") return { kind: "wait", blocker: "mergeability-unknown" };
  if (checks.failed.length) return { kind: "wait", blocker: "checks-failed-acknowledged" };
  if (checks.missing.length) return { kind: "wait", blocker: `checks-missing: ${checks.missing.join(", ")}` };
  if (!checks.settled) return { kind: "wait", blocker: `checks-pending: ${checks.pendingCount}` };

  if (!options.waitForApproval) return emit("ready_for_review", []);
  if (classified.review.humanApproval) return emit("approved", []);
  return { kind: "wait", blocker: "awaiting-approval" };
}

/** A short stable digest so a re-emitted event carries the same id. */
export function digestKeys(keys: string[]): string {
  let hash = 0x811c9dc5;
  for (const char of [...keys].sort().join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Build the bounded event object; caps are reported through the `truncated` flags. */
export function buildEvent(input: {
  decision: Extract<WatchDecision, { kind: "emit" }>;
  classified: ClassifiedSnapshot | null;
  options: Pick<WatchOptions, "owner" | "repo" | "pr">;
  stateFile: string | null;
  logFile: string | null;
}): WatchEvent {
  const { decision, classified, options } = input;
  const failed = classified?.checks.failed ?? [];
  const feedback = decision.feedback;
  const emptyReview = { decision: null, approvedBy: [], changesRequestedBy: [], humanApproval: false };
  return {
    schemaVersion: 1,
    event: decision.event,
    eventId: `${decision.event}:${(classified?.head ?? "none").slice(0, 12)}:${digestKeys(decision.keys)}`,
    reason: decision.reason,
    repo: `${options.owner}/${options.repo}`,
    pr: options.pr,
    url: classified?.url ?? null,
    headSha: classified?.head ?? null,
    headVerified: classified?.headVerified ?? false,
    base: classified?.base ?? null,
    checks: {
      failed: failed.slice(0, maxFailedChecks),
      pending: classified?.checks.pendingCount ?? 0,
      passed: classified?.checks.passedCount ?? 0,
      missing: classified?.checks.missing ?? [],
      note: classified?.checks.note ?? null,
      truncated: failed.length > maxFailedChecks,
    },
    feedback: feedback.slice(0, maxFeedbackItems),
    feedbackTruncated: feedback.length > maxFeedbackItems,
    review: classified?.review ?? emptyReview,
    mergeability: classified?.mergeability ?? null,
    terminal: decision.terminal,
    state: { file: input.stateFile, log: input.logFile },
  };
}

/** A fresh state for a repository/PR pair. */
export function emptyState(repo: string, pr: number, now: number): WatchState {
  return {
    schemaVersion: 1,
    repo,
    pr,
    headSha: null,
    headFirstSeenAt: null,
    handledKeys: [],
    pending: null,
    resolvedThreads: [],
    updatedAt: now,
  };
}

/** Guard a parsed state file; anything malformed starts fresh rather than being trusted. */
export function parseState(raw: string, repo: string, pr: number, now: number): WatchState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState(repo, pr, now);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyState(repo, pr, now);
  }
  const candidate = parsed as Record<string, unknown>;
  const valid =
    candidate.schemaVersion === 1 &&
    candidate.repo === repo &&
    candidate.pr === pr &&
    Array.isArray(candidate.handledKeys) &&
    Array.isArray(candidate.resolvedThreads);
  if (!valid) return emptyState(repo, pr, now);
  return {
    ...emptyState(repo, pr, now),
    headSha: typeof candidate.headSha === "string" ? candidate.headSha : null,
    headFirstSeenAt: typeof candidate.headFirstSeenAt === "number" ? candidate.headFirstSeenAt : null,
    handledKeys: (candidate.handledKeys as unknown[]).filter((key): key is string => typeof key === "string"),
    pending: isPendingEvent(candidate.pending) ? candidate.pending : null,
    resolvedThreads: (candidate.resolvedThreads as unknown[]).filter(
      (id): id is string => typeof id === "string",
    ),
  };
}

const isPendingEvent = (value: unknown): value is PendingEvent => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.eventId === "string" &&
    Array.isArray(candidate.keys) &&
    typeof candidate.event === "object" &&
    candidate.event !== null
  );
};

/**
 * Acknowledge a delivered event: its keys become handled so the same evidence
 * never wakes the caller again. An id that does not match the pending event is
 * ignored, which is how a restart keeps unacknowledged work instead of losing it.
 */
export function applyAck(state: WatchState, eventId: string | null): WatchState {
  if (eventId === null || state.pending === null || state.pending.eventId !== eventId) return state;
  return pruneState({
    ...state,
    handledKeys: [...state.handledKeys, ...state.pending.keys],
    pending: null,
  });
}

/** Record a non-terminal event as pending until the caller acknowledges it. */
export function recordPending(state: WatchState, event: WatchEvent, keys: string[]): WatchState {
  return { ...state, pending: { eventId: event.eventId, keys, event } };
}

/** Track the head and when it was first seen (the check grace starts there). */
export function observeHead(state: WatchState, head: string, now: number): WatchState {
  if (state.headSha === head && state.headFirstSeenAt !== null) return state;
  return { ...state, headSha: head, headFirstSeenAt: now };
}

/** Keep the state bounded: newest handled keys win, duplicates collapse. */
export function pruneState(state: WatchState): WatchState {
  const unique = [...new Set(state.handledKeys)];
  return { ...state, handledKeys: unique.slice(Math.max(0, unique.length - maxHandledKeys)) };
}
