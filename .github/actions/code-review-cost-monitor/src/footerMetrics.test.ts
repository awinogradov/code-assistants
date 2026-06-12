/**
 * Tests for footerMetrics.ts.
 * Covers the documented footer example, fail-open behavior on absent markers
 * and malformed cells, and non-review modes (preflight skip comments).
 */
import { describe, expect, test } from "bun:test";

import { parseFooterMetrics } from "./footerMetrics.ts";

/** Build a footer body matching the format rendered by runSummaryFooter.ts. */
function footerBody(overrides: Partial<Record<string, string>> = {}): string {
  const rows: Record<string, string> = {
    Mode: "review",
    "Model time": "34.0s",
    "Tool round-trips": "10",
    "Assistant turns": "3",
    "Tokens in / out": "157825 / 36705",
    "Cache read / write": "157000 / 800",
    "Cost (USD)": "$0.35",
    ...overrides,
  };
  const table = Object.entries(rows)
    .map(([label, value]) => `| ${label} | ${value} |`)
    .join("\n");

  return [
    "Review prose above the footer.",
    "",
    "> 💡 `@review-bot <comment>` — Ask the AI reviewer a question.",
    "",
    "<!-- run-summary-start -->",
    "---",
    "<details>",
    "<summary>Review run summary 🤖</summary>",
    "<br />",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    table,
    "",
    "</details>",
    "<!-- run-summary-end -->",
  ].join("\n");
}

describe("parseFooterMetrics()", () => {
  test("parses the documented footer example", () => {
    expect(parseFooterMetrics(footerBody())).toEqual({
      mode: "review",
      modelMs: 34000,
      toolRoundTrips: 10,
      numTurns: 3,
      tokensIn: 157825,
      tokensOut: 36705,
      cacheReadTokens: 157000,
      cacheCreationTokens: 800,
      costUsd: 0.35,
    });
  });

  test("parses non-review modes (preflight skip comment)", () => {
    expect(parseFooterMetrics(footerBody({ Mode: "preflight" }))?.mode).toBe("preflight");
  });

  test("parses zero-valued cells", () => {
    const metrics = parseFooterMetrics(
      footerBody({ "Cache read / write": "0 / 0", "Cost (USD)": "$0.00" }),
    );
    expect(metrics?.cacheReadTokens).toBe(0);
    expect(metrics?.costUsd).toBe(0);
  });

  test("returns undefined for empty or marker-less bodies", () => {
    expect(parseFooterMetrics(undefined)).toBeUndefined();
    expect(parseFooterMetrics(null)).toBeUndefined();
    expect(parseFooterMetrics("")).toBeUndefined();
    expect(parseFooterMetrics("A plain review comment with no footer.")).toBeUndefined();
  });

  test("returns undefined when the end marker is missing", () => {
    const truncated = footerBody().replace("<!-- run-summary-end -->", "");
    expect(parseFooterMetrics(truncated)).toBeUndefined();
  });

  test("returns undefined for a malformed cost cell", () => {
    expect(parseFooterMetrics(footerBody({ "Cost (USD)": "0.35 USD" }))).toBeUndefined();
  });

  test("returns undefined when a row label was renamed upstream", () => {
    const renamed = footerBody().replace("| Cost (USD) |", "| Total cost |");
    expect(parseFooterMetrics(renamed)).toBeUndefined();
  });

  test("returns undefined for a malformed token pair", () => {
    expect(parseFooterMetrics(footerBody({ "Tokens in / out": "157825/36705" }))).toBeUndefined();
  });
});
