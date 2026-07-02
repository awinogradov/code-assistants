/**
 * Assemble the review comment body and render/strip the per-run summary footer.
 *
 * The review-run metrics (cost, latency, tokens, tool round-trips) are computed
 * in `runClaude.ts` and serialized into the
 * `run_summary` step output. `submitReview.ts` parses that JSON and appends a
 * collapsible `<details>` footer to the main review comment. The footer is
 * wrapped in HTML-comment markers so the duplicate-suppression guard can strip
 * the run-varying numbers before comparing review bodies.
 *
 * Inside those markers the footer also embeds the metrics as a machine-readable
 * JSON comment (`<!-- run-summary-data: … -->`). That comment — not the visible
 * `<details>` table — is the contract `code-review-cost-monitor` parses, so the
 * table stays purely cosmetic and can be restyled without breaking the monitor.
 *
 * @example
 * const summary = parseRunSummary(process.env.RUN_SUMMARY);
 * const footer = summary ? renderRunSummaryFooter(summary) : "";
 * const body = buildReviewBody(reviewComment, footer, inlineComments.length > 0);
 * // dedup: normalizeBody(stripLegacyUsageHint(stripRunSummaryFooter(stripReviewTips(body))))
 */
import { z } from "zod";

import { buildMarkedDetailsBlock } from "./markedDetailsBlock.ts";

/** Opening marker bounding the run-summary footer, used for dedup stripping. */
const footerStartMarker = "<!-- run-summary-start -->";

/** Closing marker bounding the run-summary footer, used for dedup stripping. */
const footerEndMarker = "<!-- run-summary-end -->";

/**
 * Schema for the serialized per-run summary passed via the `RUN_SUMMARY` env.
 * Strict (no coercion): every metric must already be a number, `model` a
 * string, and `mode` a known literal, so a malformed value can never reach
 * the rendered markdown.
 */
export const runSummarySchema = z.object({
  mode: z.enum(["review", "react", "unknown", "preflight"]),
  model: z.string(),
  model_ms: z.number(),
  tokens_in: z.number(),
  tokens_out: z.number(),
  cache_read_tokens: z.number(),
  cache_creation_tokens: z.number(),
  cost_usd: z.number(),
  num_turns: z.number(),
  tool_round_trips: z.number(),
});

/** Validated per-run summary rendered into the review footer. */
export type RunSummary = z.infer<typeof runSummarySchema>;

/**
 * Parse the untrusted `RUN_SUMMARY` env value into a {@link RunSummary}.
 * Fails open: returns `undefined` for an empty, non-JSON, or schema-invalid
 * value so the review is posted without a footer rather than blocked.
 */
export function parseRunSummary(raw: string | undefined): RunSummary | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const result = runSummarySchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

/** Format a millisecond duration as seconds with one decimal (e.g. `34.0s`). */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Build the markdown metric rows for the single-pass review run. */
function buildRows(summary: RunSummary): string[] {
  const rows = [
    ["Mode", summary.mode],
    ["Model", summary.model],
    ["Model time", formatSeconds(summary.model_ms)],
    ["Tool round-trips", String(summary.tool_round_trips)],
    ["Assistant turns", String(summary.num_turns)],
    ["Tokens in / out", `${summary.tokens_in} / ${summary.tokens_out}`],
    ["Cache read / write", `${summary.cache_read_tokens} / ${summary.cache_creation_tokens}`],
    ["Cost (USD)", `$${summary.cost_usd.toFixed(2)}`],
  ];

  return rows.map(([label, value]) => `| ${label} | ${value} |`);
}

/** Opening delimiter of the machine-readable run-summary data comment. */
const footerDataPrefix = "<!-- run-summary-data:";

/**
 * Render the run metrics as a single machine-readable HTML comment, keyed to
 * mirror `code-review-cost-monitor`'s `runMetricsSchema` so the monitor can
 * validate the JSON directly instead of scraping the human-facing table. This
 * is the durable cost-monitoring contract; the visible table is cosmetic.
 * `model_ms` is rounded to whole milliseconds to satisfy the integer contract.
 */
