/**
 * Tests for costMonitor.ts.
 * Covers the env-config boundary: defaults (including empty strings from
 * pass-through dispatch inputs), custom values, and invalid-input rejection.
 */
import { describe, expect, test } from "bun:test";

import { parseMonitorConfig } from "./costMonitor.ts";

const baseEnv = { GH_TOKEN: "t", GITHUB_REPOSITORY: "octo/repo" };

describe("parseMonitorConfig()", () => {
  test("applies defaults when threshold vars are unset or empty", () => {
    const config = parseMonitorConfig({ ...baseEnv, BASELINE_WINDOW: "", INCREASE_PCT: "" });

    expect(config).toEqual({
      token: "t",
      owner: "octo",
      repo: "repo",
      lookbackDays: 30,
      thresholds: {
        comparisonMode: "rolling-baseline",
        baselineWindow: 14,
        increasePct: 25,
        singleRunCeilingUsd: 1.5,
        normalizedRegressionPct: 25,
        minRuns: 8,
      },
    });
  });

  test("honors custom values", () => {
    const config = parseMonitorConfig({
      ...baseEnv,
      COMPARISON_MODE: "previous-run",
      BASELINE_WINDOW: "20",
      INCREASE_PCT: "10",
      SINGLE_RUN_CEILING_USD: "2.5",
      NORMALIZED_REGRESSION_PCT: "15",
      MIN_RUNS: "5",
      LOOKBACK_DAYS: "90",
    });

    expect(config.thresholds.comparisonMode).toBe("previous-run");
    expect(config.thresholds.baselineWindow).toBe(20);
    expect(config.thresholds.increasePct).toBe(10);
    expect(config.thresholds.singleRunCeilingUsd).toBe(2.5);
    expect(config.lookbackDays).toBe(90);
  });

  test("rejects a missing token, malformed repo, and invalid numbers", () => {
    expect(() => parseMonitorConfig({ GITHUB_REPOSITORY: "octo/repo" })).toThrow();
    expect(() => parseMonitorConfig({ GH_TOKEN: "t", GITHUB_REPOSITORY: "no-slash" })).toThrow(
      "Invalid REPO format",
    );
    expect(() => parseMonitorConfig({ ...baseEnv, COMPARISON_MODE: "weekly" })).toThrow();
    expect(() => parseMonitorConfig({ ...baseEnv, BASELINE_WINDOW: "-3" })).toThrow();
    expect(() => parseMonitorConfig({ ...baseEnv, LOOKBACK_DAYS: "soon" })).toThrow();
  });
});
