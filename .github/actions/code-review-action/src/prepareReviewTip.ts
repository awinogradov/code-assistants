/**
 * Prepare the optional generated review tip (the enabled path of the ~5% roll).
 *
 * Runs after the review step and before submit, mirroring the preflight triad.
 * It owns the roll on this path: it excludes tips the PR has already seen (their
 * hidden markers in prior bot reviews), picks one against the 5% gate, and — when
 * a tip is warranted and the review is not a clean approval — assembles the
 * bounded consumer context (`CONTRIBUTING.md`, the `docs/` listing, and the PR's
 * changed files), builds the untrusted-data prompt, and writes it to a
 * `$RUNNER_TEMP` file. It emits three step outputs the generate step and submit
 * step consume: `generate`, `tip_prompt_file`, and `fallback_tip` (the selected
 * static tip as JSON).
 *
 * Fail-open by construction (the step is `continue-on-error`): on a clean
 * approval, an exhausted pool, or any error, it emits `generate=false`; when a
 * static tip was selected but context assembly fails, the static `fallback_tip`
 * still stands so submit shows it. Generation never blocks or degrades the review.
 *
 * @example
 * GH_TOKEN=xxx REPO=o/r PR_NUMBER=1 REVIEWER=bot STRUCTURED_OUTPUT='{...}' \
 *   GITHUB_WORKSPACE=/w RUNNER_TEMP=/t bun run scripts/prepareReviewTip.ts
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import { setOutput } from "./actionsOutput.ts";
import { extractShownTipIds, selectReviewTip } from "./reviewTip.ts";
import { listBotReviewBodies, parseRepoEnv } from "./github/githubReview.ts";
import {
  buildTipPrompt,
  maxChangedFiles,
  type ChangedFile,
  type ConsumerContext,
} from "./reviewTipGeneration.ts";

/** Minimal shape of the review step's structured output needed for the clean-approval proxy. */
const reviewSchema = z.object({
  verdict: z.string().optional(),
  reviewComment: z.string().optional(),
  inlineComments: z.array(z.unknown()).optional(),
});

/**
 * Cheap clean-approval proxy from the review output: an `approve` verdict with an
 * empty comment and no inline findings. Submit's exact `isCleanApproval` remains
 * the final authority for rendering — this only skips a wasted generation call on
 * an obvious clean approval. Fails open to `false` (attempt generation) on a
 * missing or invalid value.
 */
function isCleanApprovalProxy(raw: string | undefined): boolean {
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  const result = reviewSchema.safeParse(parsed);
  if (!result.success) return false;

  const { verdict, reviewComment, inlineComments } = result.data;
  return (
    verdict === "approve" &&
    (reviewComment ?? "").trim() === "" &&
    (inlineComments?.length ?? 0) === 0
  );
}

/** Read the consumer repo's `CONTRIBUTING.md`, or an empty string when absent. */
async function readContributing(workspace: string): Promise<string> {
  try {
    return await Bun.file(join(workspace, "CONTRIBUTING.md")).text();
  } catch {
    return "";
  }
}

/** List the consumer repo's `docs/` entry names, or an empty list when absent. */
async function readDocsList(workspace: string): Promise<string[]> {
  try {
    return await readdir(join(workspace, "docs"));
  } catch {
    return [];
  }
}

/** Fetch the PR's changed files as `path (status)` pairs, or an empty list on failure. */
async function fetchChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<ChangedFile[]> {
  try {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: maxChangedFiles,
    });
    return data.map((file) => ({ path: file.filename, status: file.status }));
  } catch {
    return [];
  }
}

/** Assemble the bounded consumer context; each source fails open independently. */
async function gatherConsumerContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  workspace: string,
): Promise<ConsumerContext> {
  const [contributing, docsList, changedFiles] = await Promise.all([
    readContributing(workspace),
    readDocsList(workspace),
    fetchChangedFiles(octokit, owner, repo, pullNumber),
  ]);
  return { contributing, docsList, changedFiles };
}

/** Emit `generate=false` with no fallback — the no-tip decision. */
async function emitNoTip(): Promise<void> {
  await setOutput("generate", "false");
  await setOutput("fallback_tip", "");
}

/**
 * Assemble the context, write the prompt file, and emit `generate=true`. On any
 * failure the static `fallback_tip` (already emitted by the caller) still stands,
 * so this only downgrades to `generate=false`.
 */
async function writeTipPrompt(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  workspace: string,
  fallbackId: string,
): Promise<void> {
  try {
    const context = await gatherConsumerContext(octokit, owner, repo, pullNumber, workspace);
    const promptFile = `${process.env.RUNNER_TEMP ?? "/tmp"}/tip-prompt.txt`;
    await Bun.write(promptFile, buildTipPrompt(context));
    await setOutput("tip_prompt_file", promptFile);
    await setOutput("generate", "true");
    console.log("Review tip generation prepared, fallback:", fallbackId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Tip context assembly failed::${message}`);
    await setOutput("generate", "false");
  }
}

/** Roll the tip and, when one is warranted, prepare its generation. */
async function prepareReviewTip(): Promise<void> {
  const { octokit, owner, repoName, pullNumber, reviewer } = parseRepoEnv();
  const workspace = process.env.GITHUB_WORKSPACE ?? ".";

  if (isCleanApprovalProxy(process.env.STRUCTURED_OUTPUT)) {
    console.log("Clean approval — skipping review tip generation");
    return emitNoTip();
  }

  const bodies = await listBotReviewBodies(octokit, owner, repoName, pullNumber, reviewer);
  const tip = selectReviewTip(Math.random(), extractShownTipIds(bodies));
  if (!tip) {
    console.log("No tip rolled (missed gate or exhausted pool)");
    return emitNoTip();
  }

  // The static pick stands even if context assembly fails inside writeTipPrompt.
  await setOutput("fallback_tip", JSON.stringify(tip));
  return writeTipPrompt(octokit, owner, repoName, pullNumber, workspace, tip.id);
}

try {
  await prepareReviewTip();
} catch (error) {
  // Fail open: a glitch preparing a tip must never block or fail the review.
  const message = error instanceof Error ? error.message : String(error);
  console.log(`::warning title=Prepare review tip failed::${message}`);
  await emitNoTip();
}