function renderDataComment(summary: RunSummary): string {
  const data = {
    mode: summary.mode,
    modelMs: Math.round(summary.model_ms),
    toolRoundTrips: summary.tool_round_trips,
    numTurns: summary.num_turns,
    tokensIn: summary.tokens_in,
    tokensOut: summary.tokens_out,
    cacheReadTokens: summary.cache_read_tokens,
    cacheCreationTokens: summary.cache_creation_tokens,
    costUsd: summary.cost_usd,
  };
  return `${footerDataPrefix} ${JSON.stringify(data)} -->`;
}

/**
 * Render the run-summary footer: the marker-wrapped, collapsible metrics block
 * (built from the shared {@link buildMarkedDetailsBlock} helper). Everything in
 * the footer is run-varying and marker-bounded — including the machine-readable
 * {@link renderDataComment} block appended after the table — so {@link
 * stripRunSummaryFooter} removes it whole. The occasional usage tip is not
 * rendered here: it comes from the rotating `reviewTip.ts` pool, appended by
 * the caller. The two leading blank lines separate the footer from the
 * preceding review body.
 */
export function renderRunSummaryFooter(summary: RunSummary): string {
  return [
    "",
    "",
    buildMarkedDetailsBlock({
      startMarker: footerStartMarker,
      endMarker: footerEndMarker,
      summary: "Review run summary 🤖",
      bodyLines: [
        "| Metric | Value |",
        "| --- | --- |",
        ...buildRows(summary),
        "",
        renderDataComment(summary),
      ],
    }),
  ].join("\n");
}

/** Minimal body posted for a clean approval so the comment is never footer-only. */
export const cleanApprovalBody = "✅ No issues found.";

/**
 * A clean approval — an empty review body with no inline comments. The single
 * source of truth for the no-issues case: it drives both the
 * {@link cleanApprovalBody} substitution in {@link buildReviewBody} and the
 * caller's decision to skip the random review tip.
 */
export function isCleanApproval(reviewBody: string, hasInlineComments: boolean): boolean {
  return reviewBody.trim() === "" && !hasInlineComments;
}

/**
 * Assemble the main review body, then append the run-summary footer.
 *
 * A clean approval gets the {@link cleanApprovalBody} line so the action never
 * posts a footer-only, stats-only comment that reads as an empty (or broken)
 * review. The pr:review skill deliberately returns an empty `reviewComment` for
 * this case, so the minimal line is substituted here rather than in the model
 * output.
 */
export function buildReviewBody(
  reviewBody: string,
  footer: string,
  hasInlineComments: boolean,
): string {
  const body = isCleanApproval(reviewBody, hasInlineComments) ? cleanApprovalBody : reviewBody;
  return body + footer;
}

/**
 * Remove the marker-bounded run-summary footer (inclusive of the `---` rule)
 * from a review body so duplicate detection compares the stable content only.
 * Returns the body unchanged when either marker is absent.
 */
export function stripRunSummaryFooter(body: string): string {
  const start = body.indexOf(footerStartMarker);
  if (start === -1) return body;

  const end = body.indexOf(footerEndMarker, start);
  if (end === -1) return body;

  return (body.slice(0, start) + body.slice(end + footerEndMarker.length)).trimEnd();
}

/**
 * Every rendered shape of the retired always-on usage hint: one frozen sentence
 * that shipped first as a `> 💡 …` blockquote and later as a two-line `> [!TIP]`
 * alert, with the bot login (`@\S+`) varying per consumer. Keyed on the sentence
 * rather than one byte-exact era so every historical rendering matches.
 */
const legacyUsageHintPattern =
  /(?:> \[!TIP\]\n)?> (?:💡 )?`@\S+ <comment>` — Ask the AI reviewer a question or request changes\. Replies inside a review thread the bot already opened don't need the mention\.\n?/g;

/**
 * Remove the retired always-on usage hint from a review body. The hint sat
 * outside the footer's strip markers, so every pre-hotfix review body on GitHub
 * carries it forever — this strip is permanent compat, not a transition shim:
 * without it `reviewDedupKey` could never match a historical body again and
 * duplicate suppression would re-post an otherwise-identical review once per
 * PR. Leftover blank lines are collapsed later by `normalizeBody`.
 */
export function stripLegacyUsageHint(body: string): string {
  return body.replaceAll(legacyUsageHintPattern, "");
}
