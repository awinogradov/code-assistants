# pr-update — worked examples

Full worked examples for the [`pr-update`](../SKILL.md) skill, each showing the complete AskUserQuestion calls with the full preview string on every option.

### Basic update after new commits

```
User: /update-pr

Detecting PR for current branch...
Found PR #42: Allow editor theme selection per workspace

Gathering context...
- 5 commits since main
- 8 files changed
```

AskUserQuestion with:

- `question`: "Updating PR #42. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

AskUserQuestion with:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Apply changes to PR #42", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Edit content", description: "Modify title or description", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" },
  { label: "Cancel", description: "Keep the PR unchanged", preview: "Allow editor theme selection per workspace\n\nUsers can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.\n\n- Added editor_theme per-workspace setting\n- Falls back to the system theme if no preference is set\n- Added validation for theme names\n\n---\n\n**Issues:**\n\nCloses #749" }
  ]

User selects "Update PR".

```
✓ Updated PR #42: https://github.com/org/repo/pull/42
```

### Update with release notes added

**Branch:** `issue-200-password-reset`

AskUserQuestion with:

- `question`: "Updating PR #15. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

AskUserQuestion with:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Apply changes to PR #15", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" },
  { label: "Add release notes", description: "Generate a release notes section for the changelog", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" },
  { label: "Edit content", description: "Modify title or description", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" },
  { label: "Cancel", description: "Keep the PR unchanged", preview: "Implement password reset flow\n\nAdded password reset functionality with email verification and token expiration.\n\n- Reset tokens expire after 30 minutes\n- Rate-limited to 3 requests per hour per user\n\n---\n\n**Issues:**\n\nCloses #200" }
  ]

Meaningful changes detected (feat: commits). "Add release notes" option shown.

User selects "Add release notes". Notes generated and inserted. Re-presented with preview for confirmation.

User selects "Update PR".

```
✓ Updated PR #15: https://github.com/org/repo/pull/15
```

---

### Update with non-meaningful changes only

**Branch:** `issue-300-update-docs`

AskUserQuestion with:

- `question`: "Updating PR #45. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

AskUserQuestion with:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: [
  { label: "Update PR", description: "Apply changes to PR #45", preview: "Update API documentation for v2 endpoints\n\nUpdated OpenAPI specs and usage examples for the v2 billing endpoints.\n\n- Corrected request/response schemas\n- Added rate limiting documentation\n\n---\n\n**Issues:**\n\nCloses #300" },
  { label: "Edit content", description: "Modify title or description", preview: "Update API documentation for v2 endpoints\n\nUpdated OpenAPI specs and usage examples for the v2 billing endpoints.\n\n- Corrected request/response schemas\n- Added rate limiting documentation\n\n---\n\n**Issues:**\n\nCloses #300" },
  { label: "Cancel", description: "Keep the PR unchanged", preview: "Update API documentation for v2 endpoints\n\nUpdated OpenAPI specs and usage examples for the v2 billing endpoints.\n\n- Corrected request/response schemas\n- Added rate limiting documentation\n\n---\n\n**Issues:**\n\nCloses #300" }
  ]

No meaningful changes (docs: commits only). "Add release notes" option not shown.

User selects "Update PR".

```
✓ Updated PR #45: https://github.com/org/repo/pull/45
```

### Basic update after new commits (abbreviated for readability)

```
User: /update-pr

Detecting PR for current branch...
Found PR #42: Allow editor theme selection per workspace

Gathering context...
- 5 commits since main
- 8 files changed
```

[Phase 4](../SKILL.md#phase-4-ask-user-for-context-optional) AskUserQuestion with:

- `question`: "Updating PR #42. Would you like to highlight anything specific in the updated description?"
- `header`: "PR context"

User selects "Auto-generate".

[Phase 6](../SKILL.md#phase-6-verify-with-user) AskUserQuestion parameters:

- `question`: "Review the updated pull request and choose an action."
- `header`: "Update PR"
- `options`: `Update PR` / `Add release notes` / `Edit content` / `Cancel`, with the descriptions listed in [Phase 6](../SKILL.md#phase-6-verify-with-user)
- `multiSelect`: false

Preview (every option carries this same full preview string):

```
Allow editor theme selection per workspace

Users can now pick an editor theme per workspace. This makes long review sessions easier on the eyes and matches the rest of their IDE.

- Added editor_theme per-workspace setting
- Falls back to the system theme if no preference is set
- Added validation for theme names

---

**Issues:**

Closes #749
```

User selects "Update PR".

```
✓ Updated PR #42: https://github.com/org/repo/pull/42
```
