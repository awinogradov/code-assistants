/**
 * Contract test: the writer (code-review-action) and the parser (this action)
 * agree on the run-summary data comment. Renders a footer with the real
 * `renderRunSummaryFooter` and asserts `parseFooterMetrics` recovers the
 * metrics — so a writer-side format change (dropping or renaming the data
 * comment, changing a key) fails here at authoring time instead of silently
 * zeroing the cost monitor on a downstream scheduled run.
 *
 * The relative cross-action import mirrors the existing reach in this action's
 * `action.yml` (the attribution step runs `../code-review-action/src/runClaude.ts`),
 * so it introduces no new coupling.
 */
import { describe, expect, test } from "bun:test";

import {
  renderRunSummaryFooter,
  type RunSummary,
} from "../../code-review-action/src/runSummaryFooter.ts";
import { parseFooterMetrics } from "./footerMetrics.ts";

const summary: RunSummary = {
  mode: "review",
  model: "claude-opus-4-8",
  model_ms: 34000,
  tokens_in: 157825,
  tokens_out: 36705,
  cache_read_tokens: 157000,
  cache_creation_tokens: 800,
  cost_usd: 0.35,
  num_turns: 3,
  tool_round_trips: 10,
};

describe("run-summary writer ↔ parser contract", () => {
  test("parseFooterMetrics recovers what renderRunSummaryFooter wrote", () => {
    const body = `### Review\n\nLGTM${renderRunSummaryFooter(summary, "review-bot")}`;
    expect(parseFooterMetrics(body)).toEqual({
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

  test("a cosmetic change to the visible table does not affect parsing", () => {
    // Simulate a future restyle: <sub>-wrap every rendered table cell (the
    // historical drift). The data comment carries no pipes, so it is untouched
    // and the monitor still recovers the metrics.
    const restyled = renderRunSummaryFooter(summary, "review-bot").replace(
      /\| ([^|]+) \| ([^|]+) \|/g,
      "| <sub>$1</sub> | <sub>$2</sub> |",
    );
    expect(parseFooterMetrics(restyled)?.costUsd).toBe(0.35);
  });
});
