# Planning pipeline: draft, review, finalize

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md). Defined once here so the two callers cannot drift.

Everything below runs **after** [`gather-context`](../../gather-context/SKILL.md) has returned the Context Map. That map is the codebase read: reason over it rather than re-reading the tree. Reach for an extra lookup only when the map is genuinely missing something the work turns on — a targeted `mcp__repomix__grep_repomix_output` against the map's `outputId`, or a live Grep/Read for working-tree code the snapshot cannot show — then fold the result back into the map.

Resolve the three stack values from [stack-deltas.md](stack-deltas.md) wherever a step says "your stack's delta".

## Draft plan (task 3)

Set task 3 ("Draft plan") to `in_progress`.

Assemble a complete draft before review and scoring, so both operate on a concrete artifact instead of an imagined one. Leave `Score:` as a placeholder — the review step fills it.

Draft the smallest reliable solution that satisfies the steelmanned intent: reuse what the Context Map already shows over adding, and prefer the option with the fewest moving parts that still holds. Every step must trace to that intent — no unrequested abstraction, no configurability nobody asked for, no error handling for states that cannot occur, and no opportunistic refactor of adjacent code. Where a simpler option was rejected because it would not hold, say so in a clause rather than leaving the larger design unexplained. Minimality is a drafting constraint, not only a scoring one: review revises the draft it is handed, and no revision budget reliably strips scope a draft has already committed to — a pass spent arguing scope back down is a pass not spent on correctness.

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

**Expert review is an enhancement, never a gate.** It improves the plan and records the panel's assessment for the plan's readers; no caller blocks, loops, or refuses to proceed on the score.

**`plan` and `linear:plan` are the only callers that may skip this step.** Each runs the review only when the user passed `--experts-review` (stripped by the mode-flags pre-step in [input-detection.md](input-detection.md#mode-flags)) — `plan` because its approval gate puts a human in front of the finished plan either way, and `linear:plan` because the teammate reading the stored ticket is that human, and the recorded skip tells them the plan is unreviewed. The `run` family — `run`, `run-primed`, and `linear:run`'s fresh-plan path — runs the step unconditionally, because no human re-reads its plans, so for those callers the skip path is unreachable. When the review step was skipped: set task 4 to `completed` noting the skip, and finalize with the skipped `Score:` line from [Finalize](#finalize-task-5).

Select experts from your stack's expert table — always the Pre-mortem Analyst, then 2-3 more by task scope. Launch them **in parallel** (single message, multiple Agent tool calls):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:expert-review"
- `prompt`: "You are a [Expert Role]. Review this implementation plan.
  Focus areas: [from your stack's expert table].
  Limit your report to the 3–5 strongest findings — depth over breadth.

  [Context Map excerpt: relevant files, patterns, key types, test conventions, applicable standards]

  [full plan text from the draft]"
- `description`: "Expert review: [Role]"
```

Pass the Context Map excerpt, not just the plan text. A reviewer with no view of the repository infers file contents, and an invented finding is worse than a missing one.

Each returns JSON (`expertRole`, `score`, `dimensions`, `verdict`, `findings`, `grounding`, `revision`).

**Discard an ungrounded review before aggregating.** A reviewer that asserts what a file contains without having read it produces findings that are confident and wrong, which costs more than a finding it never made — so screen each panel member first and drop, rather than average, any that fails:

- Its `grounding` is absent or empty.
- Its report is not parseable as the JSON contract at all.
- It reported no tool use, yet its findings quote file contents, identifiers, or line numbers that neither the plan nor the Context Map excerpt contains. That combination is a contradiction: with no tools it could only have been given text, so anything beyond that text was invented.

Name every discard in the run — `Discarded <role>: <reason>` — and never silently shrink the panel. A single surviving reviewer is a single opinion, so say so instead of presenting its score as a panel aggregate; when nothing survives, report that the plan is unreviewed rather than emitting a score. Re-launching a discarded role once is reasonable; doing it repeatedly is not, because the same prompt tends to fail the same way.

Aggregate what survives:

1. **Score** — average each reviewer's `dimensions` into the five-dimension rubric below, 20 points each, 100 total.

   | Dimension        | Criteria                                                                                                                            |
   | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
   | **Alignment**    | Follows CLAUDE.md, project patterns, naming conventions, and complies with Accepted RFCs / `docs/` conventions                      |
   | **Completeness** | All requirements addressed, no missing steps                                                                                        |
   | **Type Safety**  | Proper types, Zod schemas, no unsafe `as` assertions                                                                                |
   | **Testability**  | Clear test strategy, edge cases identified                                                                                          |
   | **Simplicity**   | Minimal code, reuses existing functions, no over-engineering, every change traces to steelmanned intent, no opportunistic refactors |

2. **Apply the findings — once.** Fold the panel's findings into the draft in a single pass: no re-running the panel, no iterating on the aggregate, no threshold to clear. Ask via `AskUserQuestion` only when a finding hinges on a material ambiguity the Context Map cannot settle.

3. **Record honestly.** Record the actual aggregate and name the weakest dimension in the plan; never inflate the number. The score informs the reader — the human at `plan`'s approval gate, or the teammate reading the ticket `linear:plan` stores — it is not a gate for any caller, and every caller proceeds on whatever the number says.

Do not include raw expert JSON in the plan output.

Set task 4 to `completed`.

## Finalize (task 5)

Set task 5 ("Finalize plan") to `in_progress`.

Apply the aggregated findings and score to the draft, then write the plan file, replacing the `Score:` placeholder with a line that records the panel's assessment:

```text
Score: <N>/100 · weakest: <dimension>
```

When the review step was skipped, there are no findings to apply; replace the placeholder with the skipped variant instead:

```text
Score: skipped · expert review disabled (invoked without --experts-review)
```

The line is deliberately a single literal: only `plan` and `linear:plan` can skip, so this exact line appearing in `run`, `run-primed`, or `linear:run` output is evidence of drift, not a valid state.

Naming the weakest dimension costs half a line and tells a later reader where the plan is soft — the aggregate alone says how good the panel thought the plan was, not what to double-check when executing it.

Apply the reference-formatting rules (RFC-0001, inlined at the end of the calling skill) to every reference the plan contains — link files, docs, skills, agents, and sections, and never leave a reference as bare text.

Set task 5 to `completed`.
