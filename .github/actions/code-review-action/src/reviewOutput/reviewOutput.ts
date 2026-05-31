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
 * True when a comment's target exists in the diff. For a single-line comment that
 * is just `line`; for a multi-line comment the entire `[startLine, line]` range must
 * be in-diff. A range that straddles a gap between hunks is rejected — GitHub would
 * 422 the whole `createReview` call, not just the offending comment.
 */
export function isValidComment(comment: InlineComment, validLines: ValidLine[]): boolean {
  const inDiff = (line: number): boolean =>
    validLines.some((vl) => vl.path === comment.path && vl.line === line);

  const { startLine, line } = comment;
  if (startLine === undefined) {
    return inDiff(line);
  }
  if (startLine > line) {
    return false;
  }
  const range = Array.from({ length: line - startLine + 1 }, (_, i) => startLine + i);
  return range.every(inDiff);
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
 * Downgrades blockers (🚧) to suggestions (🙋‍♂️) since they're supplementary.
 */
export function formatInvalidComments(comments: InlineComment[]): string {
  if (comments.length === 0) {
    return "";
  }

  const formatted = comments
    .map((c) => {
      const body = c.body.replaceAll("🚧", "🙋‍♂️");
      return `**\`${c.path}:${c.line}\`**\n\n${body}`;
    })
    .join("\n\n");

  return `\n\n---\n## Additional Comments (not in diff)\n\n${formatted}`;
}
