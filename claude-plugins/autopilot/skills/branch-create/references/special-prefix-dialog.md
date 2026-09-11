# Special-prefix confirmation

Read only for a special-prefix branch without `--autopilot`.

Only special-prefix branches (`--hotfix`, `--trivial`, `--maintenance`, `--proposal`, `--security`) reach this phase: their prefix and slug come from a free-form description rather than from an issue, so there is a real choice to confirm. Present branch details and confirm using **AskUserQuestion tool**.

**Preview substitution rules (MANDATORY):** The `<prefix>`, `<PREFIX>`, and `<slug>` tokens in the template below are PLACEHOLDERS. Before invoking AskUserQuestion, substitute each with the concrete value you resolved in earlier phases (e.g., `<prefix>` → `hotfix`, `<PREFIX>` → `HOTFIX`, `<slug>` → `memory-leak-editor`). NEVER pass the literal `<prefix>-<slug>\n\nType: <PREFIX>...` string — every option's `preview` must contain the fully resolved branch preview string. No shorthand (`"..."`, `"<same>"`, empty string) is permitted; always write out the full resolved preview for every option.

**One dialog template.** Tool parameters:

- `question`: "Review the branch name and choose an action."
- `header`: "Create branch"
- `options`: [
  { label: "Create branch", description: "Create and push to origin with tracking", preview: "<preview>" },
  { label: "Edit slug", description: "Modify the branch name slug", preview: "<preview>" }
  ]
- `multiSelect`: false

Both options carry the same `<preview>` content since the user is choosing an action, not content; the shared preview enables a side-by-side layout in the UI. Substitute `<preview>` with `<prefix>-<slug>\n\nType: <PREFIX>\nFrom: origin/main` — e.g. `hotfix-memory-leak-editor\n\nType: HOTFIX\nFrom: origin/main`.

Only proceed to [Phase 6](../SKILL.md#phase-6-execute) after user selects "Create branch". If "Edit slug" selected, ask for new slug and regenerate branch name.
