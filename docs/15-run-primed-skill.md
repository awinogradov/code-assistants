# The `run-primed` skill

> Chapter 15 of the [repository docs](../README.md#repository-docs).

How `/autopilot:run-primed` lets an already-primed session deliver a tracked issue without mapping the repository a second time — and why it refuses, loudly, rather than guessing.

> Source of truth: `claude-plugins/autopilot/skills/run-primed/SKILL.md` (the skill), `…/skills/explore/SKILL.md` (the brief it consumes), and `…/skills/gather-context/SKILL.md` (the `Scope: primed` value this chapter adds).

## The pattern this exists for

[`explore`](./14-explore-skill.md) can prime a session against an exact revision and persist what it learned to `.claude/context/brief.md`. That makes a four-step orchestration possible:

1. Run `/autopilot:explore` once on an immutable revision.
2. Persist the resulting session transcript and the context brief.
3. Fork that session into a clean checkout of the same revision.
4. Ask it to implement a tracked issue end to end.

Step 4 had only one door: [`/autopilot:run`](./05-plan-run-skills.md), whose Phase 1 unconditionally re-runs the whole [`gather-context`](../claude-plugins/autopilot/skills/gather-context/SKILL.md) fan-out. That is the correct contract for an interactive run — the Context Map is deliberately its entire view of the repository — but it means the forked session pays for the map twice. The transcript is visible to the model and is not an authoritative input, so nothing changes.

## Why a separate skill, not a flag on `run`

The alternative was a heuristic inside `run`: notice that the session looks primed, skip the fan-out. That is the wrong shape, for reasons that all reduce to one.

**An artifact can be checked; a claim cannot.** A file carrying a base SHA either matches the checkout or it does not. A prompt asserting "context was already gathered" is unfalsifiable, and trusting it is how a run silently drafts against a repository it never read. Everything else follows:

- Interactive `/autopilot:run` stays deterministic, with no new branch in its logic.
- A headless orchestrator opts into the optimization explicitly, rather than hoping to trip a heuristic.
- Incompatible context is **visible** instead of quietly costing a second full pass.
- The optimization composes with session forking without the skill knowing anything about how the transcript or brief was stored.

## When to use which

| Skill                   | You have                           | You get                                                   |
| ----------------------- | ---------------------------------- | --------------------------------------------------------- |
| `/autopilot:explore`    | an area, no target                 | a durable brief, then edit-and-verify on your instruction |
| `/autopilot:plan`       | a target you want reviewed         | a scored plan file, an approval gate, then implementation |
| `/autopilot:run`        | a target you want carried          | the same plan, implemented and driven to a merged PR      |
| `/autopilot:run-primed` | a target **and** a validated brief | the same as `run`, without re-mapping the repository      |

`run-primed` is `run` with one phase replaced. Everything from the draft onward — pipeline, expert review, branch, commit, PR, monitor — is the same machinery, referenced rather than restated.

## At a glance

```text
                ┌───────────────────────┐
                │ /autopilot:run-primed │
                └───────────┬───────────┘
                            │ ①
                            ▼
                ┌───────────────────────┐
                │  Phase 1              │
                │  Validate the brief   │
                └───────────┬───────────┘
                            │
                  ┌─────────┴─────────┐
                  │ ②                 │ ③
                  ▼                   ▼
        ┏━━━━━━━━━━━━━━━━━━━┓ ┌───────────────────┐
        ┃  Stop             ┃ │  Phase 2          │
        ┃  missing          ┃ │  gather-context   │
        ┃  malformed        ┃ │  Scope: primed    │
        ┃  stale            ┃ └─────────┬─────────┘
        ┃  revision-mismatch┃           │ ④
        ┗━━━━━━━━━━━━━━━━━━━┛           ▼
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

- ① Same argument forms as `run`: a GitHub or Linear issue, a code-scanning alert, or a description.
- ② Four rejections, each naming `/autopilot:run` as the caller's explicit fallback. The skill never invokes it automatically.
- ③ The brief validated against the checkout's own base.
- ④ Only what a brief cannot bake in advance: issue or alert details, TODO search, branch diff, git state, and a re-attached snapshot.
- ⑤ Draft, expert review, scoring, branch, implement, commit, PR, monitor — no plan-approval gate, exactly as `run`.

## The validation contract

Five verdicts, resolved in order and with no network fetch — two file checks first, then three `git` checks. The order is load-bearing: an absent `Base:` line reaching `git cat-file` exits non-zero and would report `revision-mismatch` for what is really a `malformed` brief, and the section-presence check has no `git` equivalent at all.

| Verdict               | Test                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| **missing**           | the brief does not exist                                                                       |
| **malformed**         | no `Base:` line, or any of the nine fixed `##` sections absent                                 |
| **revision-mismatch** | the recorded base does not resolve, or is not an ancestor-or-equal of `HEAD`                   |
| **stale**             | the recorded base resolves and is contained in `HEAD`, but is not the checkout's `origin/main` |
| **valid**             | the recorded base equals `origin/main` **and** is an ancestor-or-equal of `HEAD`               |

**The comparison target is `origin/main`, and that is load-bearing.** `explore` writes `Base: <origin/main SHA>` and its own staleness check re-reads it against `origin/main`. Validating against `HEAD` instead would reject every brief written in a session whose branch had moved ahead — which is the ordinary explore session, since producing commits is the point of one. Producer and consumer would then disagree, in the same repository, about what "current" means, and the feature would read as permanently broken.

The ancestor test is the second half: it confirms the working tree actually contains the recorded revision. `git merge-base --is-ancestor` is also what keeps "an older revision of this history" separable from "a different history entirely", which is why `stale` and `revision-mismatch` are two verdicts and not one.

There is deliberately **no `git fetch`**. The checkout's `origin/main` is the base the orchestrator produced; re-fetching would let an unrelated upstream merge fail a correctly primed run. Requiring equality also makes the later branch-from-an-up-to-date-`main` step a no-op in the happy path, so the tree the plan was drafted against is the tree it is implemented against.

## What the caller owns

The skill validates and consumes the primed state. It does **not** know how that state was produced or stored, and two obligations therefore sit with the orchestrator:

- **Transport the brief.** `.claude/context/` is in [`.gitignore`](../.gitignore), so git will never carry `brief.md` into a fresh clone or a forked checkout. The orchestrator must place it there. **A restored transcript alone is not sufficient** — without the brief artifact there is nothing checkable, and the run stops at the `missing` verdict. This is the whole reason the contract is an artifact rather than a conversation.
- **Clone with full history.** Resolving and comparing the recorded revision uses `git cat-file -e` and `git merge-base`, which need the objects present. In a shallow clone an older base is unresolvable and `stale` collapses into `revision-mismatch`.

## Where context comes from

The brief supplies the repository half, the Context Map the volatile half:

| Source            | Sections                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Brief             | `## Architecture map`, `## Data flow`, `## Conventions and standards`, `## Key types`, `## Test and verify` |
| Brief, **unused** | `## Snapshot`, `## In-flight changes`, `## Local session state`, `## Git state`                             |
| Context Map       | Issue / alert, Related TODOs, In-flight changes, Git state, Snapshot                                        |

The brief's three volatile sections are ignored because they describe the explore session's checkout, not this one. `## Snapshot` is stable and still unused: the repomix `outputId` it records is session-scoped and dead in a forked session, so the map's freshly attached pack is what gets read.

`## Conventions and standards` is carried into the plan's applicable-standards record. That record doubles as the audit log of what the plan was drafted against, so it must never read `none` merely because the standards digest was skipped.

## The `Scope: primed` value

`gather-context` gains a third scope rather than a second fan-out:

| `Scope`          | Codebase pass                                                            | Standards digest |
| ---------------- | ------------------------------------------------------------------------ | ---------------- |
| `task` (default) | the implementations, patterns, and tests the change touches              | runs             |
| `broad`          | principal modules and boundaries, entry points, the conventions in force | runs             |
| `primed`         | only the task-specific gaps the brief does not cover                     | skipped          |

`primed` is the first scope that gates a Phase 1 agent, so the input is now a fan-out selector and not only a read strategy. `digest-repo-standards` is the one agent it skips, because a validated brief already carries that digest's output from the same revision. [`digest-branch-diff`](../claude-plugins/autopilot/agents/digest-branch-diff.md) still runs at every scope — `isStaleMerged` and `baseAhead` describe the checkout in front of you, which a brief written elsewhere cannot know.

The emitted Context Map has the same sections at all three scopes, so `plan` and `run`, which omit `Scope`, are unaffected.

## How this is guarded

`explore` and `run-primed` are prompt files with no import between them, so a renamed brief section would break the consumer with nothing failing in between. `primedBriefContract.test.ts` closes that gap by extracting the section names from `explore`'s own template and asserting `run-primed` reads exactly the consumed subset — a rename in the producer fails the guard. It also asserts every verdict carries an actionable message, that `run-primed` never dispatches `run`, and that ordinary `run` still gathers context and mentions no brief.

**What no test can show:** that the gate runs, or that the model honours it. CI sees text in a file. Worse, nothing under `.github/workflows/` runs `bun test`, so this guard gates locally and in review rather than in CI. Runtime evidence comes from a dry run recorded on the pull request.

## Where to look in the code

| File                                                                 | Role                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `claude-plugins/autopilot/skills/run-primed/SKILL.md`                | The skill: validate, gather narrowly, delegate the tail      |
| `claude-plugins/autopilot/skills/explore/SKILL.md`                   | Writes the brief and owns its `Base:` line and sections      |
| `claude-plugins/autopilot/skills/run/SKILL.md`                       | The phases `run-primed` references for everything downstream |
| `claude-plugins/autopilot/skills/gather-context/SKILL.md`            | The fan-out and its `Scope` input                            |
| `.github/actions/code-review-action/src/primedBriefContract.test.ts` | The producer/consumer guard                                  |
