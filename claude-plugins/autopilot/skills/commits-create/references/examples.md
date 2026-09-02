# Examples

Reference for [`commits-create/SKILL.md`](../SKILL.md) — worked call sites for the single, grouped, and failure paths. Read it when a call site is ambiguous; the message shape itself is in [Commit Message Format](../SKILL.md#commit-message-format).

## Single Commit

```
feat(auth): add jwt token refresh endpoint

- Added /auth/refresh endpoint that issues new access token from refresh token
- Added 7-day expiry validation for refresh tokens
- Returns 401 with "refresh_expired" code when token is past expiry
```

```
fix(api): return 404 instead of 500 for missing user lookup

- Changed UserService.findById to return null instead of throwing
- Added explicit 404 response in GET /users/:id handler
```

```
docs: add environment variables reference to readme
```

## Grouped Commits

```
Analyzing staged changes...

Detected 3 categories:
- impl: 3 files (auth.ts, auth.types.ts, index.ts)
- test: 1 file (auth.test.ts)
- docs: 2 files (docs/auth.md, docs/api-reference.md)

How would you like to commit these changes?
```

User selects "Separate commits" via AskUserQuestion tool — the one prompt in this flow, because the analyzer recommends a strategy but does not decide it.

Every category's message is then generated and validated upfront, and the commits are created in category order with no further prompting:

```
✓ Created commit: feat(auth): implement jwt validation
✓ Created commit: test(auth): add jwt validation tests
✓ Created commit: docs: update authentication documentation

All 3 commits created successfully.
```

## Single Category (No Grouping Offered)

```
Analyzing staged changes...

All changes are in 1 category (impl).
```

No strategy prompt and no message confirmation — the message is generated, validated, and committed:

```
✓ Created commit: feat(auth): implement jwt validation
```

## With an existing PR

After committing on a branch that already has a PR, [Phase 5](../SKILL.md#phase-5-update-pr) refreshes it without asking:

```
✓ Created commit: feat(auth): add password reset flow
✓ Updated PR #15: https://github.com/org/repo/pull/15
```

On a branch with no PR, the skill finishes at the commit and says nothing about pull requests.

## Validation failure

When three attempts still produce an invalid message, the [validation failure dialog](./interactive-dialogs.md#validation-failure-dialog) is the one place a message is shown for review:

AskUserQuestion with:

- `question`: "The generated commit message still fails validation. Choose an action."
- `header`: "Invalid message"
- `options`: [
  { label: "Reword", description: "Provide a corrected commit message", preview: "feat(auth): add JWT refresh endpoint\n\n- Added /auth/refresh endpoint\n\nFails: subject-case — the subject must be all lowercase" },
  { label: "Cancel", description: "Abort commit creation", preview: "feat(auth): add JWT refresh endpoint\n\n- Added /auth/refresh endpoint\n\nFails: subject-case — the subject must be all lowercase" }
  ]

User selects "Reword" and supplies `feat(auth): add jwt refresh endpoint`. It is re-validated, passes, and is committed.

In autopilot mode the same failure aborts loudly instead, leaving the staged state untouched.
