# Interactive dialogs

Reference for [`pr-update/SKILL.md`](../SKILL.md) — the two dialogs that run only in interactive mode. Read it when [Phase 4](../SKILL.md#phase-4-ask-user-for-context-optional) or [Phase 6](../SKILL.md#phase-6-verify-with-user) is reached without `--autopilot`. Every caller in the autopilot chain passes that flag, so this file normally stays unread.

Read [`askuserquestion-contract.md`](../../shared-rules/references/askuserquestion-contract.md) and apply it to the Phase 6 preview dialog — the PR content (title + body with separators) is the preview. The Phase 4 Auto-generate/Add context choice presents no content and is exempt from the preview requirement.

## Phase 4: Ask User for Context (Optional)

**Autopilot bypass:** if `--autopilot` was passed, skip this phase — proceed with auto-generation.

Use **AskUserQuestion tool** to ask if user wants to highlight anything:

**Formatting Note:** Read [`askuserquestion-format.md`](../../shared-rules/references/askuserquestion-format.md) and apply it before composing the `question` parameter.

Tool parameters:

- `question`: "Updating PR #<N>. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"
- `options`: [
  { label: "Auto-generate", description: "Generate title and description from commits and diff" },
  { label: "Add context", description: "Provide specific points to emphasize" }
  ]
- `multiSelect`: false

- If "Add context" selected: ask user for their input, then incorporate into generation
- If "Auto-generate" selected: proceed directly

## Phase 6: Verify with User

**Autopilot bypass:** if `--autopilot` was passed, skip the dialog — compose the full PR content (title + body), run the [Phase 5](../SKILL.md#phase-5-generate-updated-pr-title-and-body) Title self-check, and proceed directly to [Phase 7](../SKILL.md#phase-7-push-and-update).

Present the updated PR using **AskUserQuestion tool** with preview.

1. Compose the full PR content (title + description with separators) as a single string, after running the [Phase 5](../SKILL.md#phase-5-generate-updated-pr-title-and-body) Title self-check on the title.

2. Confirm using AskUserQuestion tool:

   **Tool call structure: See AskUserQuestion Contract above. All rules are mandatory.**

   Tool parameters:
   - `question`: "Review the updated pull request and choose an action."
   - `header`: "Update PR"
   - `options`:

     **If `--release-notes` was NOT used AND no breaking changes AND meaningful changes detected:**
     [
     { label: "Update PR", description: "Apply changes to PR #<N>", preview: "<full PR content>" },
     { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "<full PR content>" },
     { label: "Edit content", description: "Modify title or description", preview: "<full PR content>" },
     { label: "Cancel", description: "Keep the PR unchanged", preview: "<full PR content>" }
     ]

     **Otherwise (flag used, breaking changes auto-added, or no meaningful changes):**
     [
     { label: "Update PR", description: "Apply changes to PR #<N>", preview: "<full PR content>" },
     { label: "Edit content", description: "Modify title or description", preview: "<full PR content>" },
     { label: "Cancel", description: "Keep the PR unchanged", preview: "<full PR content>" }
     ]

   - `multiSelect`: false

   All options use the same `preview` content (full PR title + body) since the user is choosing an action, not content. The preview enables a side-by-side layout in the UI.

3. If user selects "Add release notes":
   - Generate the **Release notes:** section (same rules as [Phase 5](../SKILL.md#phase-5-generate-updated-pr-title-and-body))
   - Insert it into the PR body between the description and issue links sections (with `---` separators)
   - Re-present the full PR content using AskUserQuestion with preview (without the "Add release notes" option)

4. If user selects "Edit content": ask what to change, regenerate, re-present

5. If user selects "Cancel": abort with "PR update cancelled."

6. Only proceed after user selects "Update PR"
