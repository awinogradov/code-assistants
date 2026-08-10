# MIGRATING

## From 4.x to 5.0.0

### Breaking changes

- Skill directories renamed dash-only per [RFC-0002](../../rfc/0002-portable-skills-layout.md): `skills/pr:review/` → `skills/pr-review/`, and likewise for the other 18 colon-named skills. Slash commands are unchanged (`/autopilot:pr-review` was already the dash-normalized display name), but any external deep link into a `skills/<name>:<name>/` path must be updated.
- The generated `agent-skills/` layout and its `export:skills` pipeline are gone — the `skills/` directory itself is the portable layout, synced verbatim by [`agents-skills-sync`](../../.github/actions/agents-skills-sync/MIGRATING.md) (see that action's migration notes for consumer-repo cleanup).

## From 0.2.0 to 0.3.0

### New features

- New `issue-create` skill (`/autopilot:issue-create`) for filing GitHub issues with a structured body (Context / What / Why / Scope / Solution) and curated labels. Titles are plain business descriptions — no convention prefixes.

### Breaking changes

- None.

## From 0.X.0 to 0.Y.0

### Breaking changes

- ...

## From 0.3.0 to 1.0.0

### Breaking changes

- removed the parallel_fanout and review_model_overrides action inputs

## From 1.19.0 to 2.0.0

### Breaking changes

- expert review no longer gates planning. plan skips it unless --experts-review is passed; linear-plan stores plans unconditionally with no ExitPlanMode and no score check; the 98 scoring target and three-pass revision budget are removed from the shared pipeline; the recorded score line format changed to `Score: <N>/100 · weakest: <dimension>`.

## From 2.0.0 to 3.0.0

### Breaking changes

- /autopilot:linear-plan no longer runs the expert-review panel by default; pass --experts-review to keep the previous always-review behavior. Plans stored without the flag record Score: skipped in the stored header.
- the plugin no longer ships a linear MCP server. Connect

## From 3.1.0 to 4.0.0

### Breaking changes

- the four migrated agents emit bare JSON objects instead of markdown blocks, expert-review drops revision.rescore and derives score from its dimensions, and stored plan Score: lines record per-reviewer verdicts instead of a single average

## From 4.2.2 to 5.0.0

### Breaking changes

- _Document migration steps here._
