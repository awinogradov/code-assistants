/**
 * Tests for buildReport.ts.
 * Asserts table headers, daily aggregation, breach rendering, correlation,
 * and that the attribution prompt embeds the fired reasons and window date.
 */
import { describe, expect, test } from "bun:test";

import type { RunRecord } from "./collectRuns.ts";
import { buildAttributionPrompt, buildReport, pearson } from "./buildReport.ts";

function run(costUsd: number, submittedAt: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    mode: "review",
    modelMs: 30000,
    toolRoundTrips: 10,
    numTurns: 3,
    tokensIn: 150000,
    tokensOut: Math.round(costUsd * 100000),
    cacheReadTokens: 140000,
    cacheCreationTokens: 1000,
    costUsd,
    prNumber: 7,
    submittedAt,
    additions: 100,
    deletions: 10,
    ...overrides,
  };
}

const reasons = [
  { metric: "median cost per run (USD)", baseline: 0.3, current: 0.5, threshold: 25 },
];

describe("buildReport()", () => {
  test("renders coverage, tables, and breach reasons", () => {
    const runs = [
      run(0.3, "2026-06-01T10:00:00Z"),
      run(0.5, "2026-06-01T15:00:00Z", { prNumber: 8 }),
      run(0.4, "2026-06-02T10:00:00Z", { prNumber: 9 }),
      run(0.1, "2026-06-02T11:00:00Z", { mode: "preflight" }),
    ];
    const report = buildReport({
      runs,
      scannedReviews: 12,
      verdict: { breach: true, reasons },
      lookbackDays: 30,
    });

    expect(report).toContain(
      "Coverage: 3 review runs (4 footers total) parsed from 12 reviews across 3 PRs in the last 30 days.",
    );
    expect(report).toContain("### Breached thresholds");
    expect(report).toContain("| median cost per run (USD) | 0.30 | 0.50 | 25 |");
    expect(report).toContain("| Date | Runs | Avg cost | Max cost | Avg round-trips | Avg output tokens |");
    expect(report).toContain("| 2026-06-01 | 2 | $0.40 | $0.50 | 10.0 |");
    expect(report).toContain("| PR | Date | Cost | Round-trips | Output tokens | Cache write | $ / 1k output |");
    expect(report).toContain("Cost ↔ output-tokens correlation (Pearson r): 1.00");
  });

  test("renders the no-breach heading without a reasons table", () => {
    const report = buildReport({
      runs: [run(0.3, "2026-06-01T10:00:00Z")],
      scannedReviews: 2,
      verdict: { breach: false, reasons: [] },
      lookbackDays: 30,
    });
    expect(report).toContain("### No thresholds breached");
    expect(report).not.toContain("| Trigger |");
  });
});

describe("buildAttributionPrompt()", () => {
  test("embeds the fired reasons and the prior-window start date", () => {
    const runs = [
      run(0.3, "2026-06-01T10:00:00Z"),
      run(0.3, "2026-06-02T10:00:00Z"),
      run(0.5, "2026-06-03T10:00:00Z"),
      run(0.5, "2026-06-04T10:00:00Z"),
    ];
    const prompt = buildAttributionPrompt(runs, reasons, 2);

    expect(prompt).toContain("median cost per run (USD): 0.3 -> 0.5 (threshold 25)");
    expect(prompt).toContain("since 2026-06-01");
    expect(prompt).toContain("pr:review/SKILL.md");
    expect(prompt).toContain("untrusted data");
  });
});

describe("pearson()", () => {
  test("returns 0 for constant or short input", () => {
    expect(pearson([1], [2])).toBe(0);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });

  test("detects a perfect inverse correlation", () => {
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
});
