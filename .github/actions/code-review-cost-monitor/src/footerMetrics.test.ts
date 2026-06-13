/**
 * Tests for footerMetrics.ts.
 * Covers the data-comment happy path, fail-open behavior (absent marker,
 * unclosed comment, malformed JSON, schema-invalid payload), non-review modes,
 * independence from the visible table, and the hasRunSummaryData predicate.
 */
import { describe, expect, test } from "bun:test";

import { hasRunSummaryData, parseFooterMetrics, type RunMetrics } from "./footerMetrics.ts";

const metrics: RunMetrics = {
  mode: "review",
  modelMs: 34000,
  toolRoundTrips: 10,
  numTurns: 3,
  tokensIn: 157825,
  tokensOut: 36705,
  cacheReadTokens: 157000,
  cacheCreationTokens: 800,
  costUsd: 0.35,
};

/** Build a review body carrying the run-summary data comment for `payload`. */
function bodyWithData(payload: unknown): string {
  return [
    "Review prose above the footer.",
    "",
    "<!-- run-summary-start -->",
    "| Metric | Value |",
    "| --- | --- |",
    "| Mode | review |",
    "",
    `<!-- run-summary-data: ${JSON.stringify(payload)} -->`,
    "<!-- run-summary-end -->",
  ].join("\n");
}

describe("parseFooterMetrics()", () => {
  test("recovers the metrics from the data comment", () => {
    expect(parseFooterMetrics(bodyWithData(metrics))).toEqual(metrics);
  });

  test("reads only the comment, ignoring the visible table format", () => {
    // A table whose labels are <sub>-wrapped (the historical drift) still parses,
    // because the parser never looks at the table.
    const body = [
      "<!-- run-summary-start -->",
      "| <sub>Mode</sub> | <sub>review</sub> |",
      "| <sub>Cost (USD)</sub> | <sub>$9.99</sub> |",
      `<!-- run-summary-data: ${JSON.stringify(metrics)} -->`,
      "<!-- run-summary-end -->",
    ].join("\n");
    expect(parseFooterMetrics(body)?.costUsd).toBe(0.35);
  });

  test("parses non-review modes (preflight skip comment)", () => {
    expect(parseFooterMetrics(bodyWithData({ ...metrics, mode: "preflight" }))?.mode).toBe(
      "preflight",
    );
  });

  test("parses zero-valued fields", () => {
    const parsed = parseFooterMetrics(bodyWithData({ ...metrics, cacheReadTokens: 0, costUsd: 0 }));
    expect(parsed?.cacheReadTokens).toBe(0);
    expect(parsed?.costUsd).toBe(0);
  });

  test("returns undefined for empty or marker-less bodies", () => {
    expect(parseFooterMetrics(undefined)).toBeUndefined();
    expect(parseFooterMetrics(null)).toBeUndefined();
    expect(parseFooterMetrics("")).toBeUndefined();
    expect(parseFooterMetrics("A plain review comment with no footer.")).toBeUndefined();
  });

  test("returns undefined when the data comment is not closed", () => {
    expect(parseFooterMetrics(`prose <!-- run-summary-data: ${JSON.stringify(metrics)}`)).toBeUndefined();
  });

  test("returns undefined for malformed JSON", () => {
    expect(parseFooterMetrics("<!-- run-summary-data: {not json -->")).toBeUndefined();
  });

  test("returns undefined when a field is missing", () => {
    const { costUsd: _omitted, ...partial } = metrics;
    expect(parseFooterMetrics(bodyWithData(partial))).toBeUndefined();
  });

  test("returns undefined for a negative metric (schema rejects)", () => {
    expect(parseFooterMetrics(bodyWithData({ ...metrics, costUsd: -1 }))).toBeUndefined();
  });

  test("returns undefined for a non-numeric metric (no coercion)", () => {
    expect(parseFooterMetrics(bodyWithData({ ...metrics, costUsd: "0.35" }))).toBeUndefined();
  });
});

describe("hasRunSummaryData()", () => {
  test("true when the data comment is present", () => {
    expect(hasRunSummaryData(bodyWithData(metrics))).toBe(true);
  });

  test("false for empty, null, or comment-less bodies", () => {
    expect(hasRunSummaryData(undefined)).toBe(false);
    expect(hasRunSummaryData(null)).toBe(false);
    expect(hasRunSummaryData("")).toBe(false);
    expect(hasRunSummaryData("A plain review comment, no footer.")).toBe(false);
    expect(hasRunSummaryData("<!-- run-summary-start -->\n| Mode | review |")).toBe(false);
  });
});
