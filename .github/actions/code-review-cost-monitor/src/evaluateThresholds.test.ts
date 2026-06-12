/**
 * Tests for evaluateThresholds.ts.
 * Covers every trigger, the minRuns suppression, the partially-populated
 * window skip, mode filtering, and the one-big-PR spike that must NOT fire
 * the rolling baseline.
 */
import { describe, expect, test } from "bun:test";

import type { RunRecord } from "./collectRuns.ts";
import type { ThresholdConfig } from "./evaluateThresholds.ts";
import { evaluateThresholds } from "./evaluateThresholds.ts";

const config: ThresholdConfig = {
  comparisonMode: "rolling-baseline",
  baselineWindow: 4,
  increasePct: 25,
  singleRunCeilingUsd: 1.5,
  normalizedRegressionPct: 25,
  minRuns: 3,
};

let dayCounter = 0;

/** Build a review run; cost-proportional output keeps cost/token flat by default. */
function run(costUsd: number, overrides: Partial<RunRecord> = {}): RunRecord {
  dayCounter += 1;
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
    prNumber: dayCounter,
    submittedAt: new Date(Date.UTC(2026, 4, dayCounter)).toISOString(),
    additions: 100,
    deletions: 10,
    ...overrides,
  };
}

describe("evaluateThresholds()", () => {
  test("suppresses everything below minRuns", () => {
    const verdict = evaluateThresholds([run(0.3), run(9.9)], config);
    expect(verdict).toEqual({ breach: false, reasons: [] });
  });

  test("fires the rolling-baseline trigger on a sustained median increase", () => {
    const runs = [run(0.3), run(0.3), run(0.3), run(0.3), run(0.5), run(0.5), run(0.5), run(0.5)];
    const verdict = evaluateThresholds(runs, config);
    expect(verdict.breach).toBe(true);
    expect(verdict.reasons).toContainEqual({
      metric: "median cost per run (USD)",
      baseline: 0.3,
      current: 0.5,
      threshold: 25,
    });
  });

  test("does NOT fire the rolling baseline on a single big-PR spike", () => {
    const runs = [
      run(0.3),
      run(0.3),
      run(0.3),
      run(0.3),
      run(0.3),
      run(0.3),
      run(0.3),
      run(1.2),
    ];
    expect(evaluateThresholds(runs, config)).toEqual({ breach: false, reasons: [] });
  });

  test("skips windowed triggers when the prior window is under-populated", () => {
    const sparse: ThresholdConfig = { ...config, baselineWindow: 5, minRuns: 4 };
    const runs = [
      run(0.3),
      run(0.3),
      run(0.3),
      run(0.6),
      run(0.6),
      run(0.6),
      run(0.6),
      run(0.6),
    ];
    expect(evaluateThresholds(runs, sparse)).toEqual({ breach: false, reasons: [] });
  });

  test("fires the absolute single-run ceiling regardless of medians", () => {
    const runs = [run(0.3), run(0.3), run(0.3), run(0.3), run(0.3), run(0.3), run(0.3), run(2.1)];
    const verdict = evaluateThresholds(runs, config);
    expect(verdict.breach).toBe(true);
    expect(verdict.reasons.some((r) => r.metric.startsWith("single-run ceiling"))).toBe(true);
  });

  test("fires the normalized cost-per-output-token trigger when output shrinks", () => {
    const prior = [0.3, 0.3, 0.3, 0.3].map((cost) => run(cost));
    const recent = [0.3, 0.3, 0.3, 0.3].map((cost) => run(cost, { tokensOut: 15000 }));
    const verdict = evaluateThresholds([...prior, ...recent], config);
    expect(verdict.breach).toBe(true);
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0]?.metric).toBe("median cost per output token (USD)");
  });

  test("previous-run mode compares only the last two runs", () => {
    const runs = [run(0.3), run(0.3), run(0.3), run(0.3), run(0.5)];
    const verdict = evaluateThresholds(runs, { ...config, comparisonMode: "previous-run" });
    expect(verdict.breach).toBe(true);
    expect(verdict.reasons).toContainEqual({
      metric: "cost vs previous run (USD)",
      baseline: 0.3,
      current: 0.5,
      threshold: 25,
    });
  });

  test("ignores non-review runs entirely", () => {
    const runs = [
      run(0.3),
      run(0.3),
      run(0.3),
      run(0.3),
      run(9.9, { mode: "preflight" }),
      run(9.9, { mode: "preflight" }),
    ];
    expect(evaluateThresholds(runs, config)).toEqual({ breach: false, reasons: [] });
  });
});
