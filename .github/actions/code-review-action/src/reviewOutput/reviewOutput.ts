/**
 * Pure parsing and diff-hunk validation for the model's review/reaction output.
 *
 * Extracted from submitReview.ts / reactToComment.ts so this logic is unit-testable
 * without importing those modules (which run their submission pipeline on import).
 * No side effects, no Octokit, no env access. Model output is validated with Zod at
 * the parse boundary — malformed/truncated JSON yields null, never a thrown error.
 */
import { z } from "zod";

/** Inline comment on a specific file/line in the PR. */
export const inlineCommentSchema = z.object({
  path: z.string(),
  line: z.number(),
  body: z.string(),
  /** First line of a multi-line range; omit for a single-line comment (`line` is then the only line). */
  startLine: z.number().optional(),
  /** Verbatim replacement for the anchored line(s), rendered as a GitHub `suggestion` block. */
  suggestion: z.string().optional(),
});
export type InlineComment = z.infer<typeof inlineCommentSchema>;

/** Structured output from a Claude review (lenient: missing fields get defaults). */
export const structuredOutputSchema = z.object({
  verdict: z.enum(["approve", "requestChanges", "comment"]).catch("comment"),
  reviewComment: z.string().catch("Review completed."),
  inlineComments: z.array(inlineCommentSchema).catch([]),
});
export type StructuredOutput = z.infer<typeof structuredOutputSchema>;

/** Target for thread resolution by file location. */
export const resolveTargetSchema = z.object({
  path: z.string(),
  line: z.number(),
});
export type ResolveTarget = z.infer<typeof resolveTargetSchema>;

/** Structured output from a Claude comment reaction. */
export const reactionOutputSchema = z.object({
  reply: z.string().catch(""),
  resolveComments: z.array(resolveTargetSchema).catch([]),
  updatedVerdict: z.enum(["approve", "requestChanges", "comment"]).nullable().catch(null),
  updatedReviewComment: z.string().nullable().catch(null),
});
export type ReactionOutput = z.infer<typeof reactionOutputSchema>;

/** A valid (commentable) line location in the PR diff. */
export interface ValidLine {
  path: string;
  line: number;
}

/**
 * Trim, JSON-parse (never throwing), and validate against a Zod schema.
 * Returns null for empty/"null" input, malformed JSON, or a schema mismatch.
 */
function parseJsonWithSchema<T>(rawOutput: string, schema: z.ZodType<T>): T | null {
  const trimmed = rawOutput.trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Parse and validate structured review output from Claude (null on any failure). */
export function parseStructuredOutput(rawOutput: string): StructuredOutput | null {
  return parseJsonWithSchema(rawOutput, structuredOutputSchema);
}

/** Parse and validate structured reaction output from Claude (null on any failure). */
export function parseReactionOutput(rawOutput: string): ReactionOutput | null {
  return parseJsonWithSchema(rawOutput, reactionOutputSchema);
}

/** Expand a single unified-diff hunk header match into its added-line locations. */
export function extractHunkLines(filename: string, match: RegExpMatchArray): ValidLine[] {
  const start = Number(match[1]);
  const count = match[2] ? Number(match[2]) : 1;

  return Array.from({ length: count }, (_, i) => ({ path: filename, line: start + i }));
}

/**
 * Extract the set of commentable line locations from PR diff hunks.
 * Parses unified-diff hunk headers: `@@ -old,count +new,count @@`.
 */
export function extractValidLines(patches: Array<{ filename: string; patch?: string }>): ValidLine[] {
  const hunkHeaderRegex = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g;

  return patches
    .filter((file) => file.patch)
    .flatMap((file) =>
      [...file.patch!.matchAll(hunkHeaderRegex)].flatMap((m) => extractHunkLines(file.filename, m))
    );
}

/**
 * Anchor a finding to the diff instead of dropping it when its range is only
 * partly commentable.
 *
 * `validLines` holds every commentable new-file line, and distinct diff hunks are
 * always separated by at least one omitted line — so a contiguous run of
 * `validLines` can never span a hunk gap (the same invariant `buildReviewComments`
 * relies on to locate a range's single hunk). Returns the inline-postable comment,
 * anchored on the largest contiguous in-diff span ending at `line`; or `null` when
 * `line` itself is out-of-diff, signalling the caller to route the finding to the
 * review body. An inverted `startLine > line` range is normalized before validating.
 *
 * The one-click `suggestion` replaces exactly the anchored lines, so it is kept only
 * when the emitted anchor matches the model's original `[startLine, line]` pair; any
 * normalization or clamp would mis-apply the replacement, so the suggestion is dropped
 * there (and carried into the review body instead when the finding falls all the way
 * back via `formatInvalidComments`).
 */
export function anchorCommentToDiff(
  comment: InlineComment,
  validLines: ValidLine[]
): InlineComment | null {
  const inDiff = (line: number): boolean =>
    validLines.some((vl) => vl.path === comment.path && vl.line === line);

  const [startLine, line] =
    comment.startLine !== undefined && comment.startLine > comment.line
      ? [comment.line, comment.startLine]
      : [comment.startLine, comment.line];

  if (!inDiff(line)) {
    return null;
  }

  let anchorStart = line;
  while (anchorStart - 1 >= (startLine ?? line) && inDiff(anchorStart - 1)) {
    anchorStart -= 1;
  }

  const emittedStart = anchorStart < line ? anchorStart : undefined;
  const anchorUnchanged = emittedStart === comment.startLine && line === comment.line;

  return {
    ...comment,
    startLine: emittedStart,
    line,
    suggestion: anchorUnchanged ? comment.suggestion : undefined,
  };
}

/**
 * True when a comment's `path:line` is already referenced in the review body —
 * used to avoid repeating an out-of-diff finding that the body already mentions.
 */
export function isAlreadyMentioned(comment: InlineComment, reviewBody: string): boolean {
  const pattern = `${comment.path}:${comment.line}`;
  return reviewBody.includes(pattern);
}

/**
 * Format out-of-diff comments for inclusion in the review body.
 * Downgrades blockers (🚧) to suggestions (🙋‍♂️) since they're supplementary, and
 * carries any one-click `suggestion` along as a fenced block so the proposed fix is
 * still readable here — the body is not line-anchored, so it renders as plain text
 * (no apply button) rather than being lost.
 */
export function formatInvalidComments(comments: InlineComment[]): string {
  if (comments.length === 0) {
    return "";
  }

  const formatted = comments
    .map((c) => {
      const body = c.body.replaceAll("🚧", "🙋‍♂️");
      const suggestion =
        c.suggestion === undefined ? "" : `\n\n\`\`\`suggestion\n${c.suggestion}\n\`\`\``;
      return `**\`${c.path}:${c.line}\`**\n\n${body}${suggestion}`;
    })
    .join("\n\n");

  return `\n\n---\n## Additional Comments (not in diff)\n\n${formatted}`;
}
