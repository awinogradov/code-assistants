# Store a Linear plan

Read only when writing a finalized plan to a Linear ticket. Caller supplies stored-by attribution and whether title refresh/AI Ready transition apply. Always re-read the current description before writing; gathering data is not a substitute.

### The stored plan format

The plan's own sections, demoted one level under a single `## Implementation plan` anchor. The trailing markers make the format machine-readable, so a guard can parse it from this file rather than from a copy — the same convention [`explore`](../../explore/SKILL.md) uses for its context brief:

```text
## Implementation plan

Format: v2 · Base: <origin/main SHA> · Stored by /autopilot:linear-plan

### Summary              <- required
### Implementation Steps <- required
### Files                <- required
### Context evidence     <- required
### Pre-Implementation   <- caller-owned
### Post-Implementation  <- caller-owned
```

Section names are the plan file's own, demoted from `##` to `###`, so mapping a stored section back to the plan it came from needs no translation table.

All six sections are written, because a human reading the ticket should see the whole plan. The two marked caller-owned are written but **not** for [`linear-run`](../../linear-run/SKILL.md) to consume: branch creation and the post-implementation chain belong to the skill doing the running, which supplies its own. Marking them is what lets a guard prove the reader ignores them.

Readers accept legacy `v1` without Context evidence and `v2` with it. Never upgrade a stored ticket merely by reading it. `Format: v2` is the field that lets a later template revision be told apart from a corrupt description. `Base:` records the tree the plan was drafted against; it is information for a later reader, not a gate. Plans stored by earlier versions carry an additional `Score:` field between `Format:` and `Base:`; the reader never parsed it, so those plans stay valid.

### The emission template

The marker list above is the machine-readable contract between this skill and its reader; the block below is the literal text the store writes. Emit it verbatim: replace only the `<angle-bracket>` placeholders and leave every other byte — the anchor line, the header line, each `###` heading, their order, and the blank-line layout — exactly as written. The `<- required` / `<- caller-owned` annotations belong to the contract list alone and never appear in a stored description.

```text
## Implementation plan

Format: v2 · Base: <sha> · Stored by /autopilot:linear-plan

### Summary

<the plan's Summary body, including its Steelmanned intent line>

### Implementation Steps

<the plan's numbered steps, each keeping its verify: line>

### Files

<the plan's file list>

### Context evidence

<recorded revision, durable source paths and relationships, applicable constraints, and completeness>

### Pre-Implementation

<the plan's branch outcome, stated as prose>

### Post-Implementation

<the plan's post-implementation prose>
```

Fill rules:

- Context evidence comes from the Context Map: record the actual inspected revision (HEAD plus dirty-path disclosure when applicable), up to ten source paths with their relationship to the steps, and applicable convention clauses with conditions/exceptions. Preserve overflow and errors; missing evidence is explicitly incomplete, never implied complete. Link source files at the recorded revision when possible. Omit session-scoped `outputId` values and transient tool handles. These records guide later retrieval; they do not exempt the executor from current-code or current-standards checks.

- `<sha>` — the full SHA exactly as `git rev-parse origin/main` printed it; never abbreviate or reconstruct it.
- Each section placeholder — that section's body from the finalized plan file, demoted headings included, adjusted only as far as the Linear-safe markdown rules below require.

