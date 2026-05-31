/**
 * Render an inline review finding into the comment body and Octokit payload the
 * action posts: the finding prose, an optional one-click GitHub `suggestion`
 * block (the model's verbatim fix), and a collapsible "Prompt for AI agents"
 * block carrying the finding plus the surrounding diff hunk as `<file context>`.
 *
 * Pure — no Octokit, no env, no I/O. `buildReviewComments` shapes the validated
 * comments into the exact `comments[]` array for `octokit.rest.pulls.createReview`,
 * adding `start_line`/`start_side` only for a multi-line range.
 *
 * @example
 *   const comments = buildReviewComments(validComments, prFiles);
 *   await octokit.rest.pulls.createReview({ owner, repo, pull_number, event, body, comments });
 */
import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { InlineComment } from "./reviewOutput.ts";

/** A single entry of the `comments` array accepted by `pulls.createReview`. */
type ReviewComment = NonNullable<
  RestEndpointMethodTypes["pulls"]["createReview"]["parameters"]["comments"]
>[number];

/** Unified-diff hunk header, anchored per line: captures the new-file start and count. */
const hunkHeaderRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Return the unified-diff hunk text (header through the lines before the next
 * header) whose new-file range covers `line`, or `undefined` when no hunk does.
 */
export function findHunkForLine(patch: string, line: number): string | undefined {
  const lines = patch.split("\n");
  const headerIndexes = lines.flatMap((text, index) => (hunkHeaderRegex.test(text) ? [index] : []));

  for (const [order, headerIndex] of headerIndexes.entries()) {
    const match = lines[headerIndex]?.match(hunkHeaderRegex);
    if (!match) {
      continue;
    }
    const start = Number(match[1]);
    const count = match[2] ? Number(match[2]) : 1;
    if (line < start || line > start + count - 1) {
      continue;
    }
    const nextHeader = headerIndexes[order + 1] ?? lines.length;
    return lines.slice(headerIndex, nextHeader).join("\n");
  }
  return undefined;
}

/** Build the collapsible "Prompt for AI agents" block (cubic shape) for one finding. */
function buildAgentPrompt(comment: InlineComment, hunk: string | undefined): string {
  const location =
    comment.startLine !== undefined && comment.startLine < comment.line
      ? `lines ${comment.startLine} to ${comment.line}`
      : `line ${comment.line}`;

  const prompt = [
    `Check if this issue is valid — if so, understand the root cause and fix it. At ${comment.path}, ${location}:`,
    "",
    "<comment>",
    comment.body,
    "</comment>",
  ];
  if (hunk !== undefined) {
    prompt.push("", "<file context>", hunk, "</file context>");
  }

  return [
    "<details>",
    "<summary>Prompt for AI agents</summary>",
    "",
    "```text",
    ...prompt,
    "```",
    "",
    "</details>",
  ].join("\n");
}

/** Inputs for {@link renderInlineCommentBody}. */
interface RenderInlineCommentInput {
  comment: InlineComment;
  /** Diff hunk covering the finding's line, embedded as `<file context>`. */
  hunk: string | undefined;
}

/**
 * Compose the final inline comment body: the finding, the optional `suggestion`
 * fence, and the AI-agent prompt. The suggestion replaces the anchored line(s)
 * verbatim, so the model must supply exact replacement text (indentation included).
 */
export function renderInlineCommentBody({ comment, hunk }: RenderInlineCommentInput): string {
  const sections = [comment.body];
  if (comment.suggestion !== undefined) {
    sections.push(["```suggestion", comment.suggestion, "```"].join("\n"));
  }
  sections.push(buildAgentPrompt(comment, hunk));
  return sections.join("\n\n");
}

/**
 * Shape validated inline comments into the `createReview` `comments[]` payload:
 * rendered body, `side: "RIGHT"`, plus `start_line`/`start_side` for a multi-line
 * range. A contiguous in-diff range always sits within one hunk, so the line's
 * hunk is located once via `findHunkForLine`.
 */
export function buildReviewComments(
  comments: InlineComment[],
  prFiles: Array<{ filename: string; patch?: string }>,
): ReviewComment[] {
  const patchByPath = new Map(prFiles.map((file) => [file.filename, file.patch]));

  return comments.map((comment): ReviewComment => {
    const patch = patchByPath.get(comment.path);
    const hunk = patch ? findHunkForLine(patch, comment.line) : undefined;
    const body = renderInlineCommentBody({ comment, hunk });

    const base = { path: comment.path, line: comment.line, side: "RIGHT" as const, body };
    return comment.startLine !== undefined && comment.startLine < comment.line
      ? { ...base, start_line: comment.startLine, start_side: "RIGHT" as const }
      : base;
  });
}
