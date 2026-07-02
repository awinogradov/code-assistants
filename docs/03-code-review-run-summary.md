# Review run-summary footer

> Chapter 3 of the [repository docs](../README.md#repository-docs).

`code-review-action` instruments every review run with per-run metrics — model latency, token usage, cache hits, cost, and tool round-trips. These numbers were invaluable while optimizing the action, but they used to live only in the Actions run logs.

The run-summary footer surfaces them directly under each review: a collapsed `<details>` block appended to the **main review comment and the preflight skip comment** — never on inline comments, never on `react`-mode replies — so reviewers can spot a slow or expensive run at a glance without digging through workflow logs. The skip-comment footer is described in "Preflight skip comments" below; the rest of this document covers the review path. The rare [random review tip](#random-review-tip) that occasionally rides beside the footer is documented below as well.

## Data flow

The metrics are computed in one process (`runClaude.ts`) and rendered in another (`submitReview.ts`). They cross the boundary as a GitHub Action **step output** — the same mechanism `structured_output` and `execution_file` already use.

```
  PROCESS 1: runClaude.ts (action.yml step id: review)
┌──────────────────────────────────────────────────────────────────┐
│  buildRunSummary() ──────────────────┐                            │
│        │  {model_ms, tokens, cost,   │                            │
│        │   cache, round_trips}       ▼                            │
│        │                      ┌────────────────┐                  │
│        │                      │ setOutput(      │                 │
│        │                      │  "run_summary") │                 │
│        │                      └────────┬───────┘                  │
│        └──▶ log.info("Run summary.")   │ (kept — Actions-log)     │
└────────────────────────────────────────┼─────────────────────────┘
                                          │ ① $GITHUB_OUTPUT (heredoc)
                                          ▼
                          ┌──────────────────────────────┐
                          │  action.yml: Submit Review    │
                          │  env RUN_SUMMARY:             │
                          │  ${{steps.review.outputs      │
                          │       .run_summary}}          │
                          └──────────────┬───────────────┘
                                         │ ②
                                         ▼
  PROCESS 2: submitReview.ts
┌──────────────────────────────────────────────────────────────────┐
│  parseRunSummary(RUN_SUMMARY)  ──③──▶ safeParse fail-open (skip)   │
│        │ ok                                                        │
│        ▼                                                           │
│  renderRunSummaryFooter(summary)                                  │
│        │  "---" + <details> table, wrapped in                     │
│        │  <!-- run-summary-start … end --> markers                │
│        ▼                                                           │
│  finalBody = buildReviewBody(body, footer, hasInline)            │
│        │                                                          │
│        ├──④──▶ reviewDedupKey(·) — strips tip block + footer      │
│        │        applied to BOTH bodies before comparison          │
│        ▼                                                          │
│  octokit.createReview({ body: finalBody })  ──⑤──▶ MAIN comment   │
│                                  (never inline, never react)      │
└──────────────────────────────────────────────────────────────────┘
```

**Flow legend:**

- ① `setOutput` writes `run_summary` to `$GITHUB_OUTPUT` using a per-call heredoc delimiter, so the JSON value is safe. It is emitted **before** `emitOutputs`, which may `process.exit(1)` on a non-success result.
- ② `action.yml` bridges the step output into the submit process as the `RUN_SUMMARY` env var. The `react`-mode reaction step is intentionally **not** wired — the footer is review-only.
- ③ `parseRunSummary` validates the untrusted env with a strict Zod schema (no coercion); an empty or invalid value yields no footer and the review posts unchanged.
- ④ The footer carries run-varying numbers, so it is stripped from both the new body and the previously-posted body before the duplicate-suppression guard compares them — otherwise the cost/latency deltas would defeat dedup. The comparison is the single `reviewDedupKey` composition, which also strips any [random review tip](#random-review-tip) block; `normalizeBody` stays generic.
- ⑤ The footer lands only on the main review comment via `createReview`; inline comments and `reactToComment.ts` replies are untouched.

## Rendered footer

`renderRunSummaryFooter` emits the collapsible metrics block alone — everything it renders is marker-bounded. Inside the block, the start marker sits directly above the `---` rule, and a blank line after `<br />` lets the GitHub-flavored markdown table render inside `<details>`. Below the table — still inside the strip markers — the footer embeds the metrics a second time as a machine-readable JSON comment; that comment, not the table, is what the cost monitor parses (see below).

Reviews posted before the footer went TIP-free carry a now-retired always-on usage hint (`` `@<reviewer> <comment>` — Ask the AI reviewer… ``) above the markers. `reviewDedupKey` strips that legacy hint — in both of its historical renderings, the early `> 💡` blockquote and the later `> [!TIP]` alert — so those bodies keep comparing equal to their new-format re-renders forever. The hint's content lives on in the [random review tip](#random-review-tip) pool as the `ask-reviewer` entry.

```text
<!-- run-summary-start -->
---
<details>
<summary>Review run summary 🤖</summary>
<br />

| Metric | Value |
| --- | --- |
| Mode | review |
| Model | claude-sonnet-4-6 |
| Model time | 34.0s |
| Tool round-trips | 10 |
| Assistant turns | 3 |
| Tokens in / out | 157825 / 36705 |
| Cache read / write | 157000 / 800 |
| Cost (USD) | $0.35 |

<!-- run-summary-data: {"mode":"review","modelMs":34000,"toolRoundTrips":10,"numTurns":3,"tokensIn":157825,"tokensOut":36705,"cacheReadTokens":157000,"cacheCreationTokens":800,"costUsd":0.35} -->

</details>
<!-- run-summary-end -->
```

**Model** is the model that actually served the run — read from the SDK's `system`/`init` message, falling back to the action's `model` input when the stream ends before init. **Tokens in** is the total input the model consumed — fresh input plus cache reads plus cache creation — so it stays plausible under heavy prompt caching (reading only the uncached `input_tokens` reports a misleading near-zero residual). **Cache read / write** is the breakdown of that total.

**The footer is machine-consumed.** After the visible table — still inside the strip markers — the footer embeds the same metrics as a machine-readable JSON comment (`<!-- run-summary-data: … -->`), keyed to mirror the monitor's `runMetricsSchema`. The scheduled [`code-review-cost-monitor`](../.github/actions/code-review-cost-monitor/README.md) action reads **that comment**, not the table, back out of recent PR reviews to detect cost regressions, so the data-comment payload is the compatibility contract; the table is purely presentational and can be relabeled, reordered, or restyled (e.g. `<sub>`-wrapped) without touching the monitor. Dropping or renaming a payload key breaks the parser, which fails loudly only when at least `min_runs` reviews carry the comment yet none parse — a sparse or newly-adopting window degrades to "insufficient data" instead, never a red scheduled run. The monitor's optional attribution step also reuses `runClaude.ts` as its model engine.

## Clean approvals

The pr:review skill returns an empty `reviewComment` for an approval with no findings — by contract no review prose is written, the APPROVE event speaks for itself. Posting a comment that is _only_ the stats footer reads as an empty (or broken) review and is indistinguishable from a genuine content-free-approval failure, so `submitReview.ts` builds the body through `buildReviewBody`: when the review body is empty and there are no inline comments, it substitutes a minimal `✅ No issues found.` line before appending the footer. The shared `isCleanApproval` predicate detects this case and also keeps the [random review tip](#random-review-tip) off clean approvals, so a no-issues result is never padded with prompts. The dedup and consecutive-approval guards still compare the raw (empty) `reviewComment`, so repeat clean approvals are skipped rather than re-posted.

## Random review tip

On roughly 5% of review submissions the comment carries one extra `> [!TIP]` alert — a rotating tip from the curated pool in `reviewTip.ts` (bot/PR-flow usage and repo-convention reminders, [issue 389](https://github.com/awinogradov/code-assistants/issues/389)). The roll happens in `submitReview.ts` (`Math.random()` against the `tipProbability` constant); the pure selector turns that single roll into both the 5% gate and a uniform pick over the tips the PR has not seen yet.

```text
┌───────────────────┐        ┌──────────────────┐        ┌─────────────────┐
│    GitHub API     │        │ submitReview.ts  │── ② ──▶│  reviewTip.ts   │
│ prior bot reviews │── ① ──▶│ assemble comment │◀── ③ ──│ pool + selector │
└───────────────────┘        └────────┬─────────┘        └─────────────────┘
                                      │ ④
                                      ▼
                             ┌──────────────────┐
                             │  review comment  │
                             │   TIP + marker   │
                             │  summary footer  │
                             └────────┬─────────┘
                                      │ ⑤
                                      ▼
                             ┌──────────────────┐
                             │   dedup guard    │
                             │ strip tip+footer │
                             └──────────────────┘
```

**Flow legend:**

- ① Fetch the bot's prior reviews on the PR (paginated); collect shown tip ids from `<!-- review-tip-start: <id> -->` markers
- ② Pass one injected random roll (5% gate) and the shown-id set to the selector
- ③ Selector returns one unshown tip, or nothing (missed roll or exhausted pool)
- ④ Append the tip as a top-level `> [!TIP]` alert plus its hidden id marker between the review prose and the run-summary footer
- ⑤ Duplicate suppression strips tip blocks and the footer before comparing review bodies

Three contracts keep the tip safe:

- **Never repeated within a PR.** Each rendered tip embeds its id in a hidden marker (`<!-- review-tip-start: <id> -->` … `<!-- review-tip-end -->`). Before rolling, `submitReview.ts` lists the bot's prior reviews — `listBotReviewBodies` paginates past the 30-per-page default — and excludes every id already present; an exhausted pool shows nothing. Extraction and stripping match the full rendered block shape, not bare markers, so a marker quoted inside a review's code fence cannot corrupt the shown-id set or the dedup key.
- **Dedup-immune.** Every duplicate-suppression comparison goes through `reviewDedupKey` (strip tip blocks, strip the footer, strip the legacy usage hint still present in pre-hotfix bodies, normalize), so a rolled tip never makes two otherwise-identical reviews look different — and never re-posts one. The consecutive-approval guard compares the model's raw `reviewComment`, which never contains a tip.
- **Fail-open, quiet on clean approvals.** A clean approval (`✅ No issues found.`) stays tip-free — a no-issues result isn't padded with prompts. A failure listing prior reviews logs `Skipping review tip (fail-open): …` and posts the review untipped; a selected tip logs `Review tip selected: <id>` for auditability.

The pool and the ~5% rate are hardcoded — no action input configures them. Consumers tracking the action `@main` receive tips on merge; disabling them means reverting the feature commit upstream. Tip links are absolute URLs into this repository whose paths must exist in-tree, guarded by a `reviewTip.test.ts` case so a docs move cannot silently 404 a shipped tip.

## Preflight skip comments

When preflight checks fail, the action skips the AI review and posts a "red flags 🚩" comment. Each failed check links to its run log, carries a one-sentence "why it failed" blockquote, and — when that explanation ran — the comment closes with the same run-summary footer as a review.

The skip path mirrors the review/react flow as three steps instead of one inline call, so it reuses the existing Agent-SDK engine rather than a second Anthropic SDK:

- **`preflightChecks.ts` (step `preflight`)** polls the checks. On failure it fetches each failed check's annotations (`checks.listAnnotations`), builds an "explain" prompt that frames those annotations as untrusted data, writes it to a `$RUNNER_TEMP` file, and emits the failed checks (`failed_json`) plus `has_failures`/`explain` flags as step outputs. It posts no comment itself; the timeout path, which makes no model call, still posts inline.
- **`runClaude.ts` (step `explain`)** is the same engine the review uses, run with `CLAUDE_RUN_MODE=preflight` and a `reasons` JSON schema. It returns the per-check reasons as `structured_output` and the metrics as `run_summary` — so cost comes from the SDK's `total_cost_usd`, with no per-model rate map. The step is `continue-on-error`.
- **`preflightSkipComment.ts` (step `post`)** reads `failed_json` plus the explain step's `structured_output` and `run_summary`, allowlists the reasons to known check names and sanitizes each for safe rendering, then assembles and posts the comment with footer-aware dedup.

Two things differ from the review path:

- **The footer reports a real model call.** It is appended only when the explain step produced reasons; with no annotations to explain (so the explain step is skipped) or a model error, the comment degrades to the log links alone — no blockquotes, no footer — and the skip is never blocked.
- **It is fully fail-open.** The "why" needs `anthropic_api_key` (or `claude_oauth_token`) set and `bot_token` to have Checks read. Dedup strips both the footer and the reason blockquotes before comparing, so a re-run for the same failed-check set is not re-posted.

Because the reasons derive from untrusted CI annotations, `skipComment.ts` sanitizes each one before rendering — collapsing it to a line, unwrapping markdown links, stripping HTML and the run-summary marker fragments, and defanging `@`-mentions and URLs — so a crafted annotation can't inject into the public comment.

## Source map

| File                          | Responsibility                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/runClaude.ts`            | Runs a single Agent-SDK pass (review, react, or `preflight` via `CLAUDE_RUN_MODE`); computes the summary; emits `run_summary`       |
| `src/runSummaryFooter.ts`     | `runSummarySchema`, `parseRunSummary`, `renderRunSummaryFooter`, `stripRunSummaryFooter`, `stripLegacyUsageHint`, `buildReviewBody` |
| `src/submitReview.ts`         | Builds the review body via `buildReviewBody` (clean-approval line + tip + footer); dedups via `reviewDedupKey`                      |
| `src/reviewTip.ts`            | Tip pool + `tipProbability`; pure select/render, marker-shaped extraction and stripping of the tip block                            |
| `src/github/githubReview.ts`  | `listBotReviewBodies` (paginated prior bot reviews for the no-repeat guard); `reviewDedupKey` — the one dedup composition           |
| `src/preflightChecks.ts`      | Polls checks; on failure emits the failed checks + explain prompt; posts only the timeout comment inline                            |
| `src/skipComment.ts`          | Skip-path helpers: fetch annotations, build the explain prompt, allowlist + sanitize reasons, render the comment, post/dedup        |
| `src/preflightSkipComment.ts` | Post step: assembles the failed-checks comment from the explain step's reasons + run summary and posts it (fail-open)               |
| `actions-core/checkStatus.ts` | `fetchCheckStatuses` carries each failed check's `{ name, url, checkRunId }` so the skip comment links logs                         |
| `action.yml`                  | Wires `run_summary` into Submit Review; runs the `explain` (`runClaude`) + `post` skip steps with the `model` input                 |
