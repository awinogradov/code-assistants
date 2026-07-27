# Planning pipeline: draft, review, finalize

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md). Defined once here so the two callers cannot drift.

Everything below runs **after** [`gather-context`](../../gather-context/SKILL.md) has returned the Context Map. That map is the codebase read: reason over it rather than re-reading the tree. Reach for an extra lookup only when the map is genuinely missing something the work turns on — a targeted `mcp__repomix__grep_repomix_output` against the map's `outputId`, or a live Grep/Read for working-tree code the snapshot cannot show — then fold the result back into the map.

Resolve the three stack values from [stack-deltas.md](stack-deltas.md) wherever a step says "your stack's delta".

## Draft plan (task 3)

Set task 3 ("Draft plan") to `in_progress`.

Assemble a complete draft before review and scoring, so both operate on a concrete artifact instead of an imagined one. Leave `Score:` as a placeholder — the review step fills it.

Draft the smallest reliable solution that satisfies the steelmanned intent: reuse what the Context Map already shows over adding, and prefer the option with the fewest moving parts that still holds. Every step must trace to that intent — no unrequested abstraction, no configurability nobody asked for, no error handling for states that cannot occur, and no opportunistic refactor of adjacent code. Where a simpler option was rejected because it would not hold, say so in a clause rather than leaving the larger design unexplained. Minimality is a drafting constraint, not only a scoring one: the review step spends a single capped revision pass, which cannot reliably strip scope a draft has already committed to.

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
Score: [filled by the review step — leave as a placeholder in the draft]

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

Set task 3 to `completed`.

## Review and score (task 4)

Set task 4 ("Review and score") to `in_progress`.

Expert review and scoring are **one step**. Reviewers already return per-dimension scores, so a second self-graded rubric adds a loop without adding information.

Select experts from your stack's expert table — always the Pre-mortem Analyst, then 2-3 more by task scope. Launch them **in parallel** (single message, multiple Agent tool calls):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:expert-review"
- `prompt`: "You are a [Expert Role]. Review this implementation plan.
  Focus areas: [from your stack's expert table].
  Scoring target: 95+.
  Limit your report to the 3–5 strongest findings — depth over breadth.

  [Context Map excerpt: relevant files, patterns, key types, test conventions, applicable standards]

  [full plan text from the draft]"
- `description`: "Expert review: [Role]"
```

Pass the Context Map excerpt, not just the plan text. A reviewer with no view of the repository infers file contents, and an invented finding is worse than a missing one.

Each returns JSON (`expertRole`, `score`, `dimensions`, `verdict`, `findings`, `revision`). Aggregate:

1. **Score** — average each reviewer's `dimensions` into the five-dimension rubric below, 20 points each, 100 total.

   | Dimension        | Criteria                                                                                                                            |
   | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
   | **Alignment**    | Follows CLAUDE.md, project patterns, naming conventions, and complies with Accepted RFCs / `docs/` conventions                      |
   | **Completeness** | All requirements addressed, no missing steps                                                                                        |
   | **Type Safety**  | Proper types, Zod schemas, no unsafe `as` assertions                                                                                |
   | **Testability**  | Clear test strategy, edge cases identified                                                                                          |
   | **Simplicity**   | Minimal code, reuses existing functions, no over-engineering, every change traces to steelmanned intent, no opportunistic refactors |

2. **Revise once.** If the aggregate is below 95, apply the findings to the draft and re-score — a **single** capped pass, never a loop. Ask via `AskUserQuestion` only when a weak dimension hinges on a material ambiguity the Context Map cannot settle.

3. **Report honestly.** If the revised plan still scores below 95, record the actual score and name the weak dimension in the plan. Never inflate a score to clear the target.

Do not include raw expert JSON in the plan output.

Set task 4 to `completed`.

## Finalize (task 5)

Set task 5 ("Finalize plan") to `in_progress`.

Apply the aggregated findings and score to the draft, then write the plan file, replacing the `Score:` placeholder with `Score: [X]/100`.

Apply the reference-formatting rules (RFC-0001, inlined at the end of the calling skill) to every reference the plan contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

Set task 5 to `completed`.
