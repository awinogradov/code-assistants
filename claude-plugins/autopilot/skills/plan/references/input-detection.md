# Input detection and the create-issue flags

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md). Both skills detect input identically; this file is the single source so the two cannot drift.

Detection is pure string matching — it performs **no I/O**. That is why the issue id is known before anything is fetched, and why [`gather-context`](../../gather-context/SKILL.md) can launch every context call in one fan-out.

## Mode flags

Parse and strip `--experts-review` from the arguments before anything else, including the create-issue pre-step below. Its presence enables the expert review step for this invocation; when it is absent, [the pipeline](pipeline.md#review-and-score-task-4) skips that step. The flag is a mode toggle, not input: once stripped it never reaches the detection table, and it files nothing.

`plan` and [`linear-plan`](../../linear-plan/SKILL.md) are the only skills that parse this flag. The `run` family — `run`, `run-primed`, and `linear-run` — never does: its review is always-on by design; see the conditionality rule in [pipeline.md](pipeline.md#review-and-score-task-4).

## Create-issue flags (`plan` only)

Run this pre-step **before** the detection table. It lets a free-form description file a tracked issue first, then plan against it — so the branch becomes `issue-<N>-slug` and the PR can `Closes` the issue, instead of the untracked plain-description path. When neither flag is present, skip this section entirely.

`run` never runs this step: `--issue` / `--linear-issue` are plan-exclusive by design.

1. **Parse and strip** `--issue` or `--linear-issue` from the arguments. The remaining text is the issue description hint.

2. **Guards — evaluate before creating anything** (a rejected combination must never leave a filed issue behind):
   - Both flags present ⇒ stop with: `Pass only one of --issue or --linear-issue.`
   - `--linear-issue` with no `linear` tracker in `agents.trackers` ⇒ stop with: `--linear-issue requires a linear tracker in package.json agents.trackers. Use --issue for a GitHub issue.`
   - `--issue` with no `github` tracker configured — present by default when `agents.trackers` is absent, missing only in a linear-only config ⇒ stop with: `--issue requires a github tracker. Use --linear-issue instead.`

3. **File the issue** by invoking the matching create skill with the flag-stripped description as its title hint: `--issue` ⇒ `Skill(autopilot:issue-create)`, `--linear-issue` ⇒ `Skill(autopilot:linear-create)`. The create skill runs its full flow including its own confirmation prompt — that prompt is the human gate for issue creation. An empty description simply makes the create skill prompt for a hint.

4. **Cancellation** — if the create skill did not emit its success line (the user chose "Cancel", or it stopped on one of its own guards), stop: there is no issue to plan against.

5. **Capture the identifier** from the create skill's exact final output line (these strings mirror [issue-create](../../issue-create/SKILL.md) and [linear-create](../../linear-create/SKILL.md) — if either is reworded, update this capture):
   - `issue-create` prints `✓ Created issue: <url>`. The number is the last path segment (e.g. `.../issues/445` ⇒ `445`). Input type `github-issue`, id `#<N>`.
   - `linear-create` prints `✓ Created Linear issue: <identifier> — <url>`. Take `<identifier>`. Input type `linear-issue`, id `<KEY-N>`, team = the matched `linear` tracker's `team`.

6. **Continue with the captured identifier.** Pin the type and id and do **not** run the detection table — the flag already determined the type. The subsequent `resolve-issue-context` fetch is the positive verification of the captured id: if it returns unresolved, surface the error and stop, never proceed against a fabricated id.

## Detection table

Match **top-to-bottom and stop at the first hit**. The order is load-bearing: a code-scanning alert URL contains `github.com`, so the alert row MUST precede the `github.com` issue-URL row or the alert misroutes to `gh issue view` and fetches an unrelated issue.

| Pattern                                                                | Type                |
| ---------------------------------------------------------------------- | ------------------- |
| `…/security/code-scanning/{n}` URL, or `alert#{n}` / `alert {n}` token | Code-scanning alert |
| Contains `linear.app`                                                  | Linear issue URL    |
| Uppercase key + `-` + number (`ENG-123`), matching `^[A-Z]+-[0-9]+$`   | Linear issue        |
| Number only (`123`)                                                    | GitHub issue        |
| `#` + number (`#123`)                                                  | GitHub issue        |
| Contains `github.com`                                                  | GitHub issue URL    |
| Anything else                                                          | Plain description   |

A **bare number stays a GitHub issue** — alerts require the alert URL or the explicit `alert#{n}` / `alert {n}` token, so there is no collision with the issue-number rows.

## Tracker gating

The rows are gated on the project's configured trackers — `agents.trackers` in `package.json`, an array of `{ type, ... }` entries (absent ⇒ a single `github` tracker).

**Linear rows fire only when at least one `linear` tracker is configured.** The id is the uppercase `KEY-N` form, and its `KEY` must match the **union of every** `linear` tracker's effective keys (each entry's `keys`, defaulting to `[team]`). Several teams may coexist — `FRTNS-3` routes to the `FRTNS` tracker and `ENG-12` to `ENG` — and the matched entry supplies the `team` passed to `resolve-issue-context`.

**GitHub rows fire when a `github` tracker is configured** (the default).

A project may configure both — e.g. `linear` for internal issues and `github` for external user feedback — and each argument routes by shape. A Linear-shaped argument with no matching `linear` tracker matches none of the GitHub numeric rows and falls through to **Plain description**, so existing GitHub repos are unaffected.

## Alert inputs key everything downstream

A `code-scanning-alert` is not an issue, so it diverges after resolution:

- **Branch** — `security-<slug>` paraphrasing the rule or file (e.g. `security-tainted-format-string`), never `issue-<n>-…`.
- **PR** — a `SECURITY:` title; the body records the alert reference (`htmlUrl`) and emits **no** `Closes #`. Alerts close on re-scan, not via PR magic words.
- **Verify** — the plan's post-implementation step polls `gh api repos/{owner}/{repo}/code-scanning/alerts/{n} --jq .state`, expecting `fixed` after merge and the next CodeQL scan.

There is no TODO search and no assignee for alert inputs.
