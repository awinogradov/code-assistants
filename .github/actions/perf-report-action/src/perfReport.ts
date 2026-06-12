/**
 * Perf report comment generator — the action's entry point.
 *
 * Reads a head snapshot (and optionally a base snapshot) produced by the
 * action's snapshot/baseline steps and emits a markdown comment body on
 * stdout for `marocchino/sticky-pull-request-comment` to post on the PR.
 * The regression count is appended to `$GITHUB_OUTPUT` (when set) as the
 * `regression-count` step output.
 *
 * The script never fails the job: if anything goes wrong, a degraded comment
 * is emitted to stdout and the error is written to stderr — the PR must
 * never be blocked by report generation. The hard-fail gate is a separate
 * future follow-up; do not add a `--fail-on-regression` flag here.
 *
 * Env: `BUNDLE_LABEL` (bundle table heading, defaults to "bundle"),
 * `NOISE_BANDS` (optional JSON override of the per-metric noise bands).
 *
 * @example
 *   BUNDLE_LABEL=dist/embed/index.html \
 *     bun src/perfReport.ts --head perf-snapshot --base perf-baseline > perf-comment.md
 */
import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { parseNoiseBands } from "./noiseBands.ts";
import { renderComment } from "./renderComment.ts";
import { loadBase, loadSnapshot } from "./snapshotLoad.ts";

const writeRegressionCount = async (count: number): Promise<void> => {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath === undefined || outputPath === "") return;
  await appendFile(outputPath, `regression-count=${count.toString()}\n`, "utf8");
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    strict: true,
    allowPositionals: false,
    options: {
      head: { type: "string" },
      base: { type: "string" },
    },
  });
  if (values.head === undefined) throw new Error("--head <dir> is required");

  const bands = parseNoiseBands(process.env.NOISE_BANDS);
  const bundleLabel = process.env.BUNDLE_LABEL ?? "bundle";
  const head = await loadSnapshot(values.head);
  const base = await loadBase(values.base);
  const { markdown, regressionCount } = renderComment(head, base, { bundleLabel, bands });
  process.stdout.write(markdown);
  await writeRegressionCount(regressionCount);
};

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`perf-report: ${message}\n`);
  process.stdout.write(`## Perf report\n\nReport generation failed: ${message}\n`);
  try {
    await writeRegressionCount(0);
  } catch (outputError: unknown) {
    const outputMessage = outputError instanceof Error ? outputError.message : String(outputError);
    process.stderr.write(`perf-report: failed to write GITHUB_OUTPUT: ${outputMessage}\n`);
  }
}
