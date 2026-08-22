// Pure transforms for PR review-thread retrieval: parse paginated `gh` output,
// merge GraphQL pages, and reduce the four raw GitHub payloads to the typed
// contract the pr-answer/pr-resolve/pr-review skills consume. No I/O lives here —
// the CLI in fetch-pr-reviews.ts is a thin shell around these functions, so the
// fixture tests in reviewThreads.test.ts exercise the exact production paths.
//
// Runs under Node's native type stripping (Node >=24) and Bun without a build
// step, so it ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// Usage:
//   import { buildReviewPayload, parseGhPaginatedJson } from "./reviewThreads.ts";
//   const pages = parseGhPaginatedJson<RestComment[]>(ghStdout);
//   const payload = buildReviewPayload({ pr, author, meta, reviews, comments, threads });

/** Severity buckets a surviving comment is sorted into. */
export type Severity = "blocker" | "suggestion" | "nitpick" | "question";

/** A REST review comment from `pulls/:n/comments`. */
export interface RestComment {
  id: number;
  path: string;
  line?: number | null;
  user?: { login: string };
  body?: string;
  pull_request_review_id?: number;
  in_reply_to_id?: number;
}

/** A REST review from `pulls/:n/reviews`. */
export interface Review {
  id: number;
  user?: { login: string };
  state: string;
}

/** PR metadata from `gh pr view --json`. */
export interface ReviewMeta {
  title?: string | null;
  reviewDecision?: string | null;
}

/** A GraphQL `reviewThreads` node, used only for resolution state. */
export interface ReviewThread {
  path: string;
  line: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  comments?: {
    nodes?: { author?: { login: string } | null; body?: string }[];
    pageInfo?: { hasNextPage: boolean };
  };
}

/** A reviewer and their latest review state. */
export interface Reviewer {
  login: string;
  state: string;
}

/** One unresolved review comment in the output contract. */
export interface ReviewComment {
  commentId: number;
  path: string;
  line: number | null;
  reviewer: string;
  severity: Severity;
  body: string;
  authorReplied: boolean;
  lastAuthorReply: string | null;
}

/** The typed, bounded payload the review skills consume. */
export interface ReviewPayload {
  pr: number;
  title: string | null;
  author: string;
  reviewState: string;
  reviewers: Reviewer[];
  comments: ReviewComment[];
  note: null | "no-comments" | "all-resolved";
  truncated: boolean;
}

/** The four `gh` invocations as argv arrays. */
export interface GhReadCommands {
  reviews: string[];
  comments: string[];
  meta: string[];
  threads: string[];
}

const ciBotDenylist = new Set([
  "github-actions[bot]",
  "dependabot[bot]",
  "codecov[bot]",
  "coderabbitai[bot]",
]);

const maxBodyLength = 400;
const maxComments = 100;
const severityRank: Record<Severity, number> = {
  blocker: 0,
  suggestion: 1,
  nitpick: 2,
  question: 3,
};

const blockerMarkers = /🚧|blocker|must fix|blocking/;
const nitpickMarkers = /💡|nitpick|\bnit\b|minor|optional/;
const suggestionMarkers = /🙋‍♂️|suggestion|consider|\bshould\b/;

/**
 * The read-only GraphQL query for review-thread resolution state. `$endCursor`
 * and `pageInfo` are required by `gh api graphql --paginate`; the nested
 * comments connection carries `pageInfo` so inner truncation stays detectable.
 */
