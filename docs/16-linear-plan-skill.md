# The `linear-plan` skill

> Chapter 16 of the [repository docs](../README.md#repository-docs).

How `/autopilot:linear-plan` turns a plan from a session artifact into something durable on its Linear ticket — expert-reviewed when `--experts-review` is passed, and stored unconditionally.

> Source of truth: `claude-plugins/autopilot/skills/linear-plan/SKILL.md` (the skill), `…/skills/plan/references/pipeline.md` (the shared review pipeline it executes), and `…/skills/linear-create/SKILL.md` (the description this one rewrites).

## The pattern this exists for

Every existing on-ramp writes its plan to the harness plan-mode file, which is scoped to the session. That is fine while the person planning is the person implementing, in one sitting. It fails the moment either half of that stops being true:

- A teammate wants to read the approach before any code exists.
- The plan is picked up next week, by which point the session is gone.
- The plan is executed by an orchestrator that did not draft it.

In all three the plan has to live somewhere a second reader can reach, and the ticket is the obvious place: it is already the thing tracking the work. This skill puts it there. [`linear-run`](./17-linear-run-skill.md) is the other half — the reader that executes what this one stored.

## What it does and does not do

`linear-plan` is `plan` plus a durable write, minus the implementation:

| Phase                      | Behaviour                                |
| -------------------------- | ---------------------------------------- |
| Input detection, gathering | `plan`, unchanged                        |
| Draft, review, score       | `plan`, unchanged — the shared pipeline  |
| Store on the ticket        | **new**                                  |
| Implement, commit, PR      | **removed** — that is `linear-run`'s job |

Stopping after the store is the deliberate part. If this skill also implemented, the reader would never be needed in the same session, and the plan-on-a-ticket would be a side effect rather than the deliverable. Composed the other way round, `linear-plan` then `linear-run` gives you a durable handoff between independently triggered sessions.

For how this pair sits beside the other on-ramps, see the comparison in [the `run-primed` chapter](./15-run-primed-skill.md#when-to-use-which); this chapter does not restate it.

## The gate runs first

Three conditions stop the run, and all three are checked **before** the context fan-out:

| Condition                                | Why it stops                                                   |
| ---------------------------------------- | -------------------------------------------------------------- |
| No `linear` tracker in `agents.trackers` | there is no ticket to store a plan on                          |
| The input is not a Linear issue          | a description, GitHub issue, or alert has no ticket either     |
| No Linear MCP tool resolves              | the write path is unavailable, so the plan could not be stored |

Ordering matters for cost, not correctness. An expert review pass is the most expensive thing autopilot does; discovering afterwards that the plan has nowhere to go wastes all of it. Each message names `/autopilot:plan` as the alternative and the producer never falls through to it automatically. [`linear-run`](./17-linear-run-skill.md) has a different responsibility on the read side: an unusable stored artifact selects its fresh-plan path instead of blocking issue execution.

No preflight check runs, and none is needed: this skill creates no branch and no commit, so there is no git state to protect. What the tree looked like is recorded in the stored plan instead.

## The stored plan format

The plan's own sections, demoted one level under a single anchor. The trailing markers make the format machine-readable, so the guard parses it out of the skill rather than from a copy — the same convention [`explore`](./14-explore-skill.md) uses for its context brief:

```text
## Implementation plan

Format: v1 · Score: <panel verdicts> · Base: <origin/main SHA> · Stored by /autopilot:linear-plan

### Summary              <- required
### Implementation Steps <- required
### Files                <- required
### Pre-Implementation   <- caller-owned
### Post-Implementation  <- caller-owned
```

Section names are the plan file's own, demoted from `##` to `###`, so mapping a stored section back to the plan it came from needs no translation table.

All five are written, because a human reading the ticket should see the whole plan. The two marked caller-owned are written but not for the reader to consume: a branch step and a post-implementation chain have to be produced in the checkout doing the work, not replayed from a description. Marking them is what lets the guard prove the reader ignores them.

The three metadata fields each earn their place:

- **`Format: v1`** is what keeps "stored under an older template" separable from "corrupt". Without it, the first template revision would make every previously stored plan indistinguishable from a mangled description, and the reader would tell users to discard valid stored work.
- **`Score:`** records what the plan actually achieved, so a later reader can weigh it.
- **`Base:`** records the tree the plan was drafted against. It is information, not a gate — see [why drift does not block](./17-linear-run-skill.md#drift-is-reported-not-enforced).

The annotated list above is the contract; what the store actually writes is a literal **emission template** the skill carries beside it — the exact stored block with `<angle-bracket>` placeholders for the score (or the literal `skipped`), the base SHA, and each section body. Only placeholders are filled; every other byte — anchor, header line, headings, order, blank-line layout — is emitted verbatim, and the `<- required` / `<- caller-owned` annotations never reach a ticket. That removes the failure mode where each store re-derives the markdown from prose and submits a structurally different description that the reader then rejects as unusable. The first-store `+++ Original task +++` cut is a literal emission form too — the same collapsible shape as `linear-create`'s original-prompt preamble, with the prior description inserted byte-identical and treated as opaque rather than rewritten into the canonical forms below.

### Linear-safe markdown

Linear's editor accepts most Markdown on input ([editor reference](https://linear.app/docs/editor)) but normalizes several author forms on save — the fence rewrite below, `_italic_` to `*italic*`, `-` bullets to `*`. The skill therefore constrains section bodies to the canonical forms: `###`/`####` headings, `*` bullets and `1.` lists, `**bold**`/`*italic*`, inline code and `text`-tagged fences, plain URLs and `[text](url)` links, and the `+++ … +++` fence as the only collapsible. HTML (including `<details>`) and checkbox lists are never emitted. Writing the canonical forms directly is what keeps a re-store's read-back comparable to what was written.

## How the write works

```text
        ┌──────────────────────────────────┐
        │  get_issue → current description │
        └────────────────┬─────────────────┘
                         │ ①
                         ▼
              ┌─────────────────────┐
              │  ## Implementation  │
              │  plan  anchor?      │
              └──────┬───────┬──────┘
                  ② │       │ ③
                     ▼       ▼
     ┌───────────────────┐ ┌──────────────────────┐
     │  Replace anchor   │ │  Wrap prior body in  │
     │  to end of body   │ │  +++ Original task   │
     │  prefix untouched │ │  then append plan    │
     └─────────┬─────────┘ └──────────┬───────────┘
               │                      │
               └──────────┬───────────┘
                          │ ④
                          ▼
              ┏━━━━━━━━━━━━━━━━━━━━━━━┓
              ┃  Prefix byte-identical ┃
              ┃  to what was read?     ┃
              ┗━━━━━━━━━┳━━━━━━━━━━━━━━┛
                        │ ⑤
                        ▼
              ┌───────────────────────┐
              │  save_issue           │
              └───────────┬───────────┘
                          │ ⑥
                          ▼
              ┌───────────────────────┐
              │  state → "AI Ready"   │
              └───────────────────────┘
```

**Flow Legend:**

- ① One read before the write, so the rewrite is anchored to what is actually there rather than to an assumption. The same read captures the current title for the refresh check at the write step.
- ② Anchor present — a re-store. Replace from the anchor to the end; never re-emit the text above it.
- ③ No anchor — a first store. The prior description moves into a `+++ Original task +++` collapsible. An **empty** description skips the wrapper entirely rather than storing an empty collapsible.
- ④ Abort rather than write if the preserved prefix changed. Silently reformatting somebody's ticket body is the one unrecoverable failure here.
- ⑤ On any rejected or failed write, the plan is emitted to the transcript so the work is recoverable by hand.
- ⑥ After a successful write, the issue moves to the "AI Ready" state — resolved via `list_issue_statuses`, written with `save_issue`, best-effort: a team without that state or a failed state write is reported as `issue not moved — <reason>` and never fails the store.

The `save_issue` write may also carry a refreshed **title**: when the plan's Steelmanned Intent yields a materially clearer business title than the one read at ① — a ticket filed from a rough one-line prompt is the typical case — it is written in the same call as the description, never as a second write, under the same title rules [`linear-create`](../claude-plugins/autopilot/skills/linear-create/SKILL.md) applies at creation time. An already-accurate title is left untouched, which keeps re-stores idempotent, and the outcome (`✓ Title updated: …` or `title unchanged`) reaches the skill's final output the same way the state transition does.

Anchoring on `## Implementation plan` rather than on the collapsible is what makes a re-store idempotent: the wrapper is created once and never stacked, because the second store matches the anchor and never reaches the wrapping branch.

Linear renders `+++ Section title` … `+++` as an initially-hidden section, and `<details>` HTML does not render at all, so the fence is the only option. A description written by [`linear-create`](../claude-plugins/autopilot/skills/linear-create/SKILL.md) already opens with its own `+++ Original prompt +++` fence, so wrapping nests one inside the other.

**All three store cases were observed rather than assumed.** Linear's [GraphQL markdown documentation](https://linear.app/developers/graphql) describes the fence without saying whether it nests, so the behaviour was exercised against a real ticket:

| Case                           | Observed                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First store, nested fence      | The outer section renders collapsed as `▶ Original task`; expanding it reveals a nested, independently collapsible `▶ Original prompt` beside the rest of the original body, with `## Implementation plan` outside at top level |
| Re-store on the same ticket    | Exactly one `Original task` wrapper survives, the preserved prefix comes back byte-identical, and only the plan below the anchor is replaced                                                                                    |
| First store, empty description | The plan is written alone — no empty collapsible appears, because there was nothing to preserve                                                                                                                                 |

**Linear normalizes the fence on save, and that trips up anything that reads a description back.** Text written as `+++ Title … +++` is stored and returned by the API as `>>> Title … >>>`. Both forms are accepted on input; `>>>` is the canonical stored form. So a check that greps a fetched description for a literal `+++` finds nothing, even though the collapsible is there. The same round-trip rewrites other markdown too — `_italic_` becomes `*italic*`, `-` bullets become `*`.

That normalization is exactly why the store anchors on the `## Implementation plan` heading rather than on the wrapper. A re-store locates the anchor, which survives the round-trip unchanged, so it is unaffected by the fence being rewritten underneath it — and the "never stacks a second wrapper" property holds for the same reason.

## Storing is unconditional

The plan is stored automatically the moment the shared review pipeline finishes — no plan-mode transition, no separate human approval step, and no score check between finalize and the write. The review score is recorded on the ticket as information for the teammate who reads it, never used as a gate. Like [`plan`](./05-plan-run-skills.md#review-and-score), this skill takes the opt-in `--experts-review` flag: with it the stored ticket carries the panel's assessment; without it the stored header records the literal `Score: skipped`, so the reader can see the plan is unreviewed before deciding to run it.

## How this is guarded

`linear-plan` and `linear-run` are prompt files with no import between them, so a renamed stored section would break the reader with nothing failing in between. `linearPlanContract.test.ts` closes that gap the way [`primedBriefContract.test.ts`](./15-run-primed-skill.md#how-this-is-guarded) does for the explore pair: it extracts the section names and their markers from this skill's own template and asserts the reader consumes exactly the required subset and none of the caller-owned ones. It also pins the format version across both sides, asserts the reader maps every verdict to stored-plan or fresh-plan behavior, asserts the fallback never dispatches the producer or overwrites Linear, and asserts `pipeline.md` states no scoring threshold or revision budget — the review is an enhancement, and a re-introduced gate would silently start losing plans. The [emission template](#the-stored-plan-format) is pinned the same way: it must open with the anchor and placeholder header line, list every contract section in order, leak no `<-` annotation, and carry none of the author forms Linear normalizes away. The title refresh is pinned too — its Steelmanned-Intent source, its link to `linear-create`'s title rules, and both outcome literals reaching the final output block — so a rewording cannot silently drop it again.

**What no test can show:** that Linear renders the stored description the way this chapter says. That is settled by a dry run on a real ticket, recorded on the pull request, because no `linear` tracker is configured in this repository and neither skill can execute here. Nothing under `.github/workflows/` runs `bun test` either, so the guard gates locally and in review rather than in CI.

## Where to look in the code

| File                                                                           | Role                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `claude-plugins/autopilot/skills/linear-plan/SKILL.md`                         | The skill: gate, pipeline by reference, anchored store                |
| `claude-plugins/autopilot/skills/linear-run/SKILL.md`                          | The reader that consumes the stored format                            |
| `claude-plugins/autopilot/skills/plan/SKILL.md`                                | Input resolution and Common Instructions                              |
| `claude-plugins/autopilot/skills/plan/references/pipeline.md`                  | The shared draft-review-finalize pipeline it executes                 |
| `claude-plugins/autopilot/skills/shared-rules/references/linear-mcp-access.md` | How `get_issue`, `list_issue_statuses`, and `save_issue` are resolved |
| `.github/actions/code-review-action/src/linearPlanContract.test.ts`            | The producer/consumer guard                                           |
