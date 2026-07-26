# The `explore` skill

> Chapter 14 of the [repository docs](../README.md#repository-docs).

How `/autopilot:explore` primes a session with a broad, durable picture of a repository, and then gets out of the way so fixes can be issued one at a time.

> Source of truth: `claude-plugins/autopilot/skills/explore/SKILL.md` (the skill), `…/skills/gather-context/SKILL.md` (the context fan-out it reuses, and the `Scope` input this chapter adds), and the sub-agents under `…/agents/`.

## Why a third on-ramp

Autopilot had exactly two entry points, and both start from a target. [`plan`](../claude-plugins/autopilot/skills/plan/SKILL.md) and [`run`](../claude-plugins/autopilot/skills/run/SKILL.md) each take a GitHub issue, a Linear ticket, a code-scanning alert, or a description concrete enough to plan against — then carry the session through draft, expert panel, scoring, a plan file, a branch, and a pull request. See [Plan and run skills](./05-plan-run-skills.md).

Work does not always arrive that way. Sometimes it arrives as an _area_ — "the refactoring flow", "the review pipeline" — and the changes that follow are surgical: a few lines in a file you first have to find. Getting autopilot's context quality for that mode meant inventing a target for `plan` and then discarding everything the plan pipeline dragged along.

The context acquisition was already the right shape. [`gather-context`](../claude-plugins/autopilot/skills/gather-context/SKILL.md) runs one parallel fan-out and returns a bounded Context Map. It just was not reachable: it is marked `user-invocable: false`, and its codebase pass was written around "the implementations, patterns, and tests **the change touches**" — an instruction with no referent when there is no change yet.

Two further properties made the map unsuitable for a steer-as-you-go session. It lives only in the conversation, so it is lost on compaction — and a session of successive small fixes is exactly the session most likely to compact. And it says nothing about the local workspace: uncommitted changes, stashes, sibling worktrees, unpushed commits on other branches.

## When to use which

| Skill                | You have                   | You get                                                   |
| -------------------- | -------------------------- | --------------------------------------------------------- |
| `/autopilot:explore` | an area, no target         | a durable brief, then edit-and-verify on your instruction |
| `/autopilot:plan`    | a target you want reviewed | a scored plan file, an approval gate, then implementation |
| `/autopilot:run`     | a target you want carried  | the same plan, implemented and driven to a merged PR      |

`explore` is the only one of the three that never branches, never opens a pull request, and never asks for approval — invoking it is not a commitment to change anything.

## At a glance

```text
                ┌───────────────────────┐
                │  /autopilot:explore   │
                └───────────┬───────────┘
                            │ ①
                            ▼
                ┌───────────────────────┐
                │  Phase 0              │
                │  Classify the run     │
                └───────────┬───────────┘
                            │
                  ┌─────────┴─────────┐
                  │ ②                 │ ③
                  ▼                   │
        ┌───────────────────┐         │
        │  Phase 1          │         │
        │  gather-context   │         │
        │  Scope: broad     │         │
        └─────────┬─────────┘         │
                  │                   │
                  ▼                   │
        ┌───────────────────┐         │
        │  Phase 2          │         │
        │  ascii-schemas    │         │
        └─────────┬─────────┘         │
                  │                   │
                  └─────────┬─────────┘
                            ▼
                ┌───────────────────────┐
                │  Phase 3              │
                │  Recompute volatile   │
                └───────────┬───────────┘
                            │ ④
                            ▼
                ┌───────────────────────┐
                │  Phase 4              │
                │  Write the brief      │
                └───────────┬───────────┘
                            │ ⑤
                            ▼
                ┌───────────────────────┐
                │  Phase 5              │
                │  Session contract     │
                └───────────┬───────────┘
                            │ ⑥
                            ▼
                ┌───────────────────────┐
                │  You steer: edit,     │
                │  verify, repeat       │
                └───────────────────────┘
```

**Flow Legend:**

- ① The skill takes no arguments. The map is broad by design, so there is nothing to scope.
- ② No brief, an unresolvable recorded base, or non-derived upstream changes — a full prime.
- ③ Nothing but derived files moved upstream — skip both full-prime phases and delta-refresh instead.
- ④ Runs on both paths and owns every volatile section: branch diff, git state, dirty files, stashes, sibling worktrees, unpushed branches.
- ⑤ A full prime writes every section; a delta refresh rewrites only the volatile ones.
- ⑥ No plan file, no expert panel, no scoring, no branch prompt, no PR chain.

## Reuse, not a second fan-out

`explore` invokes `gather-context` rather than re-implementing it. These are prompt files with no import mechanism, so a "mirrored" roster is a hand-copy — and it would rot the first time a sub-agent is added to one side and not the other, with no guard relating the two skills.

The only change on that shared path is one optional input:

| `Scope`          | Codebase pass                                                            |
| ---------------- | ------------------------------------------------------------------------ |
| `task` (default) | the implementations, patterns, and tests the change touches              |
| `broad`          | principal modules and boundaries, entry points, the conventions in force |

The Context Map's section shape is identical either way. `plan` and `run` omit `Scope` and get `task`, so the addition is additive and default-preserving — the blast radius is confined to callers that pass `broad`.

`explore` also passes input type `plain-description`, which gates off `resolve-issue-context` and `search-codebase-todos`. No sub-agent runs whose output the brief would discard.

Local workspace state deliberately stays in `explore` rather than joining the Context Map: it is four bounded `git` calls, not a digest, and `plan`/`run` did not ask for it.

## The brief

One brief per worktree, at `.claude/context/brief.md`. It is ignored by both git and Prettier, so it never reaches a commit or a format check — the entry is the narrow `.claude/context/`, because `.claude/settings.json` and `.claude/agents/` are tracked.

```text
┌────────────────────────────────────────────────────────────┐
│  .claude/context/brief.md    Base: <origin/main SHA>       │
├────────────────────────────────────────────────────────────┤
│  Stable — rewritten only on a full prime                   │
├────────────────────────────────────────────────────────────┤
│  Architecture map            module boundaries + diagram   │
│  Data flow                   diagram                       │
│  Conventions and standards   rfc / docs / principles       │
│  Key types                   interfaces, schemas           │
│  Test and verify             the exact commands to run     │
│  Snapshot                    repomix outputId              │
├────────────────────────────────────────────────────────────┤
│  Volatile — rewritten on every invocation                  │
├────────────────────────────────────────────────────────────┤
│  In-flight changes           branch diff                   │
│  Local session state         dirty, stash, worktrees       │
│  Git state                   branch, worktree, staleness   │
└────────────────────────────────────────────────────────────┘
```

`Base:` is the only metadata, because it is the only field a decision reads. There is no timestamp: nothing keys off one, and an unused field is a field that goes stale. The current branch belongs to the volatile `## Git state`, so switching branches cannot leave a stale branch name sitting in a stable region.

The skill fixes the Context-Map-to-brief transformation rather than improvising it per run — otherwise no two briefs are structurally comparable and the stable/volatile split is aspirational. `Relevant files`, `Patterns to mirror`, and `Stack` collapse into `## Architecture map`; `Related TODOs` and `Issue / alert` are never populated for this input and are dropped. An empty section is written `none`, never omitted.

Crucially, the map feeds the **stable** sections only. The map's own `In-flight changes` and `Git state` are deliberately unused, because the map exists solely on a full prime: sourcing a "rewritten on every invocation" section from it would freeze that section after the first prime. Phase 3 recomputes both from `git` instead, on both paths.

## Delta refresh

Re-invoking the skill does not repeat the fan-out unless something upstream actually invalidates it:

```bash
git fetch origin main
git diff --name-only <base>..origin/main -- . \
  ':(exclude).repomix/' ':(exclude)**/CHANGELOG.md' \
  ':(exclude)**/.release_notes/' ':(exclude)LICENSES.md'
```

Empty means delta refresh — rewrite `Base:` and the three volatile sections, leave the six stable ones byte-identical. Anything else, a missing brief, or a `<base>` that no longer resolves means a full prime.

**The exclusions carry the design, and an include-list cannot replace them.** The [committed Repomix pack](./09-repomix-pack.md) is refreshed by a merge-triggered CI job on essentially every merge, so watching it makes the diff non-empty almost always and the delta path becomes dead code — the exact outcome the rule exists to avoid. Watching only prose roots (`docs/`, `rfc/`, `README.md`) fails in the other direction: `## Architecture map`, `## Key types`, and `## Test and verify` describe code, so they would go stale while a fresh `Base:` vouched for them. Excluding what is derived and watching everything else is the only formulation that means what those sections claim.

The diff is remote-to-remote, so locally-uncommitted work never forces a full prime. That is deliberate: local edits are what an explore session produces, and they already surface in the volatile sections.

## Brief lifecycle

- **Who reads it** — both the agent and the human. It is written as prose with diagrams, not as a machine format.
- **Who does not** — `plan`, `run`, and `commits-create` do not consume it. It is not an input to any other skill; nothing silently depends on it being current.
- **Hand-editing** — safe, and it survives every delta refresh. A full prime overwrites the stable sections, so notes worth keeping belong somewhere else.
- **Staleness beyond the refresh rule** — the rule watches `origin/main` only, so long-lived local work that never lands upstream will not trigger a full prime. That is safe because the three volatile sections are recomputed from `git` in Phase 3 on both paths, never read from the Context Map; the stable sections describe the upstream base, which such work has not moved.
- **Reset** — delete the file. The next invocation is a full prime.

## The session contract

After writing the brief the skill reports what it did, notes anything in `## Git state` worth knowing before editing — being on `main`, or on a branch whose work already landed upstream — and stops. It **reports** that state rather than prompting on it, because this skill does not branch.

Every instruction after that is handled the same way: locate through the brief, edit, run the verify check `## Test and verify` names, report. No plan file, no expert panel, no scoring, no branch prompt, no PR chain. `EnterPlanMode`, `ExitPlanMode`, and `preflight-check` are never called — they belong to the flows this skill exists to avoid.

Suppressing that machinery is half the value. A fix that costs one edit should not cost a planning pipeline. Committing or opening a pull request hands off to [`commits:create`](../claude-plugins/autopilot/skills/commits:create/SKILL.md) or [`pr:create`](../claude-plugins/autopilot/skills/pr:create/SKILL.md), which own those conventions.

## Where to look in the code

| File                                                      | Role                                                     |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `claude-plugins/autopilot/skills/explore/SKILL.md`        | The skill: classify, prime, persist, contract            |
| `claude-plugins/autopilot/skills/gather-context/SKILL.md` | The fan-out it reuses, and the `Scope` input             |
| `claude-plugins/autopilot/skills/ascii-schemas/SKILL.md`  | Generates the module and data-flow diagrams              |
| `.gitignore` / `.prettierignore`                          | Keep `.claude/context/` out of commits and format checks |
