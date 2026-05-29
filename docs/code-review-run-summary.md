# Review run-summary footer

`code-review-action` instruments every review run with per-run metrics — model/fan-out latency, token usage, cache hits, cost, tool round-trips, and (when the parallel fan-out runs) agent counts and speedup. These numbers were invaluable while optimizing the action, but they used to live only in the Actions run logs.

The run-summary footer surfaces them directly under each review: a collapsed `<details>` block appended to the **main review comment only** — never on inline comments, never on `react`-mode replies — so reviewers can spot a slow or expensive run at a glance without digging through workflow logs.

## Data flow

The metrics are computed in one process (`runClaude.ts`) and rendered in another (`submitReview.ts`). They cross the boundary as a GitHub Action **step output** — the same mechanism `structured_output` and `execution_file` already use.

```
  PROCESS 1: runClaude.ts (action.yml step id: review)
┌──────────────────────────────────────────────────────────────────┐
│  runReviewFanout() ──①──▶ buildFanoutStats()                       │
│        │                  {agentCount, failedCount,               │
│        │                   parallelSpeedup}                       │
│        ▼                          │                               │
│  buildRunSummary() ──────────┐    │  (core metrics, unchanged)    │
│        │  {model_ms,         │    │                               │
│        │   fanout_ms,        ▼    ▼                               │
│        │   tokens, cost,  ┌──────────────┐    ┌────────────────┐  │
│        │   round_trips}   │ withFanout-  │─②▶│ setOutput(      │  │
│        └─────────────────▶│ Stats(merge) │   │  "run_summary") │  │
│         log.info("Run     └──────┬───────┘    └────────────────┘  │
│         summary.") ◀─────────────┘  (kept — Actions-log signal)   │
└──────────────────────────────────────────────────────────────────┘
                                         │ ③ $GITHUB_OUTPUT (heredoc)
                                         ▼
                          ┌──────────────────────────────┐
                          │  action.yml: Submit Review    │
                          │  env RUN_SUMMARY:             │
                          │  ${{steps.review.outputs      │
                          │       .run_summary}}          │
                          └──────────────┬───────────────┘
                                         │ ④
                                         ▼
  PROCESS 2: submitReview.ts
┌──────────────────────────────────────────────────────────────────┐
│  parseRunSummary(RUN_SUMMARY)  ──⑤──▶ safeParse fail-open (skip)   │
│        │ ok                                                        │
│        ▼                                                           │
│  renderRunSummaryFooter(summary)                                  │
│        │  "---" + <details> table, wrapped in                     │
│        │  <!-- run-summary-start … end --> markers                │
│        ▼                                                           │
│  finalBody = reviewComment + invalidComments + footer            │
│        │                                                          │
│        ├──⑥──▶ dedupKey = normalizeBody(stripRunSummaryFooter(·)) │
│        │        applied to BOTH bodies before comparison          │
│        ▼                                                          │
│  octokit.createReview({ body: finalBody })  ──⑦──▶ MAIN comment   │
│                                  (never inline, never react)      │
└──────────────────────────────────────────────────────────────────┘
```

**Flow legend:**

- ① `buildFanoutStats` derives the fan-out counters — including the top-3 `agentDurations` (slowest sub-agents) — that `runReviewFanout` returns alongside its results (`max_agent_ms` stays in the completion log).
- ② `withFanoutStats` merges the optional fan-out counters — counts, speedup, and the snake_case `agent_durations` list — into the core summary. `buildRunSummary` itself is unchanged.
- ③ `setOutput` writes `run_summary` to `$GITHUB_OUTPUT` using a per-call heredoc delimiter, so the JSON value is safe. It is emitted **before** `emitOutputs`, which may `process.exit(1)` on a non-success result.
- ④ `action.yml` bridges the step output into the submit process as the `RUN_SUMMARY` env var. The `react`-mode reaction step is intentionally **not** wired — the footer is review-only.
- ⑤ `parseRunSummary` validates the untrusted env with a strict Zod schema (no coercion); an empty or invalid value yields no footer and the review posts unchanged.
- ⑥ The footer carries run-varying numbers, so it is stripped from both the new body and the previously-posted body before the duplicate-suppression guard compares them — otherwise the cost/latency deltas would defeat dedup. `normalizeBody` stays generic.
- ⑦ The footer lands only on the main review comment via `createReview`; inline comments and `reactToComment.ts` replies are untouched.

## Rendered footer

`renderRunSummaryFooter` mirrors the "under the cut" pattern from `updatePrFooter.ts` — the start marker sits directly above the `---` rule, and a blank line after `<br />` lets the GitHub-flavored markdown table render inside `<details>`. Fan-out rows (Agents / Failed agents / Parallel speedup) appear only when the parallel fan-out ran.

```text
<!-- run-summary-start -->
---
<details>
<summary>Review run summary 🤖</summary>
<br />

| Metric | Value |
| --- | --- |
| Mode | review |
| Model time | 34.0s |
| Fan-out time | 1.2s |
| Tool round-trips | 10 |
| Assistant turns | 3 |
| Tokens in / out | 500 / 100 |
| Cache read / write | 400 / 20 |
| Cost (USD) | $0.35 |
| Agents | 12 |
| Failed agents | 1 |
| Parallel speedup | 8.5× |
| Slowest agents | common-sense 158.0s · surface-testing 127.0s · testing 97.0s |

</details>
<!-- run-summary-end -->
```

The **Slowest agents** row lists the top 3 sub-agents by wall time (descending), so the long pole gating `fanout_ms` is always visible without digging through the Actions logs. It is derived in `buildFanoutStats` from each `SubagentResult.duration_ms` and appears only when the parallel fan-out ran.

## Source map

| File                      | Responsibility                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `src/runClaude.ts`        | Computes the summary, merges fan-out stats, emits the `run_summary` output               |
| `src/reviewFanout.ts`     | `buildFanoutStats` + returns stats from `runReviewFanout`                                |
| `src/runSummaryFooter.ts` | `runSummarySchema`, `parseRunSummary`, `renderRunSummaryFooter`, `stripRunSummaryFooter` |
| `src/submitReview.ts`     | Appends the footer to the main review body; strips it for dedup                          |
| `action.yml`              | Bridges `run_summary` into the Submit Review step as `RUN_SUMMARY`                       |
