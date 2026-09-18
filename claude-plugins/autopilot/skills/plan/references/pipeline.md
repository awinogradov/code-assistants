# Planning pipeline: draft and finalize

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md). Defined once here so the two callers cannot drift.

Everything below runs **after** [`gather-context`](../../gather-context/SKILL.md) has returned the Context Map. That map is the codebase read: reason over it rather than re-reading the tree. Reach for an extra targeted `Grep`/`Read` only when the map is genuinely missing something the work turns on, and fold the result back into the map.

Resolve the two stack values from [stack-deltas.md](stack-deltas.md) wherever a step says "your stack's delta".

## Draft plan

Track draft and finalization as the single Write plan outcome. Assemble a complete draft before finalizing, so the written plan is a concrete artifact instead of an imagined one.

Draft the smallest reliable solution that satisfies the steelmanned intent: reuse what the Context Map already shows over adding, and prefer the option with the fewest moving parts that still holds. Every step must trace to that intent — no unrequested abstraction, no configurability nobody asked for, no error handling for states that cannot occur, and no opportunistic refactor of adjacent code. Where a simpler option was rejected because it would not hold, say so in a clause rather than leaving the larger design unexplained. Minimality is a drafting constraint: nothing later strips scope a draft has already committed to, so the draft is where scope is decided.

Work these dimensions against the Context Map as you draft. They are analysis, not a second crawl:

| Dimension        | Key Questions                                             |
| ---------------- | --------------------------------------------------------- |
| **Architecture** | Where does this fit? What modules are affected?           |
| **Patterns**     | What existing patterns to follow? Check similar code.     |
| **Data Flow**    | How does data move? What's the source of truth?           |
| **Types**        | What interfaces/schemas exist? What needs Zod validation? |
| **Edge Cases**   | What could fail? Null states? Race conditions?            |

The template begins with `# <Title>` — see the **Plan File Header** rule in the calling skill for title derivation and section ordering. For a change with structure worth showing, generate the diagrams per the calling skill's **Visualize with ASCII Schemas** rule and embed each one inline in the section it explains, beside the relevant step, file entry, or data-flow line.

```
# <Title>

## Summary
[1-2 sentences: what and why]
Steelmanned intent: [verbatim from the Steelmanned Intent block]

## Implementation Steps

One numbered step per action, written as an imperative naming the file it touches and what changes there. Every step MUST include a `verify:` line — an observable check (test name, command, or behavior). Follow your stack's verify examples as the pattern. Reasoning belongs in `## Summary`; a step that explains itself instead of stating an action is prose, not a step. Use no checkboxes — the plan file is read, not ticked off.

## Files
- `path/to/file.ts:NN` - [what changes]
- `path/to/new.ts` - [purpose] (new)

## Post-Implementation

Once every step above is done and verified:

1. Update any `README.md`, `docs/*`, and `rfc/*` this change affects, so the documented source of truth stays current. Editing the content of an Accepted RFC also means bumping its `version` frontmatter and adding a Changelog entry.
2. Then decide what to do with the work: commit it, open a pull request, or stop here.
```

The template is prose because the plan file is what the reader approves — see the **Plan file is output, not instructions** rule in the calling skill. Both callers replace step 2 with their own machinery: `plan` asks in its post-implementation handoff phase, `run` runs the automated chain in [`run/SKILL.md`](../../run/SKILL.md) instead of asking.

## Finalize

Write the plan file from the draft. The draft is the plan: no review pass, no score, and no revision loop sits between the two, so a draft that is complete and verifiable is finished the moment it is written.

Apply the reference-formatting rules (RFC-0001, linked by the calling skill) to every reference the plan contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
