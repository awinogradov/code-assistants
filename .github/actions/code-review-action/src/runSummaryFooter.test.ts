/**
 * Tests for runSummaryFooter.ts.
 * Covers RUN_SUMMARY parsing (fail-open), footer rendering (number formatting,
 * markers), and footer stripping (round-trip, missing markers).
 */
import { describe, expect, test } from "bun:test";

import {
  buildReviewBody,
  cleanApprovalBody,
  isCleanApproval,
  parseRunSummary,
  renderRunSummaryFooter,
  stripRunSummaryFooter,
  type RunSummary,
} from "./runSummaryFooter.ts";

const coreSummary: RunSummary = {
  mode: "review",
  model: "claude-sonnet-4-6",
  model_ms: 34000,
  tokens_in: 500,
  tokens_out: 100,
  cache_read_tokens: 400,
  cache_creation_tokens: 20,
  cost_usd: 0.35,
  num_turns: 3,
  tool_round_trips: 10,
};

const reviewer = "review-bot";

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

  test("parses a valid summary", () => {
    expect(parseRunSummary(JSON.stringify(coreSummary))).toEqual(coreSummary);
  });

  test("accepts the preflight mode", () => {
    const summary = { ...coreSummary, mode: "preflight" as const };
    expect(parseRunSummary(JSON.stringify(summary))).toEqual(summary);
  });
});

describe("renderRunSummaryFooter", () => {
  test("wraps the block in the strip markers and a horizontal rule", () => {
    const footer = renderRunSummaryFooter(coreSummary, reviewer);
    expect(footer).toContain("<!-- run-summary-start -->");
    expect(footer).toContain("<!-- run-summary-end -->");
    expect(footer).toContain("\n---\n");
    expect(footer).toContain("<summary>Review run summary 🤖</summary>");
  });

  test("includes the @reviewer usage hint as a visible TIP alert before the strip markers", () => {
    const footer = renderRunSummaryFooter(coreSummary, reviewer);
    expect(footer).toContain("> [!TIP]");
    expect(footer).toContain(`> \`@${reviewer} <comment>\``);
    expect(footer.indexOf(`@${reviewer} <comment>`)).toBeLessThan(
      footer.indexOf("<!-- run-summary-start -->"),
    );
  });

  test("omits the usage-hint TIP but keeps the metrics block when includeUsageHint is false", () => {
    const footer = renderRunSummaryFooter(coreSummary, reviewer, false);
    expect(footer).not.toContain("> [!TIP]");
    expect(footer).not.toContain(`@${reviewer} <comment>`);
    expect(footer).toContain("<!-- run-summary-start -->");
    expect(footer).toContain("<summary>Review run summary 🤖</summary>");
  });

  test("keeps the blank line after <br /> so the table renders inside <details>", () => {
    expect(renderRunSummaryFooter(coreSummary, reviewer)).toContain("<br />\n\n| Metric | Value |");
  });

  test("embeds the machine-readable data comment inside the strip markers", () => {
    const footer = renderRunSummaryFooter(coreSummary, reviewer);
    expect(footer).toContain('<!-- run-summary-data: {"mode":"review"');
    expect(footer).toContain('"costUsd":0.35');
    expect(footer).toContain('"modelMs":34000');
    const startAt = footer.indexOf("<!-- run-summary-start -->");
    const endAt = footer.indexOf("<!-- run-summary-end -->");
    const dataAt = footer.indexOf("<!-- run-summary-data:");
    expect(dataAt).toBeGreaterThan(startAt);
    expect(dataAt).toBeLessThan(endAt);
  });

  test("formats durations as seconds and cost as USD", () => {
    const footer = renderRunSummaryFooter(coreSummary, reviewer);
    expect(footer).toContain("| Model | claude-sonnet-4-6 |");
    expect(footer).toContain("| Model time | 34.0s |");
    expect(footer).toContain("| Cost (USD) | $0.35 |");
    expect(footer).toContain("| Tokens in / out | 500 / 100 |");
    expect(footer).toContain("| Cache read / write | 400 / 20 |");
  });

  test("renders no fan-out rows (single-pass review)", () => {
    const footer = renderRunSummaryFooter(coreSummary, reviewer);
    expect(footer).not.toContain("Fan-out time");
    expect(footer).not.toContain("Agents");
    expect(footer).not.toContain("Parallel speedup");
    expect(footer).not.toContain("Slowest agents");
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

  test("strips the marker-bounded metrics but keeps the visible usage hint", () => {
    const reviewComment = "### Review\n\nLGTM";
    const stripped = stripRunSummaryFooter(
      reviewComment + renderRunSummaryFooter(coreSummary, reviewer),
    );
    expect(stripped).toContain(reviewComment);
    expect(stripped).toContain(`@${reviewer} <comment>`);
    expect(stripped).not.toContain("Review run summary");
    expect(stripped).not.toContain("<!-- run-summary-start -->");
  });

  test("two bodies with different metrics strip to the same content", () => {
    const reviewComment = "### Review\n\nLGTM";
    const first = reviewComment + renderRunSummaryFooter(coreSummary, reviewer);
    const second =
      reviewComment +
      renderRunSummaryFooter({ ...coreSummary, cost_usd: 0.99, model_ms: 1 }, reviewer);
    expect(stripRunSummaryFooter(first)).toBe(stripRunSummaryFooter(second));
  });
});

describe("isCleanApproval", () => {
  test("is true for an empty or whitespace-only body with no inline comments", () => {
    expect(isCleanApproval("", false)).toBe(true);
    expect(isCleanApproval("   \n", false)).toBe(true);
  });

  test("is false when the body carries content", () => {
    expect(isCleanApproval("### Review\n\nLGTM", false)).toBe(false);
  });

  test("is false when inline comments exist, even with an empty body", () => {
    expect(isCleanApproval("", true)).toBe(false);
  });
});

describe("buildReviewBody", () => {
  const footer = renderRunSummaryFooter(coreSummary, reviewer);

  test("substitutes the clean-approval line for an empty body with no inline comments", () => {
    expect(buildReviewBody("", footer, false)).toBe(cleanApprovalBody + footer);
  });

  test("treats a whitespace-only body as a clean approval", () => {
    expect(buildReviewBody("   \n", footer, false)).toBe(cleanApprovalBody + footer);
  });

  test("never posts a footer-only comment for a clean approval", () => {
    const body = buildReviewBody("", footer, false);
    expect(body).not.toBe(footer);
    expect(body.startsWith(cleanApprovalBody)).toBe(true);
  });

  test("keeps a content-bearing body and appends the footer", () => {
    const reviewComment = "### 👍 Approve\n\nLGTM";
    expect(buildReviewBody(reviewComment, footer, false)).toBe(reviewComment + footer);
  });

  test("leaves an empty body unchanged when inline comments exist", () => {
    expect(buildReviewBody("", footer, true)).toBe(footer);
  });

  test("still posts the no-issues line for a clean approval without a footer", () => {
    expect(buildReviewBody("", "", false)).toBe(cleanApprovalBody);
  });
});
