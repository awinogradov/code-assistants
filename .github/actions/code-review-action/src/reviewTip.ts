/**
 * Random review tip: a curated pool of one-line usage tips, one of which is
 * appended to ~5% of posted review comments so PR authors discover bot and
 * workflow capabilities they would otherwise only find in the docs.
 *
 * Each rendered tip embeds its id in a hidden HTML marker so later runs can
 * see which tips a PR has already received (no external state) and so the
 * duplicate-suppression key can strip the block — a rolled tip must never
 * make two otherwise-identical reviews look different. Extraction and
 * stripping share one full-block pattern: matching the exact rendered shape
 * (not bare markers) keeps a marker quoted inside a review's code fence from
 * pairing with a real end marker and corrupting either the shown-id set or
 * the dedup key.
 *
 * @example
 * const shown = extractShownTipIds(await listBotReviewBodies(octokit, ...));
 * const tip = selectReviewTip(Math.random(), shown);
 * const body = tip ? review + renderReviewTip(tip) : review;
 * // dedup: normalizeBody(stripRunSummaryFooter(stripReviewTips(body)))
 */

/** One entry of the review-tip pool. */
export interface ReviewTip {
  /** Stable kebab-case id embedded in the hidden marker (`[a-z0-9-]+`). */
  id: string;
  /** Single-line GitHub-flavored markdown rendered inside the TIP alert. */
  text: string;
}

/** Probability that a posted review carries a tip (per review run). */
export const tipProbability = 0.05;

/**
 * The curated tip pool: bot/PR-flow usage plus repo-convention reminders.
 * Texts must stay true for downstream consumers of the action, so every
 * link is an absolute URL into this repository whose path exists in-tree
 * (guarded by a test) — review comments render outside the repo, where
 * relative links do not resolve.
 */
export const reviewTips: readonly ReviewTip[] = [
  {
    id: "re-review",
    text: "Pushed a fix? Reply `re-review` (or `ptal`) on the PR to get a fresh verdict from the reviewer.",
  },
  {
    id: "pr-resolve",
    text: "The [pr:resolve skill](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/pr:resolve/SKILL.md) turns this review into fixes — run `/autopilot:pr-resolve` locally.",
  },
  {
    id: "commit-suggestion",
    text: "Inline findings carry a one-click **Commit suggestion** and a copy-paste [Prompt for AI agents](https://github.com/awinogradov/code-assistants/blob/main/docs/04-code-review-suggestions.md) block.",
  },
  {
    id: "conventional-commits",
    text: "Commit subjects follow [Conventional Commits](https://github.com/awinogradov/code-assistants/blob/main/CONTRIBUTING.md) — lowercase type, subject at 50 characters or fewer.",
  },
  {
    id: "todo-links",
    text: "Every `TODO`/`FIXME` needs an issue link on the next line (`// @see <issue-url>`) — see [CONTRIBUTING.md](https://github.com/awinogradov/code-assistants/blob/main/CONTRIBUTING.md).",
  },
  {
    id: "squash-review-fixes",
    text: "Squash review-fix commits back into the original `feat`/`fix` commit before merge so the history stays atomic.",
  },
  {
    id: "pr-monitor",
    text: "The [pr:monitor skill](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/pr:monitor/SKILL.md) babysits a PR — run `/autopilot:pr-monitor` and it fixes CI and resolves feedback until approval.",
  },
  {
    id: "pr-update",
    text: "Pushed more commits? Run `/autopilot:pr-update` so the [PR title and description](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/pr:update/SKILL.md) reflect the full change set.",
  },
  {
    id: "issue-magic-words",
    text: "Link the PR to its issue with magic words in an **Issues:** section — `Closes #123` auto-closes it on merge (see [CONTRIBUTING.md](https://github.com/awinogradov/code-assistants/blob/main/CONTRIBUTING.md)).",
  },
  {
    id: "run-summary",
    text: "Every review ends with a collapsed [run summary](https://github.com/awinogradov/code-assistants/blob/main/docs/03-code-review-run-summary.md) — expand it to see the run's model time, tokens, and cost.",
  },
  {
    id: "autopilot-run",
    text: "One command from issue to reviewed PR: [/autopilot:run](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/run/SKILL.md) plans, implements, commits, and opens the PR.",
  },
  {
    id: "todo-cleanup",
    text: "Run [/autopilot:todo-cleanup](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/todo-cleanup/SKILL.md) to file tracking issues for `TODO`/`FIXME` comments and link them in place.",
  },
];

/**
 * The exact rendered tip block, with the id captured. Single source of truth
 * for extraction and stripping; the render/strip round-trip test pins it to
 * {@link renderReviewTip}'s output shape.
 */
const reviewTipBlockPattern =
  /<!-- review-tip-start: ([a-z0-9-]+) -->\n> \[!TIP\]\n> [^\n]*\n<!-- review-tip-end -->/g;

/**
 * Pick the tip for this run, or nothing. Pure: the caller injects the roll.
 * One roll in `[0, 1)` drives both decisions — `roll >= tipProbability`
 * misses the gate, and conditional on passing, `roll / tipProbability` is
 * uniform on `[0, 1)`, indexing the unshown subset (the `Math.min` clamp
 * absorbs the floating-point edge where the ratio rounds up to 1). Tips the
 * PR has already seen are excluded; an exhausted pool yields nothing.
 */
export function selectReviewTip(
  roll: number,
  shownIds: ReadonlySet<string>,
): ReviewTip | undefined {
  if (roll >= tipProbability) return undefined;

  const unshown = reviewTips.filter((tip) => !shownIds.has(tip.id));
  if (unshown.length === 0) return undefined;

  const index = Math.min(Math.floor((roll / tipProbability) * unshown.length), unshown.length - 1);
  return unshown[index];
}

/**
 * Render a tip as a top-level `> [!TIP]` alert (GitHub forbids nesting alerts
 * inside `<details>` or other blockquotes) wrapped in its hidden id markers.
 * The two leading blank lines separate the block from the preceding body.
 */
export function renderReviewTip(tip: ReviewTip): string {
  return `\n\n<!-- review-tip-start: ${tip.id} -->\n> [!TIP]\n> ${tip.text}\n<!-- review-tip-end -->`;
}

/** Collect the tip ids already rendered into any of the given review bodies. */
export function extractShownTipIds(bodies: readonly string[]): Set<string> {
  return new Set(
    bodies.flatMap((body) => [...body.matchAll(reviewTipBlockPattern)].map((match) => match[1])),
  );
}

/**
 * Remove every rendered tip block from a review body. Used by the dedup key
 * so a rolled tip never defeats duplicate suppression; leftover blank lines
 * are collapsed later by `normalizeBody`. Bodies without tips pass through
 * unchanged.
 */
export function stripReviewTips(body: string): string {
  return body.replaceAll(reviewTipBlockPattern, "");
}
