# Planning pipeline: draft, review, finalize

Reference for [`plan/SKILL.md`](../SKILL.md) and [`run/SKILL.md`](../../run/SKILL.md). Defined once here so the two callers cannot drift.

Everything below runs **after** [`gather-context`](../../gather-context/SKILL.md) has returned the Context Map. That map is the codebase read: reason over it rather than re-reading the tree. Reach for an extra lookup only when the map is genuinely missing something the work turns on — a targeted `mcp__repomix__grep_repomix_output` against the map's `outputId`, or a live Grep/Read for working-tree code the snapshot cannot show — then fold the result back into the map.

Resolve the three stack values from [stack-deltas.md](stack-deltas.md) wherever a step says "your stack's delta".

## Draft plan (task 3)

Set task 3 ("Draft plan") to `in_progress`.

Assemble a complete draft before review and scoring, so both operate on a concrete artifact instead of an imagined one. Leave `Score:` as a placeholder — the review step fills it.

Work these dimensions against the Context Map as you draft. They are analysis, not a second crawl:

| Dimension        | Key Questions                                             |
| ---------------- | --------------------------------------------------------- |
| **Architecture** | Where does this fit? What modules are affected?           |
| **Patterns**     | What existing patterns to follow? Check similar code.     |
| **Data Flow**    | How does data move? What's the source of truth?           |
| **Types**        | What interfaces/schemas exist? What needs Zod validation? |
| **Edge Cases**   | What could fail? Null states? Race conditions?            |

The template begins with `# <Title>` — see the **Plan File Header** rule in the calling skill for title derivation and section ordering.

```
# <Title>

## Summary
[1-2 sentences: what and why]
Steelmanned intent: [verbatim from the Steelmanned Intent block]
Score: [filled by the review step — leave as a placeholder in the draft]

<!-- For architectural/visual/UI/flow changes, embed each ASCII diagram from Skill(autopilot:ascii-schemas) inline in the section it explains — beside the relevant implementation step, file entry, or data-flow line. Do not add a standalone diagrams section; omit diagrams entirely for pure logic/refactor changes. -->

## Implementation Steps

Every step MUST include a `verify:` line — an observable check (test name, command, or behavior). Follow your stack's verify examples as the pattern.

## Files
- `path/to/file.ts:NN` - [what changes]
- `path/to/new.ts` - [purpose] (new)

## Post-Implementation

After all implementation steps and verification are complete:

1. **Update documentation (MANDATORY)** — update any `README.md`, `docs/*`, and `rfc/*` affected by these changes so the documented source of truth stays current. If a change edits the content of an Accepted RFC, bump its `version` frontmatter and add a Changelog entry (mirrors the review's CHECK-RFC-003). When an update needs a diagram, generate it via `Skill(autopilot:ascii-schemas)` and embed the output verbatim — do not hand-draw.
2. Present next actions using AskUserQuestion.

**If the implementation included user-facing changes** (feat: or fix: commits created during this session), use `--release-notes` in the "Create PR" option. Otherwise, use the plain option.

Tool parameters:
- `question`: "All changes implemented and verified. What's next?"
- `header`: "Next"
- `options`: [
  { label: "Create commit", description: "Run /autopilot:commits-create to commit changes" },
  { label: "Create PR", description: "Run /autopilot:pr-create --release-notes to open a PR with release notes" },
  { label: "Done", description: "No further action needed" }
  ]
- `multiSelect`: false

After the user selects their option:
- "Create commit": invoke `Skill(autopilot:commits-create)`
- "Create PR": invoke `Skill(autopilot:pr-create)` with the flags shown in the option description
- "Done": no further action needed
```

`run` replaces this `## Post-Implementation` block with its own automated chain — see [`run/SKILL.md`](../../run/SKILL.md).

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
