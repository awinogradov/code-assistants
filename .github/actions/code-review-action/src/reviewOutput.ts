/**
 * Pure parsing and diff-hunk validation for the model's review/reaction output.
 *
 * Extracted from submitReview.ts / reactToComment.ts so this logic is unit-testable
 * without importing those modules (which run their submission pipeline on import).
 * No side effects, no Octokit, no env access.
 */

/** Inline comment on a specific file/line in the PR. */
export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

/** Structured output from a Claude review. */
export interface StructuredOutput {
  verdict: "approve" | "requestChanges" | "comment";
  reviewComment: string;
  inlineComments?: InlineComment[];
}

/** A valid (commentable) line location in the PR diff. */
export interface ValidLine {
  path: string;
  line: number;
}

/** Target for thread resolution by file location. */
export interface ResolveTarget {
  path: string;
  line: number;
}

/** Structured output from a Claude comment reaction. */
export interface ReactionOutput {
  reply: string;
  resolveComments?: ResolveTarget[];
  updatedVerdict?: "approve" | "requestChanges" | "comment" | null;
  updatedReviewComment?: string | null;
}

/**
 * Parse and validate structured review output from Claude.
 * Returns null if the output is empty, the literal "null", or not a JSON object.
 */
export function parseStructuredOutput(rawOutput: string): StructuredOutput | null {
  const trimmed = rawOutput.trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  const parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  return {
    verdict: (obj.verdict as StructuredOutput["verdict"]) ?? "comment",
    reviewComment: (obj.reviewComment as string) ?? "Review completed.",
    inlineComments: (obj.inlineComments as InlineComment[]) ?? [],
  };
}

/**
 * Parse and validate structured reaction output from Claude.
 * Returns null if the output is empty, the literal "null", or not a JSON object.
 */
export function parseReactionOutput(rawOutput: string): ReactionOutput | null {
  const trimmed = rawOutput.trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  const parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  return {
    reply: (obj.reply as string) ?? "",
    resolveComments: (obj.resolveComments as ResolveTarget[]) ?? [],
    updatedVerdict: (obj.updatedVerdict as ReactionOutput["updatedVerdict"]) ?? null,
    updatedReviewComment: (obj.updatedReviewComment as string | null) ?? null,
  };
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

/** True when a comment targets a line that exists in the diff. */
export function isValidComment(comment: InlineComment, validLines: ValidLine[]): boolean {
  return validLines.some((vl) => vl.path === comment.path && vl.line === comment.line);
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