**The first-store wrapper.** On a first store over a non-empty description ([The write](#the-write), second case), the prior body is wrapped in the same collapsible form [`linear-create`](../../linear-create/SKILL.md) uses for its original-prompt preamble, emitted literally as:

```text
+++ Original task

<the prior description, byte-identical>

+++
```

then a blank line, then the filled template above. The title is exactly `Original task`. The prior description is inserted byte-identical and treated as opaque — never reworded, re-linked, or rewritten into the Linear-safe forms below, because it is preserved text, not authored text. A read-back shows `>>> Original task … >>>`; that fence normalization is why the write anchors on the heading and never on the fence.

### Linear-safe markdown

Linear's editor accepts most Markdown on input ([editor reference](https://linear.app/docs/editor)) but normalizes several author forms when it saves, so a stored description reads back byte-identical only when it is written in the canonical forms. Section bodies filled into the template use only:

- `###`/`####` headings — the anchor and section headings come from the template itself
- `*` bullets and `1.` numbered lists — never `-` or `+` bullets, which Linear rewrites to `*`
- `**bold**` and `*italic*` — never `_underscore emphasis_`, which Linear rewrites to `*`
- inline code and fenced code blocks (`text`-tagged fences for ASCII diagrams)
- plain URLs and `[text](url)` links
- `+++ Title` … `+++` as the only collapsible form — Linear stores it as `>>> Title … >>>`, which is why reads never match the fence

Never emit HTML (`<details>` and every other tag do not render), checkbox lists (`[]` becomes an interactive checklist, and the plan file bans checkboxes), or any construct the [editor reference](https://linear.app/docs/editor) does not list. Writing the canonical forms directly is what keeps a re-store's read-back comparable to what was written, instead of diffing against Linear's rewrites.

### The write

1. **Read the current description and title** with `get_issue`.

2. **Locate the anchor.** Search the description for a line equal to `## Implementation plan`.
   - **Anchor found** — replace from that line to the end of the description with the new block. Everything above it is preserved **byte-identical**; do not re-emit it, reformat it, or re-wrap it.
   - **No anchor, description non-empty** — wrap the entire current description in a `+++ Original task +++` collapsible, then append the new block below it.
   - **No anchor, description empty** — write the block alone. Do not emit an empty collapsible.

   Linear renders `+++ Section title` … `+++` as an initially-hidden section; `<details>` HTML does not render, which is why the fence is the only option. A description written by [`linear-create`](../../linear-create/SKILL.md) already opens with its own `+++ Original prompt +++` fence, so wrapping nests one fence inside another — which Linear renders correctly, verified against a real ticket ([Linear tracker support](https://github.com/awinogradov/code-assistants/blob/main/docs/11-linear-tracker.md)).

   **Match the anchor, never the fence.** Linear rewrites `+++ Title … +++` to `>>> Title … >>>` when it saves, so a description read back never contains the marker as written. Detect a prior store by the `## Implementation plan` heading, which survives the round-trip untouched; matching on `+++` would report every re-store as a first store and stack a second wrapper.

3. **Verify the preserved prefix.** Before writing, confirm the text above the anchor is byte-identical to what step 1 read. If it differs, abort with `Refusing to write: the preserved part of the description changed` and store nothing. Silently reformatting someone's original task text is the worst outcome available here, and it is unrecoverable.

Because the anchor is matched rather than the wrapper, re-storing on the same issue replaces only the plan and never stacks a second `+++ Original task +++`.

4. **Derive the title.** From the plan's Steelmanned Intent line, derive a candidate title under the same rules [`linear-create`](../../linear-create/SKILL.md#phase-2-generate-title-and-body) applies when it generates one — capitalized, ≤ 80 characters, no trailing period, business-focused, no prefixes. Compare it with the title step 1 read: when the candidate is a material improvement — the current title is a rough one-line prompt, a placeholder, or misstates the planned work — carry the candidate as `title` into the step 5 write; when the current title already meets those rules and states the task, omit the field entirely so the write never touches it. The refresh needs no confirmation — invoking this skill authorizes it exactly as it authorizes the store, and Linear's issue activity keeps the prior title recoverable. Record the outcome line for the output block: `✓ Title updated: <new title>` or `title unchanged`.

5. **Write** with `save_issue`, passing the issue id, the new `description`, and — when step 4 derived a candidate — the refreshed `title` in the same call, so the ticket can never end up with one field updated and the other not.

6. **On any failed or rejected write**, emit the full plan text into the transcript before reporting the failure, so the work is recoverable by hand.

7. **Move the issue to "AI Ready"** — best-effort, never blocks the store, and runs only after step 5's write succeeded: a failed or refused write performs no transition. The transition is the board's hand-off signal that the ticket is planned and execution-ready. Resolve the target state id with the Linear MCP `list_issue_statuses` tool for the issue's team, then call the Linear MCP `save_issue` tool with `{ "id": "<LINEAR-ID>", "state": "<AI Ready state>" }` — tool resolution per the [Linear MCP access](../../shared-rules/references/linear-mcp-access.md) note. On success, emit `✓ Ticket <LINEAR-ID> moved to AI Ready`; when the team has no "AI Ready" state or the state write fails, emit `issue not moved — <reason>`. Always continue — but the emitted line MUST reach the output block below, never only intermediate text.

```
✓ Plan stored on <LINEAR-ID> — <url>
  Base: <sha>

Next step:
- Run /autopilot:linear-run <LINEAR-ID> to execute it
```

Add the step 4 outcome line after the `Base:` line — `✓ Title updated: <new title>` or `title unchanged` — and the step 7 outcome line after it — `✓ Ticket <LINEAR-ID> moved to AI Ready` on success, or the `issue not moved — <reason>` line on failure — so a skipped refresh or transition is visible in the final output, not just mid-run.
