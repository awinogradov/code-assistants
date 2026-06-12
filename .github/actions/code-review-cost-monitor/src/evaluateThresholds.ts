/**
 * Pure threshold evaluation over collected review runs.
 *
 * Only `mode === "review"` runs feed the baselines — preflight skip-comment
 * footers are near-zero-cost and would drag every median down. Two windowed
 * triggers (rolling cost median, normalized cost per output token) compare the
 * most recent `baselineWindow` runs against the window before it and require
 * BOTH windows to hold at least `minRuns` samples — a median over two stale
 * runs fires on noise, so partially-populated windows skip those triggers
 * rather than guess. The absolute ceiling and the `previous-run` mode cover
 * what a rolling baseline structurally cannot: a single spike and a sustained
 * drift the baseline has already absorbed.
 *
 * @example
 * const verdict = evaluateThresholds(runs, config);
 * if (verdict.breach) console.log(verdict.reasons);
 */
import type { RunRecord } from "./collectRuns.ts";

/** Threshold configuration, mirroring the action's inputs. */
export interface ThresholdConfig {
  comparisonMode: "rolling-baseline" | "previous-run";
  baselineWindow: number;
  increasePct: number;
  singleRunCeilingUsd: number;
  normalizedRegressionPct: number;
  minRuns: number;
}

/** One fired trigger, with the numbers the report renders. */
export interface BreachReason {
  metric: string;
  baseline: number;
  current: number;
  threshold: number;
}

/** Evaluation outcome: breached or not, with every fired trigger. */
export interface ThresholdVerdict {
  breach: boolean;
  reasons: BreachReason[];
}

/** Median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1] ?? 0;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

/** True when `current` exceeds `baseline` by more than `pct` percent. */
function exceedsByPct(current: number, baseline: number, pct: number): boolean {
  return baseline > 0 && current > baseline * (1 + pct / 100);
}

/**
 * Compare the recent window's median against the prior window's for a derived
 * per-run value; push a reason when the increase exceeds `pct`. Skips silently
 * unless both windows hold at least `minRuns` usable samples.
 */
function evaluateWindowed(
  recent: RunRecord[],
  prior: RunRecord[],
  derive: (run: RunRecord) => number | undefined,
  metric: string,
  pct: number,
  minRuns: number,
  reasons: BreachReason[],
): void {
  const recentValues = recent.map(derive).filter((v): v is number => v !== undefined);
  const priorValues = prior.map(derive).filter((v): v is number => v !== undefined);
  if (recentValues.length < minRuns || priorValues.length < minRuns) return;

  const current = median(recentValues);
  const baseline = median(priorValues);
  if (exceedsByPct(current, baseline, pct)) {
    reasons.push({ metric, baseline, current, threshold: pct });
  }
}

/**
 * Evaluate every configured trigger over the collected runs and return the
 * fired reasons. Returns no-breach until `minRuns` review runs exist at all.
 */
export function evaluateThresholds(runs: RunRecord[], config: ThresholdConfig): ThresholdVerdict {
  const reviewRuns = runs
    .filter((run) => run.mode === "review")
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));

  if (reviewRuns.length < config.minRuns) return { breach: false, reasons: [] };

  const reasons: BreachReason[] = [];
  const recent = reviewRuns.slice(-config.baselineWindow);
  const prior = reviewRuns.slice(-2 * config.baselineWindow, -config.baselineWindow);

  if (config.comparisonMode === "rolling-baseline") {
    evaluateWindowed(
      recent,
      prior,
      (run) => run.costUsd,
      "median cost per run (USD)",
      config.increasePct,
      config.minRuns,
      reasons,
    );
  } else {
    const current = reviewRuns.at(-1);
    const baseline = reviewRuns.at(-2);
    if (current && baseline && exceedsByPct(current.costUsd, baseline.costUsd, config.increasePct)) {
      reasons.push({
        metric: "cost vs previous run (USD)",
        baseline: baseline.costUsd,
        current: current.costUsd,
        threshold: config.increasePct,
      });
    }
  }

  // Normalized cost per output token: a process regression independent of PR
  // size — evaluated in both modes whenever the windows are populated.
  evaluateWindowed(
    recent,
    prior,
    (run) => (run.tokensOut > 0 ? run.costUsd / run.tokensOut : undefined),
    "median cost per output token (USD)",
    config.normalizedRegressionPct,
    config.minRuns,
    reasons,
  );

  const ceilingRun = recent.reduce((max, run) => (run.costUsd > max.costUsd ? run : max));
  if (ceilingRun.costUsd > config.singleRunCeilingUsd) {
    reasons.push({
      metric: `single-run ceiling (USD, PR #${ceilingRun.prNumber})`,
      baseline: config.singleRunCeilingUsd,
      current: ceilingRun.costUsd,
      threshold: config.singleRunCeilingUsd,
    });
  }

  return { breach: reasons.length > 0, reasons };
}
