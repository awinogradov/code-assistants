# Plan and run skills

> Chapter 5 of the [repository docs](../README.md#repository-docs).

How `/autopilot:plan` and `/autopilot:run` turn a task — a GitHub issue, a Linear ticket, a code-scanning alert, or a free-form description — into a validated, expert-reviewed implementation plan, and (for `run`) either a verified no-repository-change result or a merged pull request.

The two skills share the same front half. `plan` produces the plan and stops, asking what to do next. `run` is `plan` plus automated terminal selection: verified no repository change, or commit → PR → monitor. Everything below applies to both unless a section calls out a difference.

> Source of truth: `claude-plugins/autopilot/skills/plan/SKILL.md` (orchestrator) and its `references/` files (input detection, pipeline, stack deltas, branch blocks), `…/skills/gather-context/SKILL.md` (the context fan-out), `…/skills/run/SKILL.md` (the automated tail), and the sub-agents under `…/agents/`.

## At a glance

```text
        ┌─────────────────┐         ┌─────────────────┐
        │ /autopilot:plan │         │ /autopilot:run  │
        └────────┬────────┘         └────────┬────────┘
                 └────────────┬──────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 0 · Input detection        ①  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 1 · gather-context         ②  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 2 · Intent + human gate    ③  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 3 · Preflight verdict      ④  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 4 · Shared pipeline        ⑤  │
            └─────────────────┬───────────────────┘
                              ▼
                   ┌────────────────────┐
                   │ Plan file written  │
                   └─────────┬──────────┘
                     ┌───────┴────────┐
                     ▼                ▼
             ┌───────────────┐ ┌────────────────────┐
             │ plan: approve │ │ run: automated     │
             │ ExitPlanMode  │ │ post-impl       ⑥  │
             └───────────────┘ └────────────────────┘
```

**Flow Legend:**

- ① Classify the argument. Pure string matching, no I/O — which is why the issue id is known before anything is fetched.
- ② One parallel fan-out acquires every kind of context and returns the Context Map.
- ③ Steelmanned intent, assumptions, and open questions — the human gate, now asked with the code already understood.
- ④ Branch and worktree state read from the Context Map; `preflight-check` handles only what the map cannot settle.
- ⑤ The shared pipeline: draft, review and score, finalize (see [The shared pipeline](#the-shared-pipeline)).
- ⑥ `run` only: verify a no-repository-change result, or commit → PR → monitor until approved (see [How run differs](#how-run-differs-automated-post-implementation)).

## One fan-out, then decide

The ordering principle is that context acquisition has exactly one synchronization point.

Detection is free — it inspects the argument string and touches nothing. Resolution is what costs time, and it parallelizes with reading the repository's standards, digesting the branch diff, and attaching the codebase snapshot. So all of it launches together in [`gather-context`](../claude-plugins/autopilot/skills/gather-context/SKILL.md), and everything downstream reasons over the single **Context Map** it returns.

```text
      ┌──────────── gather-context: one parallel fan-out ────────────┐
      │                                                             │
      │  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
      │  │ repo standards  │ │ branch diff     │ │ issue / alert  │ │
      │  │ digest          │ │ digest          │ │ context        │ │
      │  └────────┬────────┘ └────────┬────────┘ └───────┬────────┘ │
      │  ┌────────┴────────┐ ┌────────┴────────┐ ┌───────┴────────┐ │
      │  │ snapshot attach │ │ stack + git     │ │ codebase todos │ │
      │  └────────┬────────┘ └────────┬────────┘ └───────┬────────┘ │
      │  ┌────────┴────────┐          │                  │          │
      │  │ session history │          │                  │          │
      │  └────────┬────────┘          │                  │          │
      └───────────┼───────────────────┼──────────────────┼──────────┘
                  └───────────────────┼──────────────────┘
                                      ▼
                       ┌───────────────────────────┐
                       │ task-scoped snapshot pass │
                       └─────────────┬─────────────┘
                                     ▼
                       ┌───────────────────────────┐
                       │        Context Map        │
                       └───────────────────────────┘
```

**Flow Legend:**

- Every call in the box is issued in a **single message** so they run concurrently.
- The digest agents return bounded JSON. The full text of a README, the selected RFCs, and an unbounded `git diff` never reaches the caller's context — that isolation is the point of using agents rather than reading inline.
- The task-scoped pass runs after the fan-out, because only then is the task's subject matter known. It searches the snapshot; live tools are reserved for working-tree code the snapshot cannot show.
- The session-history digest joins the fan-out only when the repository has [Entire](https://docs.entire.io/overview) enabled; it maps the task's files and commits to the agent sessions and checkpoints that produced them, and degrades to `none` everywhere else.
- The Context Map is the caller's entire view of the repository. Later phases reason over it instead of re-reading the tree.

## Phase 0 — Input detection

The skill classifies its argument. The table, its tracker gating, and the alert divergence live in [`references/input-detection.md`](../claude-plugins/autopilot/skills/plan/references/input-detection.md), shared by both skills so they cannot drift.

| Argument pattern                                                | Type                |
| --------------------------------------------------------------- | ------------------- |
| `…/security/code-scanning/{n}` URL, `alert#{n}`, or `alert {n}` | Code-scanning alert |
| contains `linear.app`                                           | Linear issue URL    |
| `ENG-123` (matching `^[A-Z]+-[0-9]+$`)                          | Linear issue        |
| `123`                                                           | GitHub issue        |
| `#123`                                                          | GitHub issue        |
| contains `github.com`                                           | GitHub issue URL    |
| anything else                                                   | Plain description   |

The classifier matches **top-to-bottom**: the alert row is checked first because an alert URL contains `github.com` and would otherwise misroute to `gh issue view`. A bare number stays a GitHub issue. Linear rows fire only when a `linear` tracker is configured — see [Linear tracker](./11-linear-tracker.md).

### `--issue` / `--linear-issue`: file a tracked issue first

`plan` accepts two flags that turn a free-form description into a tracked issue before planning. The pre-step runs ahead of the detection table: `--issue` files a GitHub issue via `Skill(autopilot:issue-create)`, `--linear-issue` files a Linear issue via `Skill(autopilot:linear-create)`. It captures the created identifier, pins the input type, and continues — so the branch becomes `issue-<N>-slug` and the PR can `Closes` the issue. Guards fail fast **before** anything is filed: both flags at once, `--linear-issue` with no Linear tracker, or `--issue` with no GitHub tracker each stop with a message.

`run` deliberately does not carry these flags: it implements immediately, so filing a tracking issue first belongs to the deliberate path.

## Phase 1 — Gather context

`Skill(autopilot:gather-context)` runs the fan-out described above and returns the Context Map: issue or alert context, related TODOs, relevant files, patterns to mirror, key types, test conventions, in-flight changes, session history, applicable standards, resolved stack deltas, git state, and the selected snapshot source.

The snapshot follows the shared ordered source chain: a committed graphify knowledge graph when the repository carries one, otherwise the committed `.repomix/pack.xml` via `attach_packed_output` (falling back to a live `pack_codebase`), otherwise plain Grep/Glob/Read — see [Committed Repomix pack](./09-repomix-pack.md).

A resolver returning `unresolved` with a non-null `resolveError` is fatal: the skill surfaces the error and stops rather than proceeding against a misfetched target. A _digest_ failure is not fatal — it is recorded and planning continues, because a plan without a standards digest is degraded, not wrong.

The fan-out takes an optional `Scope` input — `task` or `broad`. Both skills here omit it and get `task`, the change-scoped pass described above; `broad` reads the snapshot breadth-first instead and is used only by [the `explore` skill](./14-explore-skill.md), a third on-ramp for work that starts from an area rather than a target. The emitted Context Map has the same sections either way.

## Phase 2 — Intent, assumptions, and the human gate

After the Context Map, deliberately. The skill emits a one-line **steelmanned intent** (the request restated in its strongest form — the stable target for expert reviewers, copied verbatim into the plan's `## Summary`), then **Assumptions** and **Open Questions**. Any load-bearing open question is raised via `AskUserQuestion` before drafting.

This gate used to fire in Phase 0, before any code had been read. Asking at that point produces uninformed questions and structurally cannot surface the informed ones, so the one human checkpoint in the flow was spent at the moment of minimum information.

## Phase 3 — Preflight verdict

The Context Map already carries branch, worktree, `isStaleMerged`, and `baseAhead`. The skill compares the issue id against the branch name for a mismatch and acts on the map; `Skill(autopilot:preflight-check)` is invoked for anything ambiguous or uncovered, and owns the interactive prompts. If it cancels, planning stops immediately.

`isStaleMerged` matters because a branch whose commits already landed upstream under rebase-rewritten SHAs still shows a non-empty `git log origin/main..HEAD`. A check testing only for emptiness reads a finished branch as active work and skips creating a fresh one. The [`digest-branch-diff`](../claude-plugins/autopilot/agents/digest-branch-diff.md) agent resolves it with `git cherry`, which compares patch equivalence rather than SHA identity.

## Plan mode

Once preflight passes, `plan` switches the session into harness plan mode via `EnterPlanMode`. Plan mode makes the rest of planning read-only and supplies the plan-file path — the single file the pipeline writes and that `ExitPlanMode` later reads back for approval. The call is idempotent (skipped when the session is already in plan mode).

Both mode calls live in the orchestrator, deliberately **outside** the shared pipeline. `run` reuses only that pipeline and authorizes the whole flow up front, so it never enters plan mode and never calls `ExitPlanMode` — keeping the two calls out of the pipeline is what lets `run` share it without inheriting the approval gate.

## Common Instructions

Declared once in `plan/SKILL.md` and referenced by `run` rather than restated:

- **Documentation Lookup Protocol** — scaled to the task. A small or well-understood change needs a single targeted lookup, or none; the full context7 / Ref / Exa / Perplexity fan-out is reserved for unfamiliar libraries, APIs, or recent changes.
- **Repository standards** — supplied by the Context Map, not re-read. The plan must not violate a clause of an **Accepted** RFC; a **Draft** RFC is advisory; `principles/` values shape the approach rather than bind it. This is the compliance mirror of the enforcement `pr-review` applies — see [Code review repository standards](./12-code-review-repository-standards.md).
- **Plan File Header** — every plan file begins with a single `# <Title>` line and a fixed section order.
- **CLAUDE.md Compliance** — map each planned change to the project's rules.
- **Visualize with ASCII Schemas** — for structural/visual changes, generate diagrams via `Skill(autopilot:ascii-schemas)` and embed them verbatim, inline in the section each explains.

## Stack deltas

Planning is stack-agnostic except for three values — example libraries, the expert table, and verify-line examples — resolved from `package.json` `agents.rules` via [`references/stack-deltas.md`](../claude-plugins/autopilot/skills/plan/references/stack-deltas.md):

| `agents.rules` value                     | Delta set      |
| ---------------------------------------- | -------------- |
| `Bun` · `Bun+React+Tailwind`             | `Bun`          |
| `NodeJS+React` · `NodeJS+React+Tailwind` | `NodeJS+React` |

If the stack cannot be detected, the skill asks via `AskUserQuestion`.

These deltas previously lived in two dedicated skills, `plan-bun` and `plan-nodejs-react`. Each cost a full skill load and round trip to deliver three values, and the routing tables drifted — `run` listed two `agents.rules` values where `plan` listed four, so a `Bun+React+Tailwind` repo running `/autopilot:run` fell through to the "could not detect stack" prompt. A table cannot drift from itself. See [The `agents` field](./02-agents-field.md#stack--planning-deltas-used-by-plan-and-run).

## The shared pipeline

Defined once in [`references/pipeline.md`](../claude-plugins/autopilot/skills/plan/references/pipeline.md) and executed by both skills.

### Draft plan

Assemble a complete draft **before** review and scoring, so both operate on a concrete artifact rather than an imagined one. The draft follows a fixed template: `## Summary` (with steelmanned intent and a `Score:` placeholder), `## Context source`, `## Implementation Steps` (each with an observable `verify:` line patterned on the stack's verify examples), `## Files`, and `## Post-Implementation` — the last of these stating in prose that documentation is updated and the work is committed or opened as a PR.

`## Context source` is the one section quoted rather than composed: it carries the Context Map's `Snapshot` record verbatim, which on the graph tier means the `context-source:`, `graphify-trace:`, and `graphify-shortlist:` lines together. Implementation frequently happens in a session that never ran the query, and a source name alone leaves that session re-collecting a repository someone already mapped ([#597](https://github.com/awinogradov/code-assistants/issues/597)) — the shortlist entries carry the relationship that put them there, so they survive the hand-off as something to read rather than something to re-derive. It also makes a past run auditable, since a plan file is durable and greppable where a transcript is not. A plan with no such section — every plan written before the section existed — is an unrecorded source, read as a selection nobody wrote down, never as a reason to stop.

Two constraints bound what that draft may contain. The first is minimality: the draft proposes the smallest reliable solution that satisfies the steelmanned intent, reusing what the Context Map already shows, and every step must trace to that intent — no unrequested abstraction, no configurability nobody asked for, no error handling for impossible states, no opportunistic refactor of adjacent code. The second is shape: a step is one imperative action naming the file it touches and its `verify:` line, with reasoning left to `## Summary` and no checkboxes, since the plan file is read rather than ticked off.

Both apply at drafting rather than at scoring, even though the rubric already carries a Simplicity dimension. No revision budget reliably strips scope a draft has already committed to — by then the over-built design is the thing being corrected rather than the thing being avoided, and a pass spent arguing scope back down is a pass not spent on correctness. Constraining the draft also gives expert reviewers a tighter artifact to score.

Drafting works five analysis dimensions against the Context Map — **Architecture**, **Patterns**, **Data Flow**, **Types**, and **Edge Cases**. This was previously a separate "Deep Analysis" phase that produced no artifact and needed its own paragraph warning it not to re-crawl the tree; folding it into drafting removes both the phase boundary and the temptation.

For structural or visual changes, ASCII diagrams are embedded inline in the section each explains rather than collected in a standalone section.

### The plan file is output, not instructions

Everything written into the plan file describes an outcome. No section carries an `AskUserQuestion` parameter block, a `Skill(...)` dispatch line, or an HTML-comment directive — those are agent-facing, and the plan file is what a human reads to decide whether to proceed.

The mechanics sit in the phase that runs them: [Phase 5](#phase-5--embed-branch-creation) for the branch, [Phase 6](#phase-6--post-implementation-handoff) for `plan`'s handoff, and [Phase 4](#how-run-differs-automated-post-implementation) of `run` for the automated chain. Each behaviour is stated once. Before this split the branch and post-implementation mechanics existed twice — in the skill files and in a copy pasted into every plan file — so a renamed flag went stale in whichever copy nobody re-read, and the approval gate was padded with parameter arrays that said nothing about the change. [`planFileOutputPurity.test.ts`](../.github/actions/code-review-action/src/planFileOutputPurity.test.ts) enforces it: it walks the skill markdown, finds every fenced block destined for a plan file, and fails on any of those constructs.

### Review and score

Expert review and scoring are **one step**. Experts are selected from the stack's expert table — always the Pre-mortem Analyst, plus 2–3 more by task scope — and launched as parallel `expert-review` sub-agents.

The step is opt-in for `plan` and [`linear-plan`](./16-linear-plan-skill.md): each runs it only when the user passed `--experts-review` — `plan` because its approval gate puts a human in front of the finished plan either way, `linear-plan` because the teammate reading the stored ticket is that human. Without the flag the plan file records `Score: skipped · expert review disabled (invoked without --experts-review)` — a single literal, so its appearance in `run`, `run-primed`, or `linear-run` output is drift, not a valid state. The `run` family runs the review unconditionally because no human re-reads its plans; a skipped score can reach a stored ticket, where it tells the reader the plan is unreviewed.

Each reviewer receives a **Context Map excerpt** alongside the plan text. A reviewer with no view of the repository infers file contents, and an invented finding costs more than a missing one.

Each returns a schema-validated JSON verdict carrying per-dimension scores on the five-dimension rubric (Alignment, Completeness, Type Safety, Testability, Simplicity; 20 points each), with the overall score derived as their sum. The parent folds the panel's findings into the draft in a single pass and records each surviving reviewer's verdict — derived score and weakest dimension — with no cross-reviewer averaging. The review is an enhancement, never a gate: there is no score threshold, no revision loop, and no caller that blocks or refuses to proceed on the number — [`linear-plan`](./16-linear-plan-skill.md) stores the plan whatever it says.

Scoring used to be a separate phase running a second rubric over what the experts had already scored, with an uncapped auto-iteration loop; a later revision replaced that with a threshold-driven revision budget, and the threshold and budget were then removed entirely once review became an enhancement rather than a gate.

### Finalize

Apply the aggregated findings and score to the draft, replace the `Score:` placeholder, and write the plan file, with every reference formatted per RFC-0001.

The recorded line names each reviewer's weakest dimension beside their score — `Score: <score> & <score> · weakest: <dimension> (<points>) & <dimension> (<points>) · findings applied`. A score alone says how good a reviewer thought the plan was; the weakest dimension says what to double-check when executing it, and nothing reconstructs that later.

## Phase 5 — Embed branch creation

The skill embeds the branch step into the plan file so it runs first, before any code changes — in `plan` after the user approves, in `run` straight away. [`references/branch-blocks.md`](../claude-plugins/autopilot/skills/plan/references/branch-blocks.md) keys two things by input type: the prose body inserted into the plan file, and the **Mechanics** paragraph beside it holding the `branch-create` invocation the caller runs. Because the flags live in Mechanics rather than in the inserted text, all four bodies are identical for `plan` and `run` — a `run` variant is now a different argument at execution time, not a different section body.

Whether the branch name is confirmed still depends on the input type rather than the caller: a name derived from a tracked issue is created directly, while the alert and plain-description slugs come from free-form text and are confirmed, so those two carry a `run` variant appending `--autopilot`.

- **GitHub issue** → `branch-create` with the issue number → `issue-<number>-<slug>`, so the PR can `Closes #<number>`. No confirmation.
- **Linear issue** → `branch-create` with `<LINEAR-ID> --start` → `<team>-<number>-<slug>`. No confirmation.
- **Code-scanning alert** → `branch-create` with `--security "<slug>"` → `security-<slug>` (no issue number, no `Closes #`).
- **Plain description** → prompt for a branch type (Hotfix / Trivial / Maintenance), then branch with that prefix.
- **Already on a feature branch with genuine unmerged work** → no branch block is added.

## Phase 6 — Post-implementation handoff

`plan` only. Once every step and its `verify:` line has passed, the skill asks what to do next — commit, open a pull request (with `--release-notes` when the session produced `feat:` or `fix:` commits), or stop — and dispatches to `commits-create` or `pr-create` accordingly.

The gate lives in the orchestrator rather than the shared pipeline, for the same reason the two plan-mode calls do: `run` reuses only the pipeline, so a gate placed there would be inherited. `run` replaces this phase with its automated chain instead.

## Sub-agents and their JSON contracts

Sub-agents isolate work from the parent's context. Each returns a single schema-validated JSON object so the parent consumes typed fields instead of parsing prose. The launching skills declare `Agent` in their frontmatter `allowed-tools` — that grant is what makes the fan-out possible at all.

```text
        ┌──────────────────────────────────────────────┐
        │ Parent skill (plan / run)                    │
        └────┬─────────────────────────────────┬───────┘
  gather-     │ (one fan-out)        review    │ (parallel panel)
  context ┌───┴───┬────────┬────────┐      ┌───┼────────┐
          ▼       ▼        ▼        ▼      ▼   ▼        ▼
     ┌────────┐┌───────┐┌───────┐┌──────┐┌──────┐┌──────┐
     │digest- ││digest-││resolve││search││expert││expert│
     │repo-   ││branch-││-issue-││-code-││-rev  ││-rev  │
     │standard││diff   ││context││ todos││  #1  ││  #2  │
     └───┬────┘└───┬───┘└───┬───┘└───┬──┘└───┬──┘└───┬──┘
         │ JSON    │ JSON   │ JSON   │ JSON  │ JSON  │ JSON
         └─────────┴────┬───┴────────┘       └───┬───┘
                        ▼                        ▼
             ┌────────────────────┐   ┌────────────────────┐
             │ Context Map        │   │ Aggregated score   │
             └────────────────────┘   └────────────────────┘
```

**Flow Legend:**

- `digest-repo-standards` → `{ conventions[], standards[{id,title,status,path,defaulted,why}], dropped[], principles[], digestError|null }`
- `digest-branch-diff` → `{ branch, commits[{sha,subject,upstream}], files[{path,change}], summary, isStaleMerged, baseAhead, digestError|null }`
- `resolve-issue-context` → `{ source, issueId, title, status, labels[], assignee|null, url|null, description, comments[], resolveError|null }`
- `resolve-alert-context` → `{ source, alertNumber, ruleId, severity, state, file, line, message, htmlUrl, resolveError|null }` (alert input only)
- `search-codebase-todos` → `{ todos[{location, text}], total }`
- `expert-review` → `{ expertRole, score, dimensions{alignment,completeness,typeSafety,testability,simplicity}, verdict, findings[3–5], grounding[], revision|null }`

`grounding` names what a reviewer actually consulted, and the pipeline screens on it: a panel member with empty grounding, an unparseable report, or file claims it had no tools to make is **discarded rather than averaged**, every discard is named, and a panel that loses everyone reports the plan as unreviewed instead of emitting a score.

## How run differs: automated post-implementation

`run` shares Phases 0–3 and the pipeline with `plan`, but never stops for plan approval — invoking `/autopilot:run` is itself the authorization, so there is **no plan-approval gate**; run implements the moment the plan file is written. It then **replaces** the plan's `## Post-Implementation` section with a body for the selected terminal path and drives the decision from its own Phase 4 — the checks, steps, flags, and recovery rules stay in the skill, not in the plan file.

```text
                    ┌───────────────────────────┐
                    │ Plan implemented and     │
                    │ every verify line passed │
                    └─────────────┬─────────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │ Completion-path checks    │
                    └──────┬─────────────┬──────┘
             no repo work  │             │ repository change
                           ▼             ▼
              ┌──────────────────┐  ┌──────────────┐   ┌──────────────┐
              │ Outcome:         │  │ Auto-Commit  │──▶│ Auto-Create  │
              │ no_repository_   │  │ and push     │   │ PR           │
              │ change           │  └──────────────┘   └──────┬───────┘
              └──────────────────┘                            ▼
                                                    ┌──────────────────┐
                                                    │ Monitor until    │
                                                    │ approved/merged  │
                                                    └──────────────────┘
```

**Flow Legend:**

- **No repository change** — available only when the finalized plan explicitly says no repository files must change, every step and `verify:` line passed, and the worktree, diff, and topic-commit checks are empty. An empty diff alone is never evidence of completion. This path emits `Outcome: no_repository_change` and performs no branch, commit, push, PR, or monitoring action.
- **Auto-Commit** — `Skill(autopilot:commits-create)` with `--autopilot`, then `git push`.
- **Auto-Create PR** — `Skill(autopilot:pr-create)` with `--autopilot`, then a format check on the result.
- **Monitor** — `Skill(autopilot:pr-monitor)` polls CI and review status; on changes-requested it runs `pr-resolve` (auto "Address all") and loops until approval.
- Direct `gh pr create` / `git commit` are forbidden in autopilot mode — everything routes through the sub-skills so format stays correct.

There are two variants of this flow, each replacing a different half of it. [`/autopilot:run-primed`](./15-run-primed-skill.md) keeps every phase above and replaces only the context gather, reading a SHA-validated [explore brief](./14-explore-skill.md) instead of re-mapping the repository. [`/autopilot:linear-run`](./17-linear-run-skill.md) keeps terminal selection and replaces the draft-and-review half, executing a plan that [`/autopilot:linear-plan`](./16-linear-plan-skill.md) stored on a Linear issue earlier — possibly in another session, for another person to read first. Both variants inherit the same no-change checks and repository-delivery chain instead of copying them.

## Where to look in the code

| File                                                                 | Role                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `claude-plugins/autopilot/skills/plan/SKILL.md`                      | Orchestrator: detection, gather, gate, preflight, plan mode  |
| `claude-plugins/autopilot/skills/plan/references/input-detection.md` | Detection table, tracker gating, create-issue flags          |
| `claude-plugins/autopilot/skills/plan/references/pipeline.md`        | Draft template, review and scoring, finalize                 |
| `claude-plugins/autopilot/skills/plan/references/stack-deltas.md`    | Per-stack example libraries, expert tables, verify examples  |
| `claude-plugins/autopilot/skills/plan/references/branch-blocks.md`   | `## Pre-Implementation` bodies and their mechanics           |
| `claude-plugins/autopilot/skills/gather-context/SKILL.md`            | The one context fan-out, its `Scope` input, and the map      |
| `claude-plugins/autopilot/skills/run/SKILL.md`                       | `plan` plus the automated post-implementation chain          |
| `claude-plugins/autopilot/skills/run-primed/SKILL.md`                | `run` with the fan-out replaced by a validated context brief |
| `claude-plugins/autopilot/agents/digest-repo-standards.md`           | README / `docs/` / `rfc/` / `principles/` digest (JSON)      |
| `claude-plugins/autopilot/agents/digest-branch-diff.md`              | Branch commits, diff, and stale-merge detection (JSON)       |
| `claude-plugins/autopilot/agents/expert-review.md`                   | Domain-expert plan reviewer with per-dimension scores (JSON) |
| `claude-plugins/autopilot/agents/resolve-issue-context.md`           | GitHub / Linear issue context resolver (JSON)                |
| `claude-plugins/autopilot/agents/resolve-alert-context.md`           | Code-scanning alert context resolver (JSON)                  |
| `claude-plugins/autopilot/agents/search-codebase-todos.md`           | TODO/issue-reference search (JSON)                           |
