# The `linear:run` skill

> Chapter 17 of the [repository docs](../README.md#repository-docs).

How `/autopilot:linear-run` delivers a Linear ticket from the plan already stored on it — executing those steps as written, and refusing loudly rather than quietly writing a new plan.

> Source of truth: `claude-plugins/autopilot/skills/linear:run/SKILL.md` (the skill), `…/skills/linear:plan/SKILL.md` (the plan it consumes), and `…/skills/run/SKILL.md` (the phases it delegates to).

## The pattern this exists for

[`linear:plan`](./16-linear-plan-skill.md) leaves a scored, durable plan on a ticket. Something has to pick it up — in a later session, or by a different person, or by an orchestrator that never saw the planning conversation. That consumer needs exactly one property: it must do what the plan says, and say so when it cannot.

`run` cannot fill that role, because `run` drafts its own plan. Pointing it at a ticket with a stored plan would produce a _second_ plan that happens to be about the same work. The stored plan's whole value — a durable, scored instruction set that can be refined independently — would be silently discarded.

## Why a separate skill, not a flag on `run`

The same reason [`run-primed`](./15-run-primed-skill.md#why-a-separate-skill-not-a-flag-on-run) is separate, applied to a different artifact.

**An artifact can be checked; a claim cannot.** A description carrying a parseable `## Implementation plan` anchor and a `Format:` version either validates or it does not. A prompt asserting "the plan is ready" is unfalsifiable, and trusting it is how a run executes steps nobody wrote. Keeping the strict path behind its own door means interactive `run` stays deterministic, and an unusable stored plan is visible rather than papered over with a fresh draft.

For how this pair sits beside the other on-ramps, see the comparison in [the `run-primed` chapter](./15-run-primed-skill.md#when-to-use-which); this chapter does not restate it.

## At a glance

```text
              ┌────────────────────────┐
              │ /autopilot:linear-run  │
              └───────────┬────────────┘
                          │ ①
                          ▼
              ┌────────────────────────┐
              │  Phase 1               │
              │  Load + validate plan  │
              └───────────┬────────────┘
                          │
                ┌─────────┴─────────┐
                │ ②                 │ ③
                ▼                   ▼
      ┏━━━━━━━━━━━━━━━━━━┓ ┌───────────────────┐
      ┃  Stop            ┃ │  Phase 2          │
      ┃  missing         ┃ │  gather-context   │
      ┃  version-mismatch┃ │  full fan-out     │
      ┃  malformed       ┃ └─────────┬─────────┘
      ┃  unverifiable    ┃           │ ④
      ┗━━━━━━━━━━━━━━━━━━┛           ▼
                            ┌───────────────────┐
                            │  Phase 3          │
                            │  Merge context    │
                            └─────────┬─────────┘
                                      │ ⑤
                                      ▼
                            ┌───────────────────┐
                            │  Phases 4–6       │
                            │  = run, unchanged │
                            └───────────────────┘
```

**Flow Legend:**

- ① A Linear issue only. A description, GitHub issue, or alert has no stored plan, so those route to `run`.
- ② Four rejections, each naming `/autopilot:linear-plan` as the fix. The skill never invokes it automatically.
- ③ One issue fetch happens here, ahead of the fan-out, so a ticket with no plan fails before the expensive pass is paid for.
- ④ The full fan-out runs — unlike `run-primed`, nothing is gated off. A stored plan is not a repository brief.
- ⑤ Branch, implement, commit, PR, monitor — no plan-approval gate, exactly as `run`.

## The validation contract

Four verdicts reject; the fifth proceeds.

| Verdict              | Test                                                                        | What it means                                       |
| -------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| **missing**          | no `## Implementation plan` line in the description                         | nobody has stored a plan on this ticket             |
| **version-mismatch** | `Format:` absent, or a version this skill does not read                     | the plan is real but written under another template |
| **malformed**        | a required `###` section is absent                                          | the plan is corrupt or was hand-edited badly        |
| **unverifiable**     | a numbered step carries no `verify:` line                                   | the plan cannot be executed strictly                |
| **valid**            | anchor, readable `Format:`, every required section, `verify:` on every step | proceed                                             |

**The order is load-bearing.** Anchor and format version are checked _before_ the sections. A plan stored under an older template is, by definition, missing sections this skill expects — so a subsection check reached first would report a perfectly good older plan as `malformed`, tell the user their ticket is corrupt, and invite them to throw away valid stored work. `Format:` exists precisely to keep those two cases apart, and checking it first is what makes it useful.

`unverifiable` exists because the plan's `verify:` lines are what "execute strictly" means. A step with no observable check cannot be confirmed done, so a plan missing one is not executable as written — better to say so than to guess at completion.

Each message names `/autopilot:linear-plan` as the fix. **It is never invoked automatically.** An automatic re-plan would replace the stored artifact with a different plan while reporting success, which is the exact failure this skill exists to make visible.

## Drift is reported, not enforced

The stored plan records the tree it was drafted against in `Base:`. This skill compares that against the checkout's `origin/main`, reports any difference, and **proceeds**.

That is a deliberate asymmetry with [`run-primed`](./15-run-primed-skill.md#the-validation-contract), which treats a stale base as a rejecting verdict. The two artifacts fail differently. A context brief describes what the repository _is_, so a stale one is actively misleading — it would have the consumer reason about code that changed. A stored plan describes what to _do_; drift makes it possibly-outdated, not wrong. And this skill's one promise is to follow the plan without changes, so a blocking staleness check would contradict the contract it is built on. Judging whether the drift matters is the reader's call, and the report is what makes that call possible.

Two reports make that call possible, because a SHA alone cannot:

| Report         | Question it answers                                                      |
| -------------- | ------------------------------------------------------------------------ |
| Revision drift | has the tree moved since the plan was drafted?                           |
| Path drift     | did it move underneath _this_ plan — are the files it names still there? |

Revision drift tells you the repository changed; it says nothing about whether the change touched anything this plan cares about. Path drift answers that directly, by checking every path in the stored `### Files` list against the checkout. Entries the plan marked `(new)` are skipped — the plan template uses that suffix for files it intends to create, so they are absent by design.

This repository has already moved paths in ways that would matter: documentation chapters are positioned by number and have been renumbered wholesale, and skill prose was relocated into `references/` subdirectories. Without the check, a plan stored before either change fails partway through execution, on a step that reads as broken rather than as outdated. With it, the reader sees the specific paths that vanished before the first edit — and when nothing has moved, the report says so, because silence would be indistinguishable from the check not running.

## Where context comes from

The stored plan supplies the work; the Context Map supplies the repository:

| Source                  | Sections                                                     |
| ----------------------- | ------------------------------------------------------------ |
| Stored plan             | `### Summary`, `### Implementation Steps`, `### Files`       |
| Stored plan, **unused** | `### Pre-Implementation`, `### Post-Implementation`          |
| Context Map             | Issue, Related TODOs, In-flight changes, Git state, Snapshot |

The two unused sections are read past deliberately. They describe a branch and a post-implementation chain, and this skill supplies both from `run` — the branch because it has to be created in _this_ checkout, and the chain because `run` owns it. Replaying a stored branch step would mean acting on a tree that may no longer exist.

**Nothing in the fan-out is gated off**, which is the other place this pair diverges from the explore pair. `run-primed` skips the standards digest because a validated brief already carries it. A stored plan carries no such thing: it records decisions, not architecture. So the standards digest, branch diff, TODO search, and a freshly attached snapshot all still run. A recorded snapshot id would be useless anyway — it is session-scoped and dead in any later session.

## Executing verbatim

The stored `### Implementation Steps` are worked in order, each verified against its own `verify:` line before the next begins. No re-drafting, no re-ordering, no merging, no added steps, and no second expert review — the producer's scored pipeline already finalized the stored artifact.

Where a step cannot be carried out as written, the skill stops and reports which step and why. It does not silently substitute a different plan: a plan that no longer fits its repository is information the reader needs, not an obstacle to route around. The stored `### Files` list is the expected blast radius, so touching a file it does not name is reported for the same reason.

## How this is guarded

`linearPlanContract.test.ts` relates this skill to its producer — see [the guard section in chapter 16](./16-linear-plan-skill.md#how-this-is-guarded) for what it asserts. The parts that constrain this side: every verdict must be named and every rejecting one must carry a message pointing at `/autopilot:linear-plan`, the consumed sections must match the producer's required set exactly, the caller-owned sections must _not_ be consumed, and the file must contain no dispatch that would let it re-plan.

**What no test can show:** that the gate runs, or that the model honours it. CI sees text in a file. Nothing under `.github/workflows/` runs `bun test`, so the guard gates locally and in review; and because this repository configures no `linear` tracker, neither skill can execute here at all. Runtime evidence comes from a dry run recorded on the pull request.

## Where to look in the code

| File                                                                | Role                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `claude-plugins/autopilot/skills/linear:run/SKILL.md`               | The skill: validate, gather, execute verbatim, delegate    |
| `claude-plugins/autopilot/skills/linear:plan/SKILL.md`              | Writes the stored plan and owns its format                 |
| `claude-plugins/autopilot/skills/run/SKILL.md`                      | The phases this skill references for everything downstream |
| `claude-plugins/autopilot/skills/gather-context/SKILL.md`           | The fan-out, run in full here                              |
| `.github/actions/code-review-action/src/linearPlanContract.test.ts` | The producer/consumer guard                                |
