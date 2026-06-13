/**
 * Parse the "Review run summary" footer that `code-review-action` appends to
 * its review comments into structured, numeric run metrics.
 *
 * The footer carries the metrics twice: a human-facing markdown table and a
 * machine-readable JSON HTML comment (`<!-- run-summary-data: … -->`). This
 * parser reads only the comment, so a cosmetic change to the visible table
 * (relabeling, `<sub>`-wrapping, reordering) never breaks it — the JSON shape
 * is the compatibility contract (see `runSummaryFooter.ts` in
 * `code-review-action`). Parsing fails open per body: a comment without the
 * data marker, with malformed JSON, or with a schema-invalid payload yields
 * `undefined`, never an error — the caller decides when zero parses across a
 * whole scan is suspicious.
 *
 * @example
 * const metrics = parseFooterMetrics(review.body);
 * if (metrics?.mode === "review") runs.push(metrics);
 */
import { z } from "zod";

/** Opening delimiter of the run-summary data comment (mirrors `runSummaryFooter.ts`). */
const footerDataPrefix = "<!-- run-summary-data:";

/** Closing delimiter of the HTML comment carrying the data payload. */
const footerDataSuffix = "-->";

/**
 * Validated metrics of a single review run recovered from one footer's data
 * comment. Strict numerics: a field that is not a finite non-negative number
 * rejects the whole payload rather than feeding NaN into a baseline.
 */
export const runMetricsSchema = z.object({
  mode: z.string().min(1),
  modelMs: z.number().int().nonnegative(),
  toolRoundTrips: z.number().int().nonnegative(),
  numTurns: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});

/** Metrics of one review run, as serialized in the footer data comment. */
export type RunMetrics = z.infer<typeof runMetricsSchema>;

/**
 * True when a body carries a run-summary data comment — i.e. a review that
 * *should* parse. Lets the collector tell a footer-format drift (data comments
 * present but none parse) from a review window that simply holds too few
 * footers to judge.
 */
export function hasRunSummaryData(body: string | null | undefined): boolean {
  if (!body) return false;
  return body.includes(footerDataPrefix);
}

/**
 * Extract the run metrics from a review/comment body, or `undefined` when the
 * body carries no parseable data comment (absent marker, malformed JSON, or a
 * payload that fails the schema). Only the machine-readable comment is read, so
 * the visible table's format is irrelevant.
 */
export function parseFooterMetrics(body: string | null | undefined): RunMetrics | undefined {
  if (!body) return undefined;

  const start = body.indexOf(footerDataPrefix);
  if (start === -1) return undefined;
  const end = body.indexOf(footerDataSuffix, start + footerDataPrefix.length);
  if (end === -1) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start + footerDataPrefix.length, end).trim());
  } catch {
    return undefined;
  }

  const result = runMetricsSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
