# The run-primed skill

> Chapter 15 of the [repository docs](../README.md#repository-docs).

[Run-primed](../claude-plugins/autopilot/skills/run-primed/SKILL.md) requires the orchestrator to place the untracked exploration brief in the checkout. It uses the same [validator](../claude-plugins/autopilot/skills/gather-context/references/brief-validation.md) and [reuse contract](../claude-plugins/autopilot/skills/gather-context/references/brief-reuse.md) as explicit brief input in other planning callers.

## Validation

Missing, malformed, revision-mismatched, and stale briefs stop the run with an actionable diagnostic. The validator checks section presence and a full base SHA before revision commands, compares against the checkout's origin/main without fetching, and verifies base ancestry. Full history is required. It never silently invokes ordinary run.

## Reuse

Ignore stale volatile sections and session-scoped snapshot handles. Compare the dependency sidecar with current branch/working-tree content. Missing or incomplete evidence makes stable prose navigation-only; retrieve current task code and missing standards before decisions. A valid base does not establish complete task standards coverage.

## When to use which

- Explore: map the repository, then make surgical edits.
- Plan/run with `--brief <path>`: explicitly reuse a supplied brief, preserving their usual approval/delivery semantics.
- Run-primed: require the conventional brief path in an orchestrator-prepared checkout; failure stays explicit.
- Linear-plan: produce a durable ticket plan.
- Linear-run: execute a valid ticket plan, otherwise draft a run-local plan.
