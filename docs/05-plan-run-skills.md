# Plan and run skills

> Chapter 5 of the [repository docs](../README.md#repository-docs).

How `/autopilot:plan` and `/autopilot:run` turn a task — a GitHub issue or a free-form description — into a validated, expert-reviewed implementation plan, and (for `run`) all the way into a merged pull request.

The two skills share the same front half. `plan` produces the plan and stops, asking what to do next. `run` is `plan` plus an automated post-implementation chain: commit → PR → monitor. Everything below applies to both unless a section calls out a difference.

> Source of truth: `claude-plugins/autopilot/skills/plan/SKILL.md` (orchestrator + shared pipeline), `…/skills/plan-bun/SKILL.md` and `…/skills/plan-nodejs-react/SKILL.md` (stack deltas), `…/skills/run/SKILL.md` (the automated tail), and the three sub-agents under `…/agents/`.

## At a glance

```text
        ┌─────────────────┐         ┌─────────────────┐
        │ /autopilot:plan │         │ /autopilot:run  │
        └────────┬────────┘         └────────┬────────┘
                 └────────────┬──────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 0 · Input Resolution       ①  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Preflight Check                  ②  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Common Instructions              ③  │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Phase 1 · Detect Stack & Delegate ④ │
            └─────────────────┬───────────────────┘
                              ▼
            ┌─────────────────────────────────────┐
            │ Shared Stack Pipeline · Phases 1–6 ⑤│
            └─────────────────┬───────────────────┘
                              ▼
                   ┌────────────────────┐
                   │ Plan file written  │
                   └─────────┬──────────┘
                     ┌───────┴────────┐
                     ▼                ▼
             ┌───────────────┐ ┌────────────────────┐
             │ plan: ask     │ │ run: automated     │
             │ "what's next?"│ │ post-impl       ⑥  │
             └───────────────┘ └────────────────────┘
```

**Flow Legend:**

- ① Resolve the input (issue vs. description) in parallel — attach the repomix snapshot (no code read yet) plus, for issues, two context sub-agents.
- ② `preflight-check` validates branch/worktree state and that `main` is current before any work.
- ③ Cross-cutting rules (doc-lookup, repo-docs, CLAUDE.md, ASCII schemas) declared once and reused by the pipeline.
- ④ Read `package.json` `agents.rules` and delegate to one stack skill.
- ⑤ The shared six-phase pipeline (defined once in `plan/SKILL.md`) drafts, reviews, scores, and finalizes the plan.
- ⑥ `run` only: commit → PR → monitor until approved (see [How run differs](#how-run-differs-automated-post-implementation)).

## The orchestrator and the two stack skills

`plan/SKILL.md` is the **orchestrator**. It owns Phases 0–2, the Common Instructions, and — since the pipeline was deduplicated — the single definition of the shared Stack Pipeline. The two stack skills are thin: frontmatter plus a `## Stack Deltas` block of exactly three values. They delegate straight back into the shared pipeline, substituting their deltas wherever the pipeline says "your stack's `<delta>`".

```text
          ┌──────────────────────────────────────────┐
          │ plan/SKILL.md  (orchestrator)            │
          │ • Phases 0–2 + Common Instructions       │
          │ • defines the shared Stack Pipeline once │
          └───────────────────┬──────────────────────┘
                              │ read package.json agents.rules
                  ┌───────────┴────────────┐
                  ▼                         ▼
       ┌──────────────────────┐  ┌──────────────────────┐
       │ plan-bun             │  │ plan-nodejs-react    │
       │ Bun · Bun+React+TW   │  │ NodeJS+React · +TW   │
       ├──────────────────────┤  ├──────────────────────┤
       │ Deltas:              │  │ Deltas:              │
       │ • example libraries  │  │ • example libraries  │
       │ • expert table       │  │ • expert table       │
       │ • verify examples    │  │ • verify examples    │
       └──────────┬───────────┘  └──────────┬───────────┘
                  └────────────┬─────────────┘
                              ▼
          ┌──────────────────────────────────────────┐
          │ Shared Stack Pipeline (Phases 1–6)       │
          │ executes in plan/SKILL.md with the       │
          │ delegating skill's deltas substituted    │
          └──────────────────────────────────────────┘
```

**Flow Legend:**

- The pipeline lives in one place so the two stacks cannot drift. A fix to a phase applies to both at once.
- The three deltas are the only real differences: example libraries for doc-lookup, the expert panel roster (Phase 4), and the verify-line / test-runner examples (Phase 3 template).

## Phase 0 — Input resolution

The skill detects the input type from its arguments and gathers context **in parallel**:

| Argument pattern                                                | Type                |
| --------------------------------------------------------------- | ------------------- |
| `…/security/code-scanning/{n}` URL, `alert#{n}`, or `alert {n}` | Code-scanning alert |
| `123`                                                           | GitHub issue        |
| `#123`                                                          | GitHub issue        |
| contains `github.com`                                           | GitHub issue URL    |
| anything else                                                   | Plain description   |

The classifier matches **top-to-bottom**: the code-scanning-alert row is checked first because an alert URL contains `github.com` and would otherwise misroute to `gh issue view`. A bare number stays a GitHub issue — alerts need the URL or the explicit `alert#{n}` / `alert {n}` token.

- **Codebase snapshot (always).** Prefer the committed `.repomix/pack.xml` via `attach_packed_output`; fall back to a live `pack_codebase` when it is absent. Phase 0 only _attaches_ the pack — it does not read code from it; the returned `outputId` is handed to Phase 1, the single phase that reads the codebase. See [Committed Repomix pack](./09-repomix-pack.md).
- **For GitHub issues (parallel sub-agents).** `resolve-issue-context` fetches the issue (and, when the caller opts in, idempotently self-assigns the current user); `search-codebase-todos` finds TODOs referencing the issue. Both return JSON (see [Sub-agents](#sub-agents-and-their-json-contracts)).
- **For code-scanning alerts (one sub-agent).** `resolve-alert-context` resolves the alert through `gh api repos/{owner}/{repo}/code-scanning/alerts/{n}` (rule, severity, `file:line`, state, message, `html_url`) — never `gh issue view`. There is no TODO search and no self-assign. If it returns `state: "unresolved"` (gh unauthenticated, missing `security_events` scope, or alert not found), the skill surfaces the error and stops rather than misrouting. The alert drives the plan title/summary and a `security-<slug>` branch / `SECURITY:` PR; the PR records the alert reference and emits no `Closes #` (alerts close on the next scan), and the plan's verify step polls alert state via the code-scanning API.

The skill then emits, for the user's review (all derived from the resolved issue JSON and TODOs, not a codebase scan): the rendered **issue context**, a one-line **steelmanned intent** (the request restated in its strongest form — the stable target for expert reviewers, copied verbatim into the plan's `## Summary`), and **Assumptions & Open Questions**. Any load-bearing open question is raised via `AskUserQuestion` before delegating.

## Preflight check

`Skill(autopilot:preflight-check)` (mode `plan`) validates git state: current branch, stale/merged branches, issue-ID mismatches, and whether `main` is up to date. If it cancels, planning stops immediately.

## Common Instructions

Declared once and applied throughout — both the orchestrator phases and the shared pipeline reference them rather than restating them:

- **Documentation Lookup Protocol** — look up docs for every task-relevant library across context7, Ref, Exa, and Perplexity (skip any source that is unavailable or returns nothing).
- **Repository Documentation** — read the root `README.md` and the relevant files under `docs/` as the project's source of truth, and when an `rfc/` folder exists build a standards inventory and read the diff-relevant standards (cap 3) so the plan complies with Accepted RFCs (a Draft RFC is advisory); the generated plan must keep `README.md`, `docs/*`, and any edited `rfc/*` current after implementation. This is the compliance mirror of the enforcement the `pr:review` skill applies — see [Code review repository standards](./12-code-review-repository-standards.md).
- **Plan File Header** — every plan file begins with a single `# <Title>` line and a fixed section order.
- **CLAUDE.md Compliance** — map each planned change to the project's rules.
- **Visualize with ASCII Schemas** — for structural/visual changes, generate diagrams via `Skill(autopilot:ascii-schemas)` and embed them verbatim, inline in the section each explains.

## Phase 1 — Detect stack and delegate

The orchestrator reads `package.json` `agents.rules` and delegates to one stack skill:

| `agents.rules` value                     | Stack skill                          |
| ---------------------------------------- | ------------------------------------ |
| `Bun` · `Bun+React+Tailwind`             | `Skill(autopilot:plan-bun)`          |
| `NodeJS+React` · `NodeJS+React+Tailwind` | `Skill(autopilot:plan-nodejs-react)` |

If the stack cannot be detected, the skill asks the user via `AskUserQuestion`. The delegated skill inherits all of the Phase 0 context from the conversation.

## Phase 2 — Embed branch creation

The skill embeds the branch step into the plan file so it runs first, before any code changes — in `plan` this is after the user approves the plan; in `run` it runs straight away (see [How run differs](#how-run-differs-automated-post-implementation)). The exact block depends on the input type and current branch/worktree state:

- **GitHub issue** → invoke `Skill(autopilot:branch-create)` with the issue number; it produces an `issue-<number>-<slug>` branch so the PR can `Closes #<number>`.
- **Code-scanning alert** → invoke `Skill(autopilot:branch-create)` with `--security "<slug>"`; it produces a `security-<slug>` branch (no issue number, no `Closes #`).
- **Plain description** → prompt for a branch type (Hotfix / Trivial / Maintenance) and branch via `branch-create` with that prefix.
- **Already on a feature branch with active work** → no branch block is added.

## The shared Stack Pipeline (Phases 1–6)

The delegated stack skill discovers the planning tasks (via `TaskList`) and runs these six phases in order. Note these are the _stack-execution_ phases, distinct from the orchestrator's Phase 0–2.

### Phase 1 · Context Gathering

This is the pipeline's **single codebase-reading pass** — Phase 0 reads no code and Phase 2 only synthesizes. Gather the branch diff (`git log/diff origin/main...HEAD`), then decide **where context comes from** before crawling: the Phase 0 snapshot serves broad/whole-repo reads, while live tools (Explore agents / Grep / Glob) serve only what the snapshot cannot — in-flight working-tree code or targeted fresh reads. The pass ends by recording a **Context Map** — files and their roles, patterns to mirror, key types/schemas, test conventions, in-flight changes, and the **applicable standards** (the selected `rfc/`/`docs/` entries with their status, plus any dropped candidates) the plan must honor — which becomes the single artifact every later phase reasons over instead of re-reading. Documentation lookup, repository documentation, and CLAUDE.md compliance follow the Common Instructions.

### Phase 2 · Deep Analysis

A synthesis step, not a second crawl: reason over the **Context Map** from Phase 1 across five dimensions — **Architecture** (where it fits), **Patterns** (what existing code to follow), **Data Flow** (source of truth), **Types** (interfaces/schemas, what needs Zod), and **Edge Cases** (failure/null/race conditions). The map is the codebase read; an extra lookup is allowed only when it is genuinely missing something, under the same snapshot-vs-live rule as Phase 1, with the result folded back into the map — never a re-crawl of the tree.

### Phase 3 · Draft Plan

Assemble a complete plan draft **now** — before scoring and review — so both operate on a concrete artifact, not an imagined one. The draft follows a fixed template: `## Summary` (with steelmanned intent and a `Score:` placeholder), `## Implementation Steps` (each with an observable `verify:` line patterned on the stack's verify-examples delta), `## Files`, and `## Post-Implementation`. For structural or visual changes, ASCII diagrams (via `ascii-schemas`) are embedded inline in the section each explains rather than collected in a standalone section.

### Phase 4 · Dynamic Expert Review

Select experts from the stack's **expert table** delta — always the Pre-mortem Analyst, plus 2–3 more by task scope — and launch them as parallel `expert-review` sub-agents pointed at the Phase 3 draft. Each returns a schema-validated JSON verdict; their findings refine the draft, and any `needs-revision` verdict is addressed before finalizing. See [Sub-agents](#sub-agents-and-their-json-contracts).

### Phase 5 · Validation Scoring

Score the reviewed plan across five dimensions (20 points each = 100): Alignment, Completeness, Type Safety, Testability, Simplicity. Target is 95+. Below that, the auto-iteration loop identifies weak dimensions, asks via `AskUserQuestion` only when a weak dimension hinges on a material ambiguity, and re-scores internally until the target is met.

### Phase 6 · Finalize Output

Apply the expert findings and the validated score to the draft, replace the `Score:` placeholder, and write the final plan file.

## Sub-agents and their JSON contracts

Three sub-agents isolate work from the parent's context. Each returns a single schema-validated JSON object so the parent consumes typed fields instead of parsing prose. The launching skills declare `Agent` in their frontmatter `allowed-tools` — that grant is what makes the fan-out possible at all.

```text
        ┌──────────────────────────────────────────────┐
        │ Parent skill (plan / run)                    │
        └────┬─────────────────────────────────┬───────┘
   Phase 0   │ (parallel)           Phase 4    │ (parallel panel)
       ┌─────┴──────┐               ┌──────────┼──────────┐
       ▼            ▼               ▼          ▼          ▼
  ┌──────────┐ ┌──────────────┐ ┌────────┐┌────────┐┌────────┐
  │ resolve- │ │ search-      │ │expert- ││expert- ││expert- │
  │ issue-   │ │ codebase-    │ │review  ││review  ││review  │
  │ context  │ │ todos        │ │  #1    ││  #2    ││  #3    │
  └────┬─────┘ └──────┬───────┘ └───┬────┘└───┬────┘└───┬────┘
       │ JSON         │ JSON        │ JSON    │ JSON    │ JSON
       └──────────────┴──────┬──────┴─────────┴─────────┘
                             ▼
                ┌───────────────────────────┐
                │ Parent parses typed       │
                │ fields — no prose parsing │
                └───────────────────────────┘
```

**Flow Legend:**

- `resolve-issue-context` → `{ source, issueId, title, status, labels[], assignee|null, description, comments[] }`
- `resolve-alert-context` → `{ source, alertNumber, ruleId, severity, state, file, line, message, htmlUrl, resolveError|null }` (code-scanning-alert input only; `state: "unresolved"` + `resolveError` on failure)
- `search-codebase-todos` → `{ todos[{location, text}], total }`
- `expert-review` → `{ expertRole, score, verdict: "approved"|"needs-revision", findings[3–5], revision|null }`

## How run differs: automated post-implementation

`run` shares Phases 0–2 and the pipeline with `plan`, but never stops for plan approval — invoking `/autopilot:run` is itself the authorization, so there is **no plan-approval gate**; run implements the moment the plan file is written. It then **replaces** the plan's "what's next?" prompt with an automated chain that proceeds without pausing. The user has pre-authorized the recommended choices, so each sub-skill takes its default path.

```text
 ┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
 │ Plan file  │──▶│ Auto-Commit  │──▶│ Auto-Create  │──▶│ Monitor       │
 │ (approved) │   │ commits-     │   │ PR           │   │ pr-monitor:   │
 │            │   │ create +push │   │ pr-create    │   │ CI + review   │
 └────────────┘   └──────────────┘   └──────────────┘   └───────┬───────┘
                                                                │
                                                                ▼
                                                     ┌────────────────────┐
                                                     │ Approved / Merged  │
                                                     └────────────────────┘
```

**Flow Legend:**

- **Auto-Commit** — `Skill(autopilot:commits-create)` (auto-selects a single commit and confirms), then `git push`.
- **Auto-Create PR** — `Skill(autopilot:pr-create)` (auto-selects "Create PR"), then a format check on the result.
- **Monitor** — `Skill(autopilot:pr-monitor)` polls CI and review status; on changes-requested it runs `pr-resolve` (auto "Address all"; replies post without prompting) and loops until approval.
- Direct `gh pr create` / `git commit` are forbidden in autopilot mode — everything routes through the sub-skills so format stays correct.

## Where to look in the code

| File                                                         | Role                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `claude-plugins/autopilot/skills/plan/SKILL.md`              | Orchestrator: Phases 0–2, Common Instructions, and the shared Stack Pipeline definition |
| `claude-plugins/autopilot/skills/plan-bun/SKILL.md`          | Bun stack deltas                                                                        |
| `claude-plugins/autopilot/skills/plan-nodejs-react/SKILL.md` | NodeJS+React stack deltas                                                               |
| `claude-plugins/autopilot/skills/run/SKILL.md`               | `plan` plus the automated post-implementation chain                                     |
| `claude-plugins/autopilot/agents/expert-review.md`           | Domain-expert plan reviewer (JSON verdict)                                              |
| `claude-plugins/autopilot/agents/resolve-issue-context.md`   | GitHub issue context resolver (JSON)                                                    |
| `claude-plugins/autopilot/agents/resolve-alert-context.md`   | Code-scanning alert context resolver via `gh api …/code-scanning/alerts/{n}` (JSON)     |
| `claude-plugins/autopilot/agents/search-codebase-todos.md`   | TODO/issue-reference search (JSON)                                                      |
