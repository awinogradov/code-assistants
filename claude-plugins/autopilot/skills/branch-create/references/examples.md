# Branch examples

An issue branch is created without a dialog; a special-prefix branch confirms via the one [Phase 5](../SKILL.md#phase-5-confirm-special-prefix-branch-name) template. Two worked cases below; Linear follows the issue case and the other special prefixes follow the hotfix case.

### GitHub issue (auto-generated slug)

```
/autopilot:branch-create 123

Fetching GitHub issue #123...
Title: "Add JWT token refresh endpoint for authentication service"
```

No confirmation dialog — the name is derived from the issue, so [Phase 5](../SKILL.md#phase-5-confirm-special-prefix-branch-name) is skipped and the branch is created directly.

```
✓ Branch created: issue-123-jwt-refresh
✓ Pushed to origin with tracking
```

### Special prefix (--hotfix)

```
/autopilot:branch-create --hotfix "memory leak in editor"
```

AskUserQuestion with the [Phase 5](../SKILL.md#phase-5-confirm-special-prefix-branch-name) template, both options' `<preview>` resolved to `hotfix-memory-leak-editor\n\nType: HOTFIX\nFrom: origin/main`.

User selects "Create branch".

```
✓ Branch created: hotfix-memory-leak-editor
✓ Pushed to origin with tracking
```

### Branch already exists

```
/autopilot:branch-create 123

Branch issue-123-jwt-refresh already exists locally.
```

AskUserQuestion with:

- `question`: "Branch issue-123-jwt-refresh already exists. How would you like to proceed?"
- `header`: "Conflict"
- `options`: Checkout existing / Create with suffix / Different description

User selects "Checkout existing".

```
✓ Switched to branch: issue-123-jwt-refresh
```

## Slug examples

**Examples:**

| Issue Title                                                           | Generated Slug       |
| --------------------------------------------------------------------- | -------------------- |
| "Add JWT token refresh endpoint for authentication service"           | `jwt-refresh`        |
| "Fix race condition in audio streaming when multiple clients connect" | `audio-race-fix`     |
| "Implement user preference settings page with dark mode toggle"       | `user-preferences`   |
| "Refactor database connection pooling for better performance"         | `db-pool-refactor`   |
| "Provide agent prompt to generate branch name"                        | `branch-name-prompt` |
