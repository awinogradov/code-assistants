# The `linear:run` skill

> Chapter 17 of the [repository docs](../README.md#repository-docs).

How `/autopilot:linear-run` delivers any Linear ticket: executing a valid stored plan verbatim when one exists, or drafting a fresh plan autonomously when it does not.

> Source of truth: `claude-plugins/autopilot/skills/linear:run/SKILL.md` (the skill), `…/skills/linear:plan/SKILL.md` (the plan it consumes), and `…/skills/run/SKILL.md` (the phases it delegates to).

## The pattern this exists for

[`linear:plan`](./16-linear-plan-skill.md) leaves a scored, durable plan on a ticket. When that artifact exists and validates, `linear:run` preserves the handoff by executing it exactly. But delegation is broader than that handoff: a Linear ticket may reach the implementation agent directly, without a planning session ever having run.

The skill therefore has two deterministic modes. A valid stored artifact selects strict execution. Missing, older, malformed, or unverifiable stored-plan data selects a fresh autonomous planning pipeline. Plan provenance changes how the ticket is executed, never whether the ticket is accepted.

## Why a separate skill, not a flag on `run`

The Linear-specific entry point owns a decision that ordinary `run` does not need: whether a checkable durable plan is present.

**An artifact can be checked; a claim cannot.** A description carrying a parseable `## Implementation plan` anchor and a readable `Format:` version either validates or it does not. The strict path is selected only by that evidence. The fallback is equally explicit: it reports why the artifact cannot be executed, treats the ticket as task context, and drafts a fresh harness plan without invoking `linear:plan` or rewriting the description.

For how this pair sits beside the other on-ramps, see the comparison in [the `run-primed` chapter](./15-run-primed-skill.md#when-to-use-which); this chapter does not restate it.

## At a glance

```text
              ┌────────────────────────┐
              │ /autopilot:linear-run  │
              └───────────┬────────────┘
                          │ ①
                          ▼
              ┌────────────────────────┐
              │ Inspect stored plan    │
              └───────────┬────────────┘
                          │
                ┌─────────┴─────────┐
                │ ②                 │ ③
                ▼                   ▼
      ┌───────────────────┐ ┌───────────────────┐
      │ Valid artifact    │ │ Missing/unusable  │
      │ preserve verbatim │ │ fresh plan mode   │
      └─────────┬─────────┘ └─────────┬─────────┘
                │                     │
                │ ④                   │ ⑤
                ▼                     ▼
      ┌───────────────────┐ ┌───────────────────┐
      │ Merge with fresh  │ │ Draft + review +  │
      │ repository context│ │ finalize from issue│
      └─────────┬─────────┘ └─────────┬─────────┘
                └──────────┬──────────┘
                           │ ⑥
                           ▼
               ┌────────────────────────┐
               │ Implement + PR + watch │
               └────────────────────────┘
```

**Flow Legend:**

- ① A Linear issue is the only admission requirement.
- ② A current, complete, verifiable stored plan selects strict execution.
- ③ Every other verdict selects fresh planning and emits a diagnostic rather than a rejection.
- ④ The valid artifact supplies the work; a fresh Context Map supplies repository state.
- ⑤ The shared draft, expert-review, and finalize pipeline produces a run-local plan without changing Linear.
- ⑥ Both modes use the same branch, implementation, commit, pull-request, and monitoring chain with no approval gate.

## The validation contract

The same five verdicts remain, but they select a mode rather than deciding admission.

| Verdict              | Test                                                                        | Mode        |
| -------------------- | --------------------------------------------------------------------------- | ----------- |
| **missing**          | no `## Implementation plan` line in the description                         | fresh plan  |
| **version-mismatch** | `Format:` absent, or a version this skill does not read                     | fresh plan  |
| **malformed**        | a required `###` section is absent                                          | fresh plan  |
| **unverifiable**     | a numbered step carries no `verify:` line                                   | fresh plan  |
| **valid**            | anchor, readable `Format:`, every required section, `verify:` on every step | stored plan |

**The order is load-bearing.** Anchor and format version are checked _before_ the sections. A plan stored under an older template is, by definition, missing sections this skill expects — so a subsection check reached first would report a perfectly good older plan as `malformed`, tell the user their ticket is corrupt, and invite them to throw away valid stored work. `Format:` exists precisely to keep those two cases apart, and checking it first is what makes it useful.

`unverifiable` exists because the plan's `verify:` lines are what "execute strictly" means. A step with no observable check cannot be confirmed done, so the artifact is not safe for the verbatim path.

Every fresh-plan verdict is reported before the run continues. **The skill never invokes `linear:plan` and never overwrites the issue description.** The new plan is a run-local harness artifact, so an unusable stored plan stays visible while no longer blocking implementation.

## Drift is reported, not enforced

In stored-plan mode, the artifact records the tree it was drafted against in `Base:`. This skill compares that against the checkout's `origin/main`, reports any difference, and **proceeds**. Fresh-plan mode drafts against current context and needs no stored-artifact drift report.

That is a deliberate asymmetry with [`run-primed`](./15-run-primed-skill.md#the-validation-contract), which treats a stale base as a rejecting verdict. The two artifacts fail differently. A context brief describes what the repository _is_, so a stale one is actively misleading — it would have the consumer reason about code that changed. A stored plan describes what to _do_; drift makes it possibly-outdated, not wrong. And this skill's one promise is to follow the plan without changes, so a blocking staleness check would contradict the contract it is built on. Judging whether the drift matters is the reader's call, and the report is what makes that call possible.

Two reports make that call possible, because a SHA alone cannot:

| Report         | Question it answers                                                      |
| -------------- | ------------------------------------------------------------------------ |
| Revision drift | has the tree moved since the plan was drafted?                           |
| Path drift     | did it move underneath _this_ plan — are the files it names still there? |

Revision drift tells you the repository changed; it says nothing about whether the change touched anything this plan cares about. Path drift answers that directly, by checking every path in the stored `### Files` list against the checkout. Entries the plan marked `(new)` are skipped — the plan template uses that suffix for files it intends to create, so they are absent by design.

This repository has already moved paths in ways that would matter: documentation chapters are positioned by number and have been renumbered wholesale, and skill prose was relocated into `references/` subdirectories. Without the check, a plan stored before either change fails partway through execution, on a step that reads as broken rather than as outdated. With it, the reader sees the specific paths that vanished before the first edit — and when nothing has moved, the report says so, because silence would be indistinguishable from the check not running.

## Where context comes from

Both modes use a fresh Context Map. Their plan source differs:

| Mode        | Plan source                                                        | Repository source |
| ----------- | ------------------------------------------------------------------ | ----------------- |
| Stored plan | `### Summary`, `### Implementation Steps`, and `### Files`         | Context Map       |
| Fresh plan  | Shared draft, review, and finalize pipeline using the Linear issue | Context Map       |

Stored `### Pre-Implementation` and `### Post-Implementation` sections are read past deliberately. They describe a branch and a post-implementation chain, and this skill supplies both from `run` — the branch because it has to be created in _this_ checkout, and the chain because `run` owns it. Replaying a stored branch step would mean acting on a tree that may no longer exist.

**Nothing in the fan-out is gated off**, which is the other place this pair diverges from the explore pair. `run-primed` skips the standards digest because a validated brief already carries it. A stored plan carries no such thing: it records decisions, not architecture. So the standards digest, branch diff, TODO search, and a freshly attached snapshot all still run. A recorded snapshot id would be useless anyway — it is session-scoped and dead in any later session.

## Executing the selected plan

In stored-plan mode, the `### Implementation Steps` are worked in order, each verified against its own `verify:` line before the next begins. No re-drafting, no re-ordering, no merging, no added steps, and no second expert review — the producer's scored pipeline already finalized the stored artifact.

Where a step cannot be carried out as written, the skill stops and reports which step and why. It does not silently substitute a different plan: a plan that no longer fits its repository is information the reader needs, not an obstacle to route around. The stored `### Files` list is the expected blast radius, so touching a file it does not name is reported for the same reason.

In fresh-plan mode, the shared planning pipeline produces and scores a harness plan before implementation. That pipeline is the same one `run` uses — the review enhances the plan and the recorded score gates nothing. It adds no approval pause and never writes the fresh plan back to the Linear issue.

## How this is guarded

`linearPlanContract.test.ts` relates this skill to its producer — see [the guard section in chapter 16](./16-linear-plan-skill.md#how-this-is-guarded) for what it asserts. The parts that constrain this side: every verdict must be named and mapped to a mode, fresh-plan verdicts must continue without invoking `linear:plan` or writing Linear, the consumed stored sections must match the producer's required set exactly, and caller-owned sections must remain unused.

**What no test can show:** that the gate runs, or that the model honours it. CI sees text in a file. Nothing under `.github/workflows/` runs `bun test`, so the guard gates locally and in review; and because this repository configures no `linear` tracker, neither skill can execute here at all. Runtime evidence comes from a dry run recorded on the pull request.

## Where to look in the code

| File                                                                | Role                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `claude-plugins/autopilot/skills/linear:run/SKILL.md`               | The skill: inspect, select plan source, and deliver        |
| `claude-plugins/autopilot/skills/linear:plan/SKILL.md`              | Writes the stored plan and owns its format                 |
| `claude-plugins/autopilot/skills/run/SKILL.md`                      | The phases this skill references for everything downstream |
| `claude-plugins/autopilot/skills/gather-context/SKILL.md`           | The fan-out, run in full here                              |
| `.github/actions/code-review-action/src/linearPlanContract.test.ts` | The producer/consumer guard                                |
