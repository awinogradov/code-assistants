/**
 * Model tiering for the code-review action: route small, low-risk PRs to a
 * cheaper model so review cost tracks PR risk instead of paying the top tier on
 * every PR (issue #287).
 *
 * Review cost is dominated by output tokens, and the cheap tier (Haiku) prices
 * output ~3x below the default tier (Sonnet). Sending docs/test/config/style-only
 * PRs with small churn to the cheap tier recovers a meaningful share of spend
 * while keeping the default tier for anything CI-, security-, or core-logic-
 * sensitive and for large diffs (which also keeps each review inside the cheap
 * tier's smaller context window).
 *
 * Run as a GitHub Action step: reads MODEL_TIERING, CLAUDE_MODEL, TIER_MODEL and
 * the PR coordinates from env, then writes the chosen `model` to `$GITHUB_OUTPUT`.
 * When MODEL_TIERING is not "auto" it emits CLAUDE_MODEL unchanged, so the default
 * behaviour (always the configured model) is preserved unless tiering is opted in.
 *
 * @example
 * MODEL_TIERING=auto CLAUDE_MODEL=claude-sonnet-4-6 TIER_MODEL=claude-haiku-4-5 \
 *   GH_TOKEN=… REPO=owner/repo PR_NUMBER=42 REVIEWER=bot \
 *   bun run src/modelTier.ts   # writes model=claude-haiku-4-5 for a docs-only PR
 */
import { setOutput } from "./actionsOutput.ts";
import { parseRepoEnv } from "./github/githubReview.ts";

/** Cheap tier used when TIER_MODEL is unset. */
export const defaultTierModel = "claude-haiku-4-5";

/**
 * Churn ceiling (added + deleted lines) for cheap-tier eligibility. Above it a PR
 * stays on the default tier — larger diffs warrant the stronger model and may
 * exceed the cheap tier's smaller context window.
 */
export const maxCheapChurn = 500;

/**
 * Path fragments that keep a PR on the default tier regardless of size: CI/action
 * config (a broken workflow degrades every consuming repo), env files (runtime
 * config that may carry credentials), and security- or auth-sensitive code, where
 * a missed subtle bug is most costly.
 */
const riskSensitivePatterns = [
  /(^|\/)\.github\//,
  /(^|\/)\.env(\.|$)/i,
  // Substring (not word-bounded) so `oauth`, `authentication`, `tokenizer`, etc.
  // also keep the default tier — over-matching here only forgoes savings on a PR,
  // whereas under-matching would route security code to the weaker model.
  /(auth|crypto|secret|token|password|webhook|payment|security)/i,
];

/**
 * Extensions and path fragments that are low-risk to review on the cheap tier:
 * docs, styles, tests, config/lockfiles, and dotfiles. A PR qualifies for the
 * cheap tier only when EVERY changed file matches one of these.
 */
const lowRiskPatterns = [
  /\.(md|mdx|txt)$/i,
  /\.(css|scss|sass|less)$/i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)(docs|__tests__|__snapshots__)\//,
  /\.(ya?ml|json|toml|lock|ini|cfg|conf)$/i,
  /(^|\/)\.[^/]+$/,
];

/** True when a path keeps the PR on the default (stronger) tier. */
export function isRiskSensitive(path: string): boolean {
  return riskSensitivePatterns.some((pattern) => pattern.test(path));
}

/** True when a path is safe to review on the cheap tier. */
export function isLowRisk(path: string): boolean {
  return lowRiskPatterns.some((pattern) => pattern.test(path));
}

/** Inputs for the model-tier decision. */
export interface ModelTierInput {
  changedFiles: string[];
  churn: number;
  baseModel: string;
  cheapModel: string;
}

/**
 * Pick the review model for a PR. Returns the cheap tier only when there is at
 * least one changed file, none is risk-sensitive, every file is low-risk, and the
 * diff is small; otherwise the configured default tier. Conservative by design —
 * an empty, mixed, or unknown file set keeps the default model.
 */
export function selectModel({ changedFiles, churn, baseModel, cheapModel }: ModelTierInput): string {
  if (changedFiles.length === 0) {
    return baseModel;
  }
  if (changedFiles.some(isRiskSensitive)) {
    return baseModel;
  }
  if (churn <= maxCheapChurn && changedFiles.every(isLowRisk)) {
    return cheapModel;
  }
  return baseModel;
}

/**
 * Classify the live PR and resolve its tier. Any failure to read the diff falls
 * back to the default tier — tiering is an optimization and must never block a
 * review.
 */
async function resolveTierModel(baseModel: string, cheapModel: string): Promise<string> {
  try {
    const { octokit, owner, repoName, pullNumber } = parseRepoEnv();
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: pullNumber,
      per_page: 100,
    });
    const changedFiles = files.map((file) => file.filename);
    // A full page may be truncated: files beyond it are invisible, and a 100-file
    // diff can still fall under maxCheapChurn, so keep the default tier rather than
    // miss a risk-sensitive file past the page boundary.
    if (files.length >= 100) {
      return baseModel;
    }
    const churn = files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
    const model = selectModel({ changedFiles, churn, baseModel, cheapModel });
    console.log(`model-tier: ${model} (${changedFiles.length} files, ${churn} churn, base ${baseModel})`);
    return model;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`model-tier: keeping ${baseModel} — could not classify PR (${reason})`);
    return baseModel;
  }
}

if (import.meta.main) {
  const baseModel = process.env.CLAUDE_MODEL;
  if (!baseModel) {
    throw new Error("Missing required environment variable: CLAUDE_MODEL");
  }
  const cheapModel = process.env.TIER_MODEL || defaultTierModel;
  const tiering = process.env.MODEL_TIERING ?? "off";
  const model = tiering === "auto" ? await resolveTierModel(baseModel, cheapModel) : baseModel;
  await setOutput("model", model);
}
