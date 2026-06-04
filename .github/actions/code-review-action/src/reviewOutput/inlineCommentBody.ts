/**
 * Render an inline review finding into the comment body and Octokit payload the
 * action posts: the finding prose, an optional one-click GitHub `suggestion`
 * block (the model's verbatim fix), and a collapsible "Prompt for AI agents"
 * block carrying a chrome-free copy of the finding plus a bounded window of the
 * surrounding diff as `<file context>` (the human-facing finding stays verbatim).
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

/** New-file context lines kept on each side of the finding in the embedded prompt hunk. */
const agentPromptContextRadius = 6;

/** Leading severity glyph the model prefixes to a finding: blocker / suggestion / nitpick. */
const leadingSeverityEmoji = /^(?:🚧|🙋‍♂️|💡)\s*/;

/**
 * Trailing rule reference the model appends to a finding — a single
 * `[CHECK-…](url)` link or the merged `[[CHECK-…](url), …]` form. Anchored to the
 * end so a mid-sentence `[CHECK-…]` mention is left untouched.
 */
const trailingRuleLink =
  /\s*(?:\[(?:\[CHECK-[A-Z]+-\d+\]\([^)]*\)(?:,\s*)?)+\]|\[CHECK-[A-Z]+-\d+\]\([^)]*\))$/;

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

/**
 * Narrow a unified-diff hunk to a window of {@link agentPromptContextRadius}
 * new-file lines on each side of `line`, so the embedded prompt context stays
 * focused instead of dumping a whole new/large file's hunk. The `@@` header is
 * kept verbatim (orientation only — its counts are not recomputed). A hunk smaller
 * than the window, or one whose header lacks a parseable new-file start, passes
 * through unchanged.
 */
export function boundHunkToLine(hunk: string, line: number): string {
  const [header, ...body] = hunk.split("\n");
  const start = Number(header?.match(/\+(\d+)/)?.[1]);
  if (Number.isNaN(start)) {
    return hunk;
  }

  let newLine = start;
  const kept: string[] = [];
  for (const text of body) {
    if (Math.abs(newLine - line) <= agentPromptContextRadius) {
      kept.push(text);
    }
    if (!text.startsWith("-")) {
      newLine += 1;
    }
  }

  return kept.length === 0 ? hunk : [header, ...kept].join("\n");
}

/**
 * Strip the human-facing review chrome from a finding so the embedded prompt copy
 * reads as clean instruction text: drop the leading severity emoji and the trailing
 * `[CHECK-…](url)` rule link (single or merged). Only these anchored ends are
 * removed — inline code and a mid-sentence `[CHECK-…]` mention are preserved.
 */
export function stripReviewChrome(body: string): string {
  return body.replace(leadingSeverityEmoji, "").replace(trailingRuleLink, "").trim();
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
    stripReviewChrome(comment.body),
    "</comment>",
  ];
  if (hunk !== undefined) {
    prompt.push("", "<file context>", boundHunkToLine(hunk, comment.line), "</file context>");
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
