# The linear-run skill

> Chapter 17 of the [repository docs](../README.md#repository-docs).

[Linear-run](../claude-plugins/autopilot/skills/linear-run/SKILL.md) fetches a ticket once through MCP, selects a valid stored plan or a fresh run-local plan, and implements through run's delivery chain. The resolved ticket is reused by gather-context; a successful MCP read does not introduce an API-key requirement.

## Plan selection

Check anchor, supported version, required sections, then verify lines. Missing, version-mismatch, malformed, and unverifiable select fresh-plan mode with explicit diagnostics. Valid selects stored-plan mode. Writers emit v2 with Context evidence; readers accept v1 without it. Neither mode silently rewrites the ticket.

## Targeted context

Stored-plan files and steps seed current source investigation. Read relevant implementations, dependencies, tests, and standards; expand only for an identified gap. Durable evidence is a retrieval guide, not proof of current validity. Explicit `--brief <path>` additionally permits validated repository context reuse. Fresh-plan mode uses normal task gathering.

## Enforcing the context source

The `context-source:` selection remains required before traversal. Graphify additionally requires `graphify-trace:` with `queries=1` or more and a nonempty `graphify-shortlist:`. Without evidence, stop with `Context phase failed on <LINEAR-ID>: gather-context declared graphify with no query evidence.` The absence of any selection stops with `Context phase failed on <LINEAR-ID>: gather-context returned no context-source selection.` Fresh acquisition replaces session-scoped handles.

## Drift is reported, not enforced

Report base and path drift before execution; drift alone is not a plan-source verdict. Strip file line suffixes and ignore `(new)` paths when checking existence. Execute stored steps verbatim and in order; if a step cannot be performed or conflicts with a current binding rule, stop and report rather than silently altering it.

## Execution

Track Gather context, Establish execution plan, Implement and verify, Deliver PR. Stored selection, validation, and freezing do not generate separate progress calls. Fresh mode writes one plan without a scoring/review loop. Both preserve verification restrictions, source boundaries, and the standard commit/PR/monitor chain.

The [graph evidence contract guard](../.github/actions/code-review-action/src/graphifyEvidenceContract.test.ts) checks the source-selection boundary; it does not establish runtime behavior.