export const reviewThreadsQuery = `query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes { path line isResolved isOutdated comments(first: 50) { nodes { author { login } body } pageInfo { hasNextPage } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

/**
 * The four `gh` invocations the CLI runs. Exported so the read-only property is
 * an enforced test contract: the reads carry no write flags, and `-f`/`-F`
 * appear only as variable bindings on the fixed, mutation-free threads query.
 */
export function buildGhReadCommands({
  owner,
  repo,
  pr,
}: {
  owner: string;
  repo: string;
  pr: number;
}): GhReadCommands {
  return {
    reviews: ["api", `repos/${owner}/${repo}/pulls/${pr}/reviews`, "--paginate"],
    comments: ["api", `repos/${owner}/${repo}/pulls/${pr}/comments`, "--paginate"],
    meta: [
      "pr",
      "view",
      String(pr),
      "-R",
      `${owner}/${repo}`,
      "--json",
      "title,author,reviewDecision,reviewRequests",
    ],
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
      `query=${reviewThreadsQuery}`,
    ],
  };
}

/**
 * Split `gh --paginate` stdout into parsed documents. gh emits one JSON document
 * per page concatenated on stdout (arrays for REST endpoints, objects for
 * GraphQL), so a plain JSON.parse throws on any multi-page result — this scanner
 * tracks brace depth outside strings instead.
 */
export function parseGhPaginatedJson<T = unknown>(stdout: string): T[] {
  const documents: T[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let index = 0;
  for (const char of stdout) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) documents.push(JSON.parse(stdout.slice(start, index + 1)) as T);
    }
    // Advance by code units, not code points: `char` may be an astral pair
    // (emoji in comment bodies), and slice() indexes UTF-16 code units.
    index += char.length;
  }
  return documents;
}

/** A parsed page of the GraphQL `reviewThreads` query. */
export interface ThreadPage {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: ReviewThread[];
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    };
  };
}

/** Flatten the thread nodes out of parsed GraphQL pages, in page order. */
export function mergeReviewThreadPages(pages: ThreadPage[]): ReviewThread[] {
  return pages.flatMap((page) => page?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []);
}

const excerpt = (body: string | undefined | null): string => (body ?? "").slice(0, maxBodyLength);

const matchThread = (comment: RestComment, threads: ReviewThread[]): ReviewThread | null => {
  const inFile = threads.filter((node) => node.path === comment.path);
  if (comment.line !== null && comment.line !== undefined) {
    const byLine = inFile.filter((node) => node.line === comment.line);
    if (byLine.length === 1) return byLine[0];
  }
  // Several threads share the file (or the diff line moved and line is null):
  // fall back to first-comment identity, never to a (path, null) key.
  return (
    inFile.find((node) => {
      const first = node.comments?.nodes?.[0];
      return first?.author?.login === comment.user?.login && first?.body === comment.body;
    }) ?? null
  );
};

const classifySeverity = (
  comment: RestComment,
  reviewStateById: Map<number, string>,
): Severity => {
  if (
    comment.pull_request_review_id !== undefined &&
    reviewStateById.get(comment.pull_request_review_id) === "CHANGES_REQUESTED"
  ) {
    return "blocker";
  }
  const body = (comment.body ?? "").toLowerCase();
  if (blockerMarkers.test(body)) return "blocker";
  if (suggestionMarkers.test(body)) return "suggestion";
  if (nitpickMarkers.test(body)) return "nitpick";
  if (body.trim().endsWith("?")) return "question";
  return "suggestion";
};

const latestReviewers = (reviews: Review[], author: string): Reviewer[] => {
  const lastStateByLogin = new Map<string, string>();
  for (const review of reviews) {
    const login = review.user?.login;
    if (login && login !== author) lastStateByLogin.set(login, review.state);
  }
  return [...lastStateByLogin].map(([login, state]) => ({ login, state }));
};

const orderForOutput = (
  surviving: ReviewComment[],
): { ordered: ReviewComment[]; truncated: boolean } => {
  const capped =
    surviving.length > maxComments
      ? [...surviving]
          .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
          .slice(0, maxComments)
      : surviving;
  const lineKey = (comment: ReviewComment): number =>
    comment.line === null ? Number.POSITIVE_INFINITY : comment.line;
  const ordered = [...capped].sort(
    (a, b) => a.path.localeCompare(b.path) || lineKey(a) - lineKey(b),
  );
  return { ordered, truncated: surviving.length > maxComments };
};

/**
 * Reduce the four raw GitHub payloads to the review contract: resolved threads,
 * CI-bot noise, and the PR author's own root comments are dropped; everything
 * else is categorized, grouped by file, and bounded. `authorReplied` comes from
 * the complete REST reply set, so nested GraphQL page truncation can never
 * produce a false negative.
 */
export function buildReviewPayload({
  pr,
  author,
  meta,
  reviews,
  comments,
  threads,
}: {
  pr: number;
  author: string;
  meta: ReviewMeta | null;
  reviews: Review[];
  comments: RestComment[];
  threads: ReviewThread[];
}): ReviewPayload {
  const reviewStateById = new Map(reviews.map((review) => [review.id, review.state]));
  const roots = comments.filter((comment) => !comment.in_reply_to_id);
  const replies = comments.filter((comment) => comment.in_reply_to_id);

  let resolvedRoots = 0;
  const surviving: ReviewComment[] = [];
  for (const root of roots) {
    const login = root.user?.login ?? "unknown";
    if (matchThread(root, threads)?.isResolved) {
      resolvedRoots += 1;
      continue;
    }
    if (ciBotDenylist.has(login) || login === author) continue;
    const authorReplies = replies.filter(
      (reply) => reply.in_reply_to_id === root.id && reply.user?.login === author,
    );
    const lastReply = authorReplies.at(-1);
    surviving.push({
      commentId: root.id,
      path: root.path,
      line: root.line ?? null,
      reviewer: login,
      severity: classifySeverity(root, reviewStateById),
      body: excerpt(root.body),
      authorReplied: authorReplies.length > 0,
      lastAuthorReply: lastReply ? excerpt(lastReply.body) : null,
    });
  }

  const { ordered, truncated } = orderForOutput(surviving);
  const note =
    ordered.length > 0
      ? null
      : roots.length > 0 && resolvedRoots === roots.length
        ? "all-resolved"
        : "no-comments";

  return {
    pr,
    title: meta?.title ?? null,
    author,
    reviewState: meta?.reviewDecision || "PENDING",
    reviewers: latestReviewers(reviews, author),
    comments: ordered,
    note,
    truncated,
  };
}
