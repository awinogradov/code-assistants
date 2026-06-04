# Review run-summary footer

`code-review-action` instruments every review run with per-run metrics — model latency, token usage, cache hits, cost, and tool round-trips. These numbers were invaluable while optimizing the action, but they used to live only in the Actions run logs.

The run-summary footer surfaces them directly under each review: a collapsed `<details>` block appended to the **main review comment only** — never on inline comments, never on `react`-mode replies — so reviewers can spot a slow or expensive run at a glance without digging through workflow logs.

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

## Clean approvals

The pr:review skill returns an empty `reviewComment` for an approval with no findings — by contract no review prose is written, the APPROVE event speaks for itself. Posting a comment that is _only_ the stats footer reads as an empty (or broken) review and is indistinguishable from a genuine content-free-approval failure, so `submitReview.ts` builds the body through `buildReviewBody`: when the review body is empty and there are no inline comments, it substitutes a minimal `✅ No issues found.` line before appending the footer. Reviews that carry findings are unchanged. The dedup and consecutive-approval guards still compare the raw (empty) `reviewComment`, so repeat clean approvals are skipped rather than re-posted.

## Source map

| File                      | Responsibility                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/runClaude.ts`        | Runs the single review pass, computes the summary, emits the `run_summary` output                           |
| `src/runSummaryFooter.ts` | `runSummarySchema`, `parseRunSummary`, `renderRunSummaryFooter`, `stripRunSummaryFooter`, `buildReviewBody` |
| `src/submitReview.ts`     | Builds the review body via `buildReviewBody` (clean-approval line + footer); strips the footer for dedup    |
| `action.yml`              | Bridges `run_summary` into the Submit Review step as `RUN_SUMMARY`                                          |
