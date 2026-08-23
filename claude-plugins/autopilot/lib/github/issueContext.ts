// Pure transforms for GitHub issue retrieval: guard the parsed `gh issue view`
// payload and reduce it to the provider-agnostic issue contract the
// gather-context skill consumes in place of the resolve-issue-context delegated
// agent (the agent itself remains for the pr-review CI path). No I/O lives here —
// the CLI in fetch-issue.ts is a thin shell around these functions, so the
// fixture tests in issueContext.test.ts exercise the exact production paths.
//
// Runs under Node's native type stripping (Node >=24) and Bun without a build
// step, so it ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// The assignee-status vocabulary below stays in sync with
// agents/resolve-issue-context.md Phase 2 and
// skills/branch-create/references/self-assign.md — issueContext.test.ts pins
// the six markers against both files.
//
// Usage:
//   import { buildIssueContext, deriveAssigneeStatus } from "./issueContext.ts";

/** One issue comment in the output contract. */
export interface IssueComment {
  author: string;
  date: string;
  body: string;
}

/**
 * The provider-agnostic issue contract, matching the resolve-issue-context
 * agent's output and lib/linear/fetch-issue.mjs. `truncated` flags that the
 * description or comment list hit an exported bound.
 */
export interface IssueContext {
  source: string;
  issueId: number | null;
  title: string | null;
  status: string;
  labels: string[];
  assignee: string | null;
  url: string | null;
  description: string;
  comments: IssueComment[];
  truncated: boolean;
  resolveError: string | null;
}

/** The `gh issue view --json` fields the transforms consume. */
export interface RawIssue {
  title: string;
  body?: string | null;
  state: string;
  url?: string | null;
  labels?: { name?: string }[];
  assignees?: { login?: string }[];
  comments?: { author?: { login?: string }; createdAt?: string; body?: string }[];
}

/** Description bound in characters. */
export const maxDescriptionLength = 16_000;

/** Comment-list bound. */
export const maxComments = 30;

/** Per-comment body bound in characters. */
export const maxCommentLength = 2_000;

/**
 * The six assignee outcomes' distinguishing markers, one per status string.
 * Pinned by issueContext.test.ts against the two markdown homes of the
 * vocabulary so the three copies cannot drift silently.
 */
export const assigneeStatusMarkers = [
  "(just assigned)",
  "(already assigned)",
  "unassigned — gh not authenticated",
  "unassigned — issue closed",
  "unassigned — permission denied or assignee limit reached",
  "unassigned — gh edit error:",
] as const;

/**
 * Guard the parsed `gh issue view --json` payload: external input, so the
 * load-bearing fields are checked at runtime instead of trusted through a cast.
 * Returns null when the shape does not hold; the CLI degrades that into
 * `resolveError`.
 */
export function parseIssueJson(stdout: string): RawIssue | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.title !== "string" || typeof candidate.state !== "string") return null;
  return candidate as unknown as RawIssue;
}

/** The degraded contract shape for a failed fetch; `resolveError` carries the reason. */
export function degradedIssueContext(issueNumber: number | null, error: string): IssueContext {
  return {
    source: issueNumber === null ? "GitHub Issue" : `GitHub Issue #${issueNumber}`,
    issueId: issueNumber,
    title: null,
    status: "unresolved",
    labels: [],
    assignee: null,
    url: null,
    description: "",
    comments: [],
    truncated: false,
    resolveError: error,
  };
}

/** Reduce a guarded issue payload to the bounded contract. */
export function buildIssueContext(issueNumber: number, raw: RawIssue): IssueContext {
  const body = raw.body ?? "";
  const allComments = raw.comments ?? [];
  const comments = allComments.slice(0, maxComments).map((comment) => ({
    author: comment.author?.login ?? "unknown",
    date: (comment.createdAt ?? "").slice(0, 10),
    body: (comment.body ?? "").slice(0, maxCommentLength),
  }));

  return {
    source: `GitHub Issue #${issueNumber}`,
    issueId: issueNumber,
    title: raw.title,
    status: raw.state,
    labels: (raw.labels ?? []).flatMap((label) => (label.name ? [label.name] : [])),
    assignee: null,
    url: raw.url ?? null,
    description: body.slice(0, maxDescriptionLength),
    comments,
    truncated:
      body.length > maxDescriptionLength ||
      allComments.length > maxComments ||
      allComments.some((comment) => (comment.body ?? "").length > maxCommentLength),
    resolveError: null,
  };
}

/** The reads the assign flow produced, injected so the derivation stays pure. */
export interface AssignReads {
  login: string | null;
  state: string;
  assignees: string[];
  editExitCode: number | null;
  editStderr: string;
  verifiedAssignees: string[] | null;
}

/**
 * Derive the assignee status string per the canonical six-outcome flow: no
 * login, closed issue, and already-assigned short-circuit before any edit; a
 * non-zero edit reports its stderr; an exit-0 edit is trusted only after the
 * verifying re-read shows the login, because GitHub drops additions silently on
 * missing permission or the 10-assignee limit.
 */
export function deriveAssigneeStatus(reads: AssignReads): string {
  if (reads.login === null || reads.login === "") return "unassigned — gh not authenticated";
  if (reads.state === "CLOSED") return "unassigned — issue closed";
  if (reads.assignees.includes(reads.login)) return `@${reads.login} (already assigned)`;
  if (reads.editExitCode !== 0) {
    const firstLine = reads.editStderr.split("\n")[0];
    return `unassigned — gh edit error: ${firstLine}`;
  }
  if (reads.verifiedAssignees?.includes(reads.login)) return `@${reads.login} (just assigned)`;
  return "unassigned — permission denied or assignee limit reached";
}
