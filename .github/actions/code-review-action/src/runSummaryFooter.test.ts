/**
 * Tests for runSummaryFooter.ts.
 * Covers RUN_SUMMARY parsing (fail-open), footer rendering (core vs fan-out,
 * number formatting, markers), and footer stripping (round-trip, missing markers).
 */
import { describe, expect, test } from "bun:test";

import {
  parseRunSummary,
  renderRunSummaryFooter,
  stripRunSummaryFooter,
  type RunSummary,
} from "./runSummaryFooter.ts";

const coreSummary: RunSummary = {
  mode: "review",
  fanout_ms: 1200,
  model_ms: 34000,
  tokens_in: 500,
  tokens_out: 100,
  cache_read_tokens: 400,
  cache_creation_tokens: 20,
  cost_usd: 0.35,
  num_turns: 3,
  tool_round_trips: 10,
};

const fanoutSummary: RunSummary = {
  ...coreSummary,
  agent_count: 12,
  failed_count: 1,
  parallel_speedup: 8.5,
};

describe("parseRunSummary", () => {
  test("returns undefined for empty or undefined input", () => {
    expect(parseRunSummary(undefined)).toBeUndefined();
    expect(parseRunSummary("")).toBeUndefined();
  });

  test("returns undefined for malformed JSON", () => {
    expect(parseRunSummary("{not json")).toBeUndefined();
  });

  test("returns undefined when a required field is missing", () => {
    const { cost_usd: _omitted, ...partial } = coreSummary;
    expect(parseRunSummary(JSON.stringify(partial))).toBeUndefined();
  });

  test("returns undefined for an unknown mode", () => {
    expect(parseRunSummary(JSON.stringify({ ...coreSummary, mode: "bogus" }))).toBeUndefined();
  });

  test("returns undefined when a numeric field is a string (no coercion)", () => {
    expect(parseRunSummary(JSON.stringify({ ...coreSummary, cost_usd: "0.35" }))).toBeUndefined();
  });

  test("parses a valid core summary", () => {
    expect(parseRunSummary(JSON.stringify(coreSummary))).toEqual(coreSummary);
  });

  test("preserves optional fan-out fields when present", () => {
    expect(parseRunSummary(JSON.stringify(fanoutSummary))).toEqual(fanoutSummary);
  });
});

describe("renderRunSummaryFooter", () => {
  test("wraps the block in the strip markers and a horizontal rule", () => {
    const footer = renderRunSummaryFooter(coreSummary);
    expect(footer).toContain("<!-- run-summary-start -->");
    expect(footer).toContain("<!-- run-summary-end -->");
    expect(footer).toContain("\n---\n");
    expect(footer).toContain("<summary>Review run summary 🤖</summary>");
  });

  test("keeps the blank line after <br /> so the table renders inside <details>", () => {
    expect(renderRunSummaryFooter(coreSummary)).toContain("<br />\n\n| Metric | Value |");
  });

  test("formats durations as seconds and cost as USD", () => {
    const footer = renderRunSummaryFooter(coreSummary);
    expect(footer).toContain("| Model time | 34.0s |");
    expect(footer).toContain("| Fan-out time | 1.2s |");
    expect(footer).toContain("| Cost (USD) | $0.35 |");
    expect(footer).toContain("| Tokens in / out | 500 / 100 |");
    expect(footer).toContain("| Cache read / write | 400 / 20 |");
  });

  test("omits fan-out rows for a core-only summary", () => {
    const footer = renderRunSummaryFooter(coreSummary);
    expect(footer).not.toContain("Agents");
    expect(footer).not.toContain("Parallel speedup");
  });

  test("renders fan-out rows with the multiplication sign when present", () => {
    const footer = renderRunSummaryFooter(fanoutSummary);
    expect(footer).toContain("| Agents | 12 |");
    expect(footer).toContain("| Failed agents | 1 |");
    expect(footer).toContain("| Parallel speedup | 8.5× |");
  });
});

describe("stripRunSummaryFooter", () => {
  test("returns the body unchanged when no marker is present", () => {
    expect(stripRunSummaryFooter("plain review body")).toBe("plain review body");
  });

  test("returns the body unchanged when the end marker is missing", () => {
    const body = "review\n\n<!-- run-summary-start -->\n---\nstuff";
    expect(stripRunSummaryFooter(body)).toBe(body);
  });

  test("round-trips: stripping an appended footer yields the original content", () => {
    const reviewComment = "### Review\n\nLGTM";
    expect(stripRunSummaryFooter(reviewComment + renderRunSummaryFooter(coreSummary))).toBe(
      reviewComment
    );
  });

  test("two bodies with different metrics strip to the same content", () => {
    const reviewComment = "### Review\n\nLGTM";
    const first = reviewComment + renderRunSummaryFooter(coreSummary);
    const second = reviewComment + renderRunSummaryFooter(fanoutSummary);
    expect(stripRunSummaryFooter(first)).toBe(stripRunSummaryFooter(second));
  });
});
