# Shared planning instructions

Read once per context holder before drafting in any planning caller; a later skill in the same context reuses this loaded contract rather than reading it again. The caller owns approval, storage, and delivery.

## Intent and clarification

This runs **after** the Context Map, deliberately. Asking before any code is read produces uninformed questions and cannot surface the informed ones.

**Steelmanned Intent** — one sentence, ≤200 characters, restating the request in its strongest form with vague language tightened. Derive it from the resolved issue title and body, the alert rule and message, or the task description. Do not invent scope the user did not request. It lands verbatim in the plan's `## Summary`.

```
### Steelmanned Intent
[one-sentence restatement of what success looks like, in the user's strongest framing]
```

**Assumptions** — up to 5 bullets, each naming an interpretation the user could disagree with (e.g. "treating this as a read-only API, not a webhook"). Write "none" if there are none.

**Open Questions** — material ambiguities that would change the design, each marked load-bearing or not. Raise every load-bearing one via `AskUserQuestion` before drafting. State "none" and proceed if there are none.

Run this once per task; reuse the caller’s existing intent and answered questions. Never manufacture a plan-approval gate for an authorized run.

### Documentation Lookup Protocol

**Scale the lookup to the task.** A small or well-understood change needs a single targeted lookup, or none. Reserve the full fan-out for tasks touching unfamiliar libraries, APIs, or recent changes.

Identify task-relevant libraries from `package.json`, the issue description, and the Context Map (see your stack's example libraries in [stack-deltas.md](stack-deltas.md)). Use Context7 for current library documentation when repository instructions require it. Start with one authoritative source per unresolved question; use Ref, Exa, or Perplexity only when the first source leaves a named gap or the user requests broader research. Then, as the task warrants: `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` for structured docs; `mcp__Ref__ref_search_documentation` → `mcp__Ref__ref_read_url` for official references; `mcp__exa__web_search_exa` for real-world patterns and changelogs; `mcp__perplexity__search` / `mcp__perplexity__reason` for factual lookups and trade-offs. Run same-kind calls in parallel. If a source is unavailable, continue with the rest.

### Repository standards

The Context Map's **Applicable standards** section already carries the repo's conventions, the selected `rfc/` standards with status, dropped candidates, and any `principles/` values — read by [`digest-repo-standards`](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/digest-repo-standards.md) so their full text never enters this context.

Carry the actual applicable convention clauses, including conditions, exceptions, sources, and incompleteness flags, into planning decisions. IDs and relevance summaries alone are not constraints. The plan must not violate a clause of an **Accepted** RFC; a **Draft** RFC is advisory — follow it where practical and call out deliberate deviations. `principles/` values shape the approach rather than bind it; when the plan deliberately contradicts one, say so explicitly instead of leaving the conflict silent. The `pr-review` skill enforces these same standards on the resulting diff, so complying here is what stops the review blocking the change later.

The generated plan's `## Post-Implementation` block MUST require updating any `README.md`, `docs/*`, and `rfc/*` the change affects. When it edits the content of an **Accepted** RFC, it must also require bumping that RFC's `version` frontmatter and adding a Changelog entry (mirrors CHECK-RFC-003).

### Plan File Header

Every plan file MUST begin with a single `# <Title>` line on line 1, followed by a blank line. For issue inputs use the issue title verbatim (no `#<n>` prefix, no truncation); for plain descriptions paraphrase into one sentence, ≤80 characters, sentence case.

When a `## Pre-Implementation` block is emitted it sits between the title and `## Summary`; otherwise `## Summary` follows the title directly.

### Plan file is output, not instructions

The plan file is what the reader approves, so every section describes an outcome in prose: which branch gets created, what each step changes, what happens once the steps land. It carries no `AskUserQuestion` parameter block, no `Skill(...)` dispatch line, and no HTML-comment directive aimed at the agent.

The tool calls that realize those outcomes belong to the phase that runs them — [plan approval](../SKILL.md#phase-5-embed-branch-creation-and-request-approval) for the branch, [plan handoff](../SKILL.md#phase-6-post-implementation-handoff) for the handoff — and to the reference files those phases read. Stating them once there, rather than in both places, is what keeps a renamed flag from going stale in a copy nobody re-reads.

### CLAUDE.md Compliance

Map each planned change to the project rules in CLAUDE.md.

### Visualize with ASCII Schemas

Invoke `Skill(autopilot:ascii-schemas)` when the change touches architecture or module boundaries, data flow, sequence or timing, deployment topology, UI layout, or component interactions — and embed each diagram inline in the section it explains, beside the relevant step, file entry, or data-flow line. Never hand-draw; reuse the skill's output verbatim.

Skip diagrams for pure refactors with no structural change, formatting or dependency bumps, single-function logic edits, and documentation-only changes.

Honor user verification restrictions. A `verify:` line may name a deferred check; never execute a prohibited check or claim it passed. Report deferred verification at handoff.
