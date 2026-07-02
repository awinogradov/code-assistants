/**
 * Tests for reviewTip.ts.
 * Covers the 5% gate boundaries, the single-roll uniform pick, per-PR
 * exclusion/exhaustion, marker extraction and stripping (round-trip, all
 * occurrences, quoted-marker resistance), composition with the run-summary
 * footer, and the link-stability guard on the pool's absolute URLs.
 */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { normalizeBody } from "./github/githubReview.ts";
import {
  extractShownTipIds,
  renderReviewTip,
  reviewTips,
  selectReviewTip,
  stripReviewTips,
  tipProbability,
} from "./reviewTip.ts";
import { renderRunSummaryFooter, stripRunSummaryFooter, type RunSummary } from "./runSummaryFooter.ts";

const noneShown = new Set<string>();
const firstTip = reviewTips[0];
const summary: RunSummary = {
  mode: "review",
  model: "claude-sonnet-4-6",
  model_ms: 34000,
  tokens_in: 100,
  tokens_out: 10,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  cost_usd: 0.35,
  num_turns: 1,
  tool_round_trips: 2,
};

describe("reviewTips pool", () => {
  test("ids are unique and marker-safe, texts are single-line", () => {
    expect(new Set(reviewTips.map((tip) => tip.id)).size).toBe(reviewTips.length);
    for (const tip of reviewTips) {
      expect(tip.id).toMatch(/^[a-z0-9-]+$/);
      expect(tip.text).not.toContain("\n");
    }
  });

  test("every absolute repo URL points at a path that exists in-tree", async () => {
    const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
    const urls = reviewTips.flatMap((tip) => [
      ...tip.text.matchAll(
        /https:\/\/github\.com\/awinogradov\/code-assistants\/(?:blob|tree)\/main\/([^\s)]+)/g,
      ),
    ]);
    expect(urls.length).toBeGreaterThan(0);
    for (const match of urls) {
      expect(await Bun.file(join(repoRoot, match[1] ?? "")).exists()).toBe(true);
    }
  });
});

describe("selectReviewTip", () => {
  test("selects at roll 0 and just below the gate, not at the gate", () => {
    expect(selectReviewTip(0, noneShown)).toBeDefined();
    expect(selectReviewTip(tipProbability * 0.999, noneShown)).toBeDefined();
    expect(selectReviewTip(tipProbability, noneShown)).toBeUndefined();
  });

  test("maps the roll uniformly over the unshown pool", () => {
    expect(selectReviewTip(0, noneShown)).toBe(reviewTips[0]);
    expect(selectReviewTip(tipProbability * 0.999, noneShown)).toBe(reviewTips.at(-1));
  });

  test("excludes tips the PR has already seen", () => {
    expect(selectReviewTip(0, new Set([firstTip.id]))).toBe(reviewTips[1]);
  });

  test("returns undefined when every tip was shown", () => {
    expect(selectReviewTip(0, new Set(reviewTips.map((tip) => tip.id)))).toBeUndefined();
  });
});

describe("extractShownTipIds", () => {
  test("collects ids across bodies and collapses duplicates", () => {
    const bodies = [
      `review one${renderReviewTip(firstTip)}`,
      `review two${renderReviewTip(firstTip)}${renderReviewTip(reviewTips[1])}`,
    ];
    expect(extractShownTipIds(bodies)).toEqual(new Set([firstTip.id, reviewTips[1].id]));
  });

  test("ignores bare or malformed markers that lack the rendered block shape", () => {
    const bodies = [
      "quoted `<!-- review-tip-start: re-review -->` without a block",
      "<!-- review-tip-start: re-review -->\nno TIP line\n<!-- review-tip-end -->",
    ];
    expect(extractShownTipIds(bodies).size).toBe(0);
  });
});

describe("stripReviewTips", () => {
  test("round-trips: body plus a rendered tip normalizes back to the body", () => {
    const body = "### Blockers\n\n- one";
    expect(normalizeBody(stripReviewTips(body + renderReviewTip(firstTip)))).toBe(
      normalizeBody(body),
    );
  });

  test("strips every occurrence, not just the first", () => {
    const doubled = `a${renderReviewTip(firstTip)}\n\nb${renderReviewTip(reviewTips[1])}`;
    expect(normalizeBody(stripReviewTips(doubled))).toBe("a\n\nb");
  });

  test("passes bodies without tip markers through unchanged", () => {
    const body = "plain review body";
    expect(stripReviewTips(body)).toBe(body);
  });

  test("does not pair a quoted start marker with a later real end marker", () => {
    const body = `see \`<!-- review-tip-start: re-review -->\` in the diff${renderReviewTip(firstTip)}`;
    expect(stripReviewTips(body)).toContain("see `<!-- review-tip-start: re-review -->` in the diff");
    expect(stripReviewTips(body)).not.toContain("> [!TIP]");
  });
});

describe("composition with the run-summary footer", () => {
  const body = "review with findings";
  const footer = renderRunSummaryFooter(summary, "review-bot");
  const composed = body + renderReviewTip(firstTip) + footer;

  test("tip renders between the body and the footer's usage hint", () => {
    expect(composed.indexOf("<!-- review-tip-start:")).toBeLessThan(composed.indexOf("> [!TIP]\n> `@review-bot"));
  });

  test("stripping tip and footer commutes and recovers the body", () => {
    const tipThenFooter = stripRunSummaryFooter(stripReviewTips(composed));
    const footerThenTip = stripReviewTips(stripRunSummaryFooter(composed));
    expect(normalizeBody(tipThenFooter)).toBe(normalizeBody(footerThenTip));
    expect(normalizeBody(tipThenFooter)).toContain(body);
    expect(normalizeBody(tipThenFooter)).not.toContain("review-tip-start");
    expect(normalizeBody(tipThenFooter)).not.toContain("run-summary-start");
  });
});
