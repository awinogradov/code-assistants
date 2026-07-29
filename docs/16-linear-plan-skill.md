# The `linear:plan` skill

> Chapter 16 of the [repository docs](../README.md#repository-docs).

How `/autopilot:linear-plan` turns a plan from a session artifact into something durable on its Linear ticket — and why it would rather store nothing than store a plan that has not earned it.

> Source of truth: `claude-plugins/autopilot/skills/linear:plan/SKILL.md` (the skill), `…/skills/plan/references/pipeline.md` (the scoring threshold and revision budget it inherits), and `…/skills/linear:create/SKILL.md` (the description this one rewrites).

## The pattern this exists for

Every existing on-ramp writes its plan to the harness plan-mode file, which is scoped to the session. That is fine while the person planning is the person implementing, in one sitting. It fails the moment either half of that stops being true:

- A teammate wants to read the approach before any code exists.
- The plan is picked up next week, by which point the session is gone.
- The plan is executed by an orchestrator that did not draft it.

In all three the plan has to live somewhere a second reader can reach, and the ticket is the obvious place: it is already the thing tracking the work. This skill puts it there. [`linear:run`](./17-linear-run-skill.md) is the other half — the reader that executes what this one stored.

## What it does and does not do

`linear:plan` is `plan` plus a durable write, minus the implementation:

| Phase                      | Behaviour                                |
| -------------------------- | ---------------------------------------- |
| Input detection, gathering | `plan`, unchanged                        |
| Draft, review, score       | `plan`, unchanged — the shared pipeline  |
| Approval gate              | `plan`, unchanged — `ExitPlanMode`       |
| Store on the ticket        | **new**                                  |
| Implement, commit, PR      | **removed** — that is `linear:run`'s job |

Stopping after the store is the deliberate part. If this skill also implemented, the reader would never be needed in the same session, and the plan-on-a-ticket would be a side effect rather than the deliverable. Composed the other way round, `linear:plan` then `linear:run` gives you the full flow with a reviewable pause in the middle — which is the whole point.

For how this pair sits beside the other on-ramps, see the comparison in [the `run-primed` chapter](./15-run-primed-skill.md#when-to-use-which); this chapter does not restate it.

## The gate runs first

Three conditions stop the run, and all three are checked **before** the context fan-out:

| Condition                                | Why it stops                                                   |
| ---------------------------------------- | -------------------------------------------------------------- |
| No `linear` tracker in `agents.trackers` | there is no ticket to store a plan on                          |
| The input is not a Linear issue          | a description, GitHub issue, or alert has no ticket either     |
| No Linear MCP tool resolves              | the write path is unavailable, so the plan could not be stored |

Ordering matters for cost, not correctness. A three-pass expert review at a 98 threshold is the most expensive thing autopilot does; discovering afterwards that the plan has nowhere to go wastes all of it. Each message names `/autopilot:plan` as the alternative and the skill never falls through to it automatically — the same refusal discipline [`linear:run`](./17-linear-run-skill.md) applies on the read side.

No preflight check runs, and none is needed: this skill creates no branch and no commit, so there is no git state to protect. What the tree looked like is recorded in the stored plan instead.

## The stored plan format

The plan's own sections, demoted one level under a single anchor. The trailing markers make the format machine-readable, so the guard parses it out of the skill rather than from a copy — the same convention [`explore`](./14-explore-skill.md) uses for its context brief:

```text
## Implementation plan

Format: v1 · Score: <N>/100 · Base: <origin/main SHA> · Stored by /autopilot:linear-plan

### Summary              <- required
### Implementation Steps <- required
### Files                <- required
### Pre-Implementation   <- caller-owned
### Post-Implementation  <- caller-owned
```

Section names are the plan file's own, demoted from `##` to `###`, so mapping a stored section back to the plan it came from needs no translation table.

All five are written, because a human reading the ticket should see the whole plan. The two marked caller-owned are written but not for the reader to consume: a branch step and a post-implementation chain have to be produced in the checkout doing the work, not replayed from a description. Marking them is what lets the guard prove the reader ignores them.

The three metadata fields each earn their place:

- **`Format: v1`** is what keeps "stored under an older template" separable from "corrupt". Without it, the first template revision would make every previously stored plan indistinguishable from a mangled description, and the reader would tell users to discard reviewed work.
- **`Score:`** records what the plan actually achieved, so a later reader can weigh it.
- **`Base:`** records the tree the plan was drafted against. It is information, not a gate — see [why drift does not block](./17-linear-run-skill.md#drift-is-reported-not-enforced).

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
              └───────────────────────┘
```

**Flow Legend:**

- ① One read before the write, so the rewrite is anchored to what is actually there rather than to an assumption.
- ② Anchor present — a re-store. Replace from the anchor to the end; never re-emit the text above it.
- ③ No anchor — a first store. The prior description moves into a `+++ Original task +++` collapsible. An **empty** description skips the wrapper entirely rather than storing an empty collapsible.
- ④ Abort rather than write if the preserved prefix changed. Silently reformatting somebody's ticket body is the one unrecoverable failure here.
- ⑤ On any rejected or failed write, the plan is emitted to the transcript so the work is recoverable by hand.

Anchoring on `## Implementation plan` rather than on the collapsible is what makes a re-store idempotent: the wrapper is created once and never stacked, because the second store matches the anchor and never reaches the wrapping branch.

Linear renders `+++ Section title` … `+++` as an initially-hidden section, and `<details>` HTML does not render at all, so the fence is the only option. A description written by [`linear:create`](../claude-plugins/autopilot/skills/linear:create/SKILL.md) already opens with its own `+++ Original prompt +++` fence, so wrapping nests one inside the other. That is accepted deliberately; Linear's [GraphQL markdown documentation](https://linear.app/developers/graphql) describes the fence without specifying nesting behaviour.

## The score gates the write, not the plan

The plan still goes through `plan`'s approval gate — a human reads it before anything is stored. The score gates something different: whether the approved plan becomes the ticket's instruction set.

Both are required, and neither substitutes for the other. A 98 nobody read is not a reviewed plan. An approved 96 is a plan whose weaknesses were never addressed. The shared pipeline's threshold and its three-pass revision budget are inherited from [`pipeline.md`](./05-plan-run-skills.md#review-and-score) rather than restated here, so tuning them stays a one-file change.

**Below the threshold, the plan is reported and emitted to the transcript — not discarded.** A skill whose premise is that plans are too valuable to lose must not quietly lose one at 97. It just declines to make it something a later session will execute unattended.

## How this is guarded

`linear:plan` and `linear:run` are prompt files with no import between them, so a renamed stored section would break the reader with nothing failing in between. `linearPlanContract.test.ts` closes that gap the way [`primedBriefContract.test.ts`](./15-run-primed-skill.md#how-this-is-guarded) does for the explore pair: it extracts the section names and their markers from this skill's own template and asserts the reader consumes exactly the required subset and none of the caller-owned ones. It also pins the format version across both sides, asserts the reader names every verdict with an actionable message, asserts the reader carries no dispatch that would let it silently re-plan, and reads the scoring threshold out of `pipeline.md` to assert one stated threshold governs every caller.

**What no test can show:** that Linear renders the stored description the way this chapter says. That is settled by a dry run on a real ticket, recorded on the pull request, because no `linear` tracker is configured in this repository and neither skill can execute here. Nothing under `.github/workflows/` runs `bun test` either, so the guard gates locally and in review rather than in CI.

## Where to look in the code

| File                                                                           | Role                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `claude-plugins/autopilot/skills/linear:plan/SKILL.md`                         | The skill: gate, pipeline by reference, anchored store       |
| `claude-plugins/autopilot/skills/linear:run/SKILL.md`                          | The reader that consumes the stored format                   |
| `claude-plugins/autopilot/skills/plan/SKILL.md`                                | Input resolution, Common Instructions, and the approval gate |
| `claude-plugins/autopilot/skills/plan/references/pipeline.md`                  | The threshold and revision budget this skill inherits        |
| `claude-plugins/autopilot/skills/shared-rules/references/linear-mcp-access.md` | How `get_issue` and `save_issue` are resolved                |
| `.github/actions/code-review-action/src/linearPlanContract.test.ts`            | The producer/consumer guard                                  |
