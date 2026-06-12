/**
 * Parse the "Review run summary" footer that `code-review-action` appends to
 * its review comments into structured, numeric run metrics.
 *
 * The footer is the durable per-run record this monitor is built on: a
 * markdown `| Metric | Value |` table wrapped in HTML-comment markers (see
 * `runSummaryFooter.ts` in `code-review-action` — the row labels and markers
 * are a compatibility contract). Parsing fails open per body: a comment
 * without markers or with malformed rows yields `undefined`, never an error —
 * the caller decides when zero parses across a whole scan is suspicious.
 *
 * @example
 * const metrics = parseFooterMetrics(review.body);
 * if (metrics?.mode === "review") runs.push(metrics);
 */
import { z } from "zod";

/** Opening marker bounding the run-summary footer (mirrors `runSummaryFooter.ts`). */
const footerStartMarker = "<!-- run-summary-start -->";

/** Closing marker bounding the run-summary footer (mirrors `runSummaryFooter.ts`). */
const footerEndMarker = "<!-- run-summary-end -->";

/**
 * Validated metrics of a single review run recovered from one footer.
 * Strict numerics: a row that fails to parse back to a finite non-negative
 * number rejects the whole footer rather than feeding NaN into a baseline.
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

/** Metrics of one review run, as rendered in the footer table. */
export type RunMetrics = z.infer<typeof runMetricsSchema>;

/** Parse a `34.0s` duration cell back to integer milliseconds. */
function parseSeconds(value: string | undefined): number | undefined {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match?.[1]) return undefined;
  return Math.round(Number(match[1]) * 1000);
}

/** Parse a `157825 / 36705` pair cell into its two integers. */
function parsePair(value: string | undefined): [number, number] | undefined {
  const match = value?.match(/^(\d+) \/ (\d+)$/);
  if (!match?.[1] || match[2] === undefined) return undefined;
  return [Number(match[1]), Number(match[2])];
}

/** Parse a `$0.35` cost cell back to a number of USD. */
function parseUsd(value: string | undefined): number | undefined {
  const match = value?.match(/^\$(\d+(?:\.\d+)?)$/);
  if (!match?.[1]) return undefined;
  return Number(match[1]);
}

/** Parse a bare integer cell (`10`). */
function parseCount(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

/**
 * Extract the run metrics from a review/comment body, or `undefined` when the
 * body carries no parseable footer (absent markers, renamed labels, malformed
 * cells). The footer's table rows are matched by their exact labels, so a
 * format change upstream surfaces as a parse miss — not as wrong numbers.
 */
export function parseFooterMetrics(body: string | null | undefined): RunMetrics | undefined {
  if (!body) return undefined;

  const start = body.indexOf(footerStartMarker);
  if (start === -1) return undefined;
  const end = body.indexOf(footerEndMarker, start);
  if (end === -1) return undefined;

  const rows = new Map<string, string>();
  for (const line of body.slice(start, end).split("\n")) {
    const match = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (match?.[1] && match[2] !== undefined) rows.set(match[1], match[2]);
  }

  const tokens = parsePair(rows.get("Tokens in / out"));
  const cache = parsePair(rows.get("Cache read / write"));

  const result = runMetricsSchema.safeParse({
    mode: rows.get("Mode"),
    modelMs: parseSeconds(rows.get("Model time")),
    toolRoundTrips: parseCount(rows.get("Tool round-trips")),
    numTurns: parseCount(rows.get("Assistant turns")),
    tokensIn: tokens?.[0],
    tokensOut: tokens?.[1],
    cacheReadTokens: cache?.[0],
    cacheCreationTokens: cache?.[1],
    costUsd: parseUsd(rows.get("Cost (USD)")),
  });

  return result.success ? result.data : undefined;
}
