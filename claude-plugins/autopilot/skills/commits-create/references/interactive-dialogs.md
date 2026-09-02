# Interactive dialogs

Reference for [`commits-create/SKILL.md`](../SKILL.md) — the dialogs that exist only when `autopilotMode` is false, plus the contract governing them. Read it at the moment one of those dialogs is reached. Under `--autopilot` none of them runs, so this file stays unread and its bytes stay out of the conversation.

## AskUserQuestion contract

**Autopilot bypass:** When `autopilotMode` is true (from [Phase 1](../SKILL.md#phase-1-check-for-changes)), this contract is moot — the strategy prompt is skipped and a validation failure aborts instead of prompting. Generate the commit message(s), commit directly, and exit without prompting.

The rules below govern two dialogs, and both MUST follow them:

- the [Phase 3](../SKILL.md#phase-3-choose-commit-strategy) commit-strategy prompt — a plain choice, no `preview`;
- the [validation failure dialog](#validation-failure-dialog) — reached only when three attempts fail to compose a valid message, and the one place a commit message is ever shown for review.

[Phase 1](../SKILL.md#phase-1-check-for-changes) may also ask which files to stage when the working tree has unstaged changes. That is a file-selection question rather than content presented for review, so this contract does not govern it.

A generated commit message is never presented for approval on the success path; [Commit Message Validation](../SKILL.md#commit-message-validation) is what gates it.

Read [`askuserquestion-contract.md`](../../shared-rules/references/askuserquestion-contract.md) and apply it to both dialogs. In this skill, `preview` belongs to the [validation failure dialog](#validation-failure-dialog) only — the strategy prompt is a plain choice and takes no `preview`.

## Phase 3 commit-strategy prompt

Reached only from [Phase 3](../SKILL.md#phase-3-choose-commit-strategy), and only when the analyzer reported `singleCommitRecommended: false` **and** the changes represent genuinely distinct areas. Read [`askuserquestion-format.md`](../../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

Tool parameters:

- `question`: "How would you like to commit these changes?"
- `header`: "Commit strategy"
- `options`: [
  { label: "Single commit (Recommended)", description: "One commit with a comprehensive message" },
  { label: "Separate commits", description: "Create N atomic commits by category" }
  ]
- `multiSelect`: false

"Separate commits" continues to [Phase 4](../SKILL.md#phase-4-execute-commits) with the grouped flow; "Single commit" continues there with the single-commit flow.

## Validation failure dialog

The single interactive escape hatch in this skill, shared by the [Phase 4](../SKILL.md#phase-4-execute-commits) WHAT-not-WHY check and the 3-attempt validation failure above. Because the success path no longer shows the user a message, this dialog is the only place one is ever presented — so use it verbatim rather than improvising a prompt, and obey the [AskUserQuestion contract](#askuserquestion-contract).

**Interactive mode only.** When `autopilotMode` is true, neither caller opens it: abort loudly with the failing rule(s), leave the index untouched, and create no partial commit.

Substitute `<commit message>` with the failing message followed by a blank line and a `Fails: <rule> — <what is wrong>` line, identically on both options.

Tool parameters:

- `question`: "The generated commit message still fails validation. Choose an action."
- `header`: "Invalid message"
- `options`: [
  { label: "Reword", description: "Provide a corrected commit message", preview: "<commit message>" },
  { label: "Cancel", description: "Abort commit creation", preview: "<commit message>" }
  ]
- `multiSelect`: false

If "Reword" is selected, take the user's message and re-run the whole of [Commit Message Validation](../SKILL.md#commit-message-validation) on it — a hand-typed subject is validated too, never committed unchecked — reopening this dialog while it fails. If "Cancel" is selected, abort with "Commit cancelled." and create no commit; in the grouped flow, abort every remaining commit with "Commits cancelled."
