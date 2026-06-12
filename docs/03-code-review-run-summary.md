# Review run-summary footer

> Chapter 3 of the [repository docs](../README.md#repository-docs).

`code-review-action` instruments every review run with per-run metrics — model latency, token usage, cache hits, cost, and tool round-trips. These numbers were invaluable while optimizing the action, but they used to live only in the Actions run logs.

The run-summary footer surfaces them directly under each review: a collapsed `<details>` block appended to the **main review comment and the preflight skip comment** — never on inline comments, never on `react`-mode replies — so reviewers can spot a slow or expensive run at a glance without digging through workflow logs. The skip-comment footer is described in "Preflight skip comments" below; the rest of this document covers the review path.

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
│        ├──④──▶ dedupKey = normalizeBody(stripRunSummaryFooter(·)) │
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
- ④ The footer carries run-varying numbers, so it is stripped from both the new body and the previously-posted body before the duplicate-suppression guard compares them — otherwise the cost/latency deltas would defeat dedup. `normalizeBody` stays generic.
- ⑤ The footer lands only on the main review comment via `createReview`; inline comments and `reactToComment.ts` replies are untouched.

## Rendered footer

`renderRunSummaryFooter` emits a visible `@<reviewer>` usage hint followed by the collapsible metrics block. The hint is stable text and sits **outside** the strip markers so it survives dedup stripping and stays in the comment; only the run-varying metrics are marker-bounded. Inside the block, the start marker sits directly above the `---` rule, and a blank line after `<br />` lets the GitHub-flavored markdown table render inside `<details>`.

```text
> 💡 `@review-bot <comment>` — Ask the AI reviewer a question or request changes. Replies inside a review thread the bot already opened don't need the mention.

<!-- run-summary-start -->
---
<details>
<summary>Review run summary 🤖</summary>
<br />

| Metric | Value |
| --- | --- |
| Mode | review |
| Model time | 34.0s |
| Tool round-trips | 10 |
| Assistant turns | 3 |
| Tokens in / out | 157825 / 36705 |
| Cache read / write | 157000 / 800 |
| Cost (USD) | $0.35 |

</details>
<!-- run-summary-end -->
```

**Tokens in** is the total input the model consumed — fresh input plus cache reads plus cache creation — so it stays plausible under heavy prompt caching (reading only the uncached `input_tokens` reports a misleading near-zero residual). **Cache read / write** is the breakdown of that total.

**The footer is machine-consumed.** The scheduled [`code-review-cost-monitor`](../.github/actions/code-review-cost-monitor/README.md) action parses these tables back out of recent PR reviews to detect cost regressions, so the markers and the exact row labels above are a compatibility contract — renaming a label or restructuring the table breaks the monitor's parser (it fails loudly when a scan parses zero footers). The monitor's optional attribution step also reuses `runClaude.ts` as its model engine.

## Clean approvals

The pr:review skill returns an empty `reviewComment` for an approval with no findings — by contract no review prose is written, the APPROVE event speaks for itself. Posting a comment that is _only_ the stats footer reads as an empty (or broken) review and is indistinguishable from a genuine content-free-approval failure, so `submitReview.ts` builds the body through `buildReviewBody`: when the review body is empty and there are no inline comments, it substitutes a minimal `✅ No issues found.` line before appending the footer. Reviews that carry findings are unchanged. The dedup and consecutive-approval guards still compare the raw (empty) `reviewComment`, so repeat clean approvals are skipped rather than re-posted.

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

| File                          | Responsibility                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/runClaude.ts`            | Runs a single Agent-SDK pass (review, react, or `preflight` via `CLAUDE_RUN_MODE`); computes the summary; emits `run_summary` |
| `src/runSummaryFooter.ts`     | `runSummarySchema`, `parseRunSummary`, `renderRunSummaryFooter`, `stripRunSummaryFooter`, `buildReviewBody`                   |
| `src/submitReview.ts`         | Builds the review body via `buildReviewBody` (clean-approval line + footer); strips the footer for dedup                      |
| `src/preflightChecks.ts`      | Polls checks; on failure emits the failed checks + explain prompt; posts only the timeout comment inline                      |
| `src/skipComment.ts`          | Skip-path helpers: fetch annotations, build the explain prompt, allowlist + sanitize reasons, render the comment, post/dedup  |
| `src/preflightSkipComment.ts` | Post step: assembles the failed-checks comment from the explain step's reasons + run summary and posts it (fail-open)         |
| `actions-core/checkStatus.ts` | `fetchCheckStatuses` carries each failed check's `{ name, url, checkRunId }` so the skip comment links logs                   |
| `action.yml`                  | Wires `run_summary` into Submit Review; runs the `explain` (`runClaude`) + `post` skip steps with the `model` input           |
