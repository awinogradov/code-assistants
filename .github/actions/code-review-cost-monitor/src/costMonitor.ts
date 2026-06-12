/**
 * Entry of the monitor step: collect run metrics, evaluate thresholds, render
 * the report, and emit the step outputs the rest of the composite action keys
 * on (`breach`, `report_file`, `prompt_file`).
 *
 * All configuration arrives as env vars mirroring the action inputs and is
 * validated here at the boundary; an empty string falls back to the input's
 * default so the synced workflow can pass dispatch inputs straight through.
 * The entry never posts anything — issue writing lives in `reportIssue.ts`,
 * which also makes a local run of this file a natural read-only dry run.
 *
 * @example
 * GH_TOKEN=$(gh auth token) GITHUB_REPOSITORY=owner/repo bun src/costMonitor.ts
 */
import { mkdir } from "node:fs/promises";

import { setOutput } from "@actions/core";
import { parseRepo } from "@code-assistants/actions-core/parseRepo";
import { z } from "zod";

import { buildAttributionPrompt, buildReport } from "./buildReport.ts";
import { collectRuns, createRetryingOctokit } from "./collectRuns.ts";
import type { ThresholdConfig } from "./evaluateThresholds.ts";
import { evaluateThresholds } from "./evaluateThresholds.ts";

/** Treat an unset OR empty env value as absent so the field default applies. */
const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

/** Env contract of the monitor step, mirroring the action inputs. */
const envSchema = z.object({
  GH_TOKEN: z.string().min(1),
  GITHUB_REPOSITORY: z.string().min(1),
  COMPARISON_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(["rolling-baseline", "previous-run"]).default("rolling-baseline"),
  ),
  BASELINE_WINDOW: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(14)),
  INCREASE_PCT: z.preprocess(emptyToUndefined, z.coerce.number().positive().default(25)),
  SINGLE_RUN_CEILING_USD: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().default(1.5),
  ),
  NORMALIZED_REGRESSION_PCT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().default(25),
  ),
  MIN_RUNS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(8)),
  LOOKBACK_DAYS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(30)),
});

/** Fully resolved monitor configuration. */
export interface MonitorConfig {
  token: string;
  owner: string;
  repo: string;
  lookbackDays: number;
  thresholds: ThresholdConfig;
}

/**
 * Validate the env into a {@link MonitorConfig}. Throws a ZodError naming the
 * offending variable — the action surfaces that instead of running on a
 * half-applied configuration.
 */
export function parseMonitorConfig(env: Record<string, string | undefined>): MonitorConfig {
  const parsed = envSchema.parse(env);
  const { owner, repo } = parseRepo(parsed.GITHUB_REPOSITORY);

  return {
    token: parsed.GH_TOKEN,
    owner,
    repo,
    lookbackDays: parsed.LOOKBACK_DAYS,
    thresholds: {
      comparisonMode: parsed.COMPARISON_MODE,
      baselineWindow: parsed.BASELINE_WINDOW,
      increasePct: parsed.INCREASE_PCT,
      singleRunCeilingUsd: parsed.SINGLE_RUN_CEILING_USD,
      normalizedRegressionPct: parsed.NORMALIZED_REGRESSION_PCT,
      minRuns: parsed.MIN_RUNS,
    },
  };
}

async function run(): Promise<void> {
  const config = parseMonitorConfig(process.env);
  const octokit = createRetryingOctokit(config.token);
  const now = new Date();

  const collected = await collectRuns(octokit, {
    owner: config.owner,
    repo: config.repo,
    lookbackDays: config.lookbackDays,
    now,
  });
  const verdict = evaluateThresholds(collected.runs, config.thresholds);
  const report = buildReport({
    runs: collected.runs,
    scannedReviews: collected.scannedReviews,
    verdict,
    lookbackDays: config.lookbackDays,
  });

  const outDir = `${process.env.RUNNER_TEMP ?? "/tmp"}/cost-monitor`;
  await mkdir(outDir, { recursive: true });

  const reportFile = `${outDir}/report.md`;
  await Bun.write(reportFile, report);
  setOutput("breach", String(verdict.breach));
  setOutput("report_file", reportFile);

  if (verdict.breach) {
    const promptFile = `${outDir}/attribution-prompt.txt`;
    await Bun.write(
      promptFile,
      buildAttributionPrompt(collected.runs, verdict.reasons, config.thresholds.baselineWindow),
    );
    setOutput("prompt_file", promptFile);
  }

  console.log(
    `Parsed ${collected.runs.length} runs from ${collected.scannedReviews} reviews; ` +
      `breach=${verdict.breach}${verdict.breach ? ` (${verdict.reasons.map((r) => r.metric).join("; ")})` : ""}.`,
  );
  console.log(report);
}

if (import.meta.main) {
  await run();
}
