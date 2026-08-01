# issue:create — worked examples

Full worked examples for the [`issue:create`](../SKILL.md) skill, each showing the complete AskUserQuestion call with the full preview string on every option.

### Example 1: No arguments — prompts for hint

```
/autopilot:issue-create
```

Skill prompts via AskUserQuestion: "What is this issue about?" — user types `Audio drops when many clients connect`.

After Phases 1-6, AskUserQuestion with:

- `question`: "Review the issue details and choose an action."
- `header`: "Create issue"
- `options`: [
  { label: "Create issue", description: "Create this GitHub issue", preview: "Audio playback drops when multiple clients connect\n\n## Context\n\nThe playback layer was last audited two quarters ago; recent client-load tests show audible dropouts at 8+ concurrent sessions.\n\n## What\n\nIdentify and fix the source of audio dropouts in multi-client playback. Add a regression test covering ≥ 8 concurrent clients.\n\n## Why\n\nReviewers depend on clean audio for plan readbacks. Dropouts force a rerun, doubling review time per plan.\n\n## Scope\n\n- **In scope:**\n - Root-cause investigation of dropouts at high concurrency\n - Fix and regression test\n- **Out of scope:**\n - _None — this is the entire change._\n\n## Solution\n\nProfile the playback path under load to identify the bottleneck, then apply the smallest fix that holds 8+ concurrent sessions without dropouts.\n\nLabels: bug, audio" },
  { label: "Edit content", description: "Modify title, body, or labels", preview: "Audio playback drops when multiple clients connect\n\n## Context\n\nThe playback layer was last audited two quarters ago; recent client-load tests show audible dropouts at 8+ concurrent sessions.\n\n## What\n\nIdentify and fix the source of audio dropouts in multi-client playback. Add a regression test covering ≥ 8 concurrent clients.\n\n## Why\n\nReviewers depend on clean audio for plan readbacks. Dropouts force a rerun, doubling review time per plan.\n\n## Scope\n\n- **In scope:**\n - Root-cause investigation of dropouts at high concurrency\n - Fix and regression test\n- **Out of scope:**\n - _None — this is the entire change._\n\n## Solution\n\nProfile the playback path under load to identify the bottleneck, then apply the smallest fix that holds 8+ concurrent sessions without dropouts.\n\nLabels: bug, audio" },
  { label: "Cancel", description: "Abort issue creation", preview: "Audio playback drops when multiple clients connect\n\n## Context\n\nThe playback layer was last audited two quarters ago; recent client-load tests show audible dropouts at 8+ concurrent sessions.\n\n## What\n\nIdentify and fix the source of audio dropouts in multi-client playback. Add a regression test covering ≥ 8 concurrent clients.\n\n## Why\n\nReviewers depend on clean audio for plan readbacks. Dropouts force a rerun, doubling review time per plan.\n\n## Scope\n\n- **In scope:**\n - Root-cause investigation of dropouts at high concurrency\n - Fix and regression test\n- **Out of scope:**\n - _None — this is the entire change._\n\n## Solution\n\nProfile the playback path under load to identify the bottleneck, then apply the smallest fix that holds 8+ concurrent sessions without dropouts.\n\nLabels: bug, audio" }
  ]

User selects "Create issue".

```
✓ Created issue: https://github.com/org/repo/issues/142
```

### Example 2: Title hint with related prior work

```
/autopilot:issue-create "users cannot reset password via email"
```

[Phase 3](../SKILL.md#phase-3-find-related-issues-and-prs) finds one closed issue #87 ("Password reset endpoint returns 500"). Included as `Related: #87 (closed)` in Context.

AskUserQuestion with:

- `question`: "Review the issue details and choose an action."
- `header`: "Create issue"
- `options`: [
  { label: "Create issue", description: "Create this GitHub issue", preview: "Users cannot reset password via email\n\n## Context\n\nUsers report that the email-based password reset flow no longer sends the reset link. We saw a similar regression last quarter (#87) but the root cause then was server-side; this looks like the email service hook.\n\nRelated: #87 (closed)\n\n## What\n\nRestore the email-based password reset flow. The reset link email must be sent within 30 seconds of the user submitting the reset form.\n\n## Why\n\nLocked-out users have no self-service recovery path right now — every reset goes through support. Support load is up 3× this week.\n\n## Scope\n\n- **In scope:**\n - Diagnose why the reset email is not sent\n - Restore delivery within the 30-second SLA\n - Add a smoke test that exercises the full reset flow\n- **Out of scope:**\n - Rewriting the email template\n - SMS-based reset (separate issue)\n\n## Solution\n\nTrace the reset request from the form submission through the auth service to the email queue. Most likely culprit is the new mail-queue routing key introduced last week. Roll back the routing change if confirmed, otherwise patch the queue binding.\n\nLabels: bug, auth" },
  { label: "Edit content", description: "Modify title, body, or labels", preview: "Users cannot reset password via email\n\n## Context\n\nUsers report that the email-based password reset flow no longer sends the reset link. We saw a similar regression last quarter (#87) but the root cause then was server-side; this looks like the email service hook.\n\nRelated: #87 (closed)\n\n## What\n\nRestore the email-based password reset flow. The reset link email must be sent within 30 seconds of the user submitting the reset form.\n\n## Why\n\nLocked-out users have no self-service recovery path right now — every reset goes through support. Support load is up 3× this week.\n\n## Scope\n\n- **In scope:**\n - Diagnose why the reset email is not sent\n - Restore delivery within the 30-second SLA\n - Add a smoke test that exercises the full reset flow\n- **Out of scope:**\n - Rewriting the email template\n - SMS-based reset (separate issue)\n\n## Solution\n\nTrace the reset request from the form submission through the auth service to the email queue. Most likely culprit is the new mail-queue routing key introduced last week. Roll back the routing change if confirmed, otherwise patch the queue binding.\n\nLabels: bug, auth" },
  { label: "Cancel", description: "Abort issue creation", preview: "Users cannot reset password via email\n\n## Context\n\nUsers report that the email-based password reset flow no longer sends the reset link. We saw a similar regression last quarter (#87) but the root cause then was server-side; this looks like the email service hook.\n\nRelated: #87 (closed)\n\n## What\n\nRestore the email-based password reset flow. The reset link email must be sent within 30 seconds of the user submitting the reset form.\n\n## Why\n\nLocked-out users have no self-service recovery path right now — every reset goes through support. Support load is up 3× this week.\n\n## Scope\n\n- **In scope:**\n - Diagnose why the reset email is not sent\n - Restore delivery within the 30-second SLA\n - Add a smoke test that exercises the full reset flow\n- **Out of scope:**\n - Rewriting the email template\n - SMS-based reset (separate issue)\n\n## Solution\n\nTrace the reset request from the form submission through the auth service to the email queue. Most likely culprit is the new mail-queue routing key introduced last week. Roll back the routing change if confirmed, otherwise patch the queue binding.\n\nLabels: bug, auth" }
  ]

User selects "Create issue".

```
✓ Created issue: https://github.com/org/repo/issues/143
```

### Example 4: Repo with zero labels

```
/autopilot:issue-create "tidy up README badges"
```

`gh label list` returns `[]`. [Phase 6](../SKILL.md#phase-6-suggest-labels) selects no labels. [Phase 7](../SKILL.md#phase-7-verify-with-user) preview shows `Labels: (none)`. [Phase 8](../SKILL.md#phase-8-create-issue) omits the `--label` flags entirely:

```bash
printf '%s' "$body" | gh issue create --repo org/repo --title "Tidy up README badges" --body-file -
```

```
✓ Created issue: https://github.com/org/repo/issues/145
```

### Example 5: Duplicate detected — user cancels

```
/autopilot:issue-create "add password reset"
```

[Phase 3](../SKILL.md#phase-3-find-related-issues-and-prs) finds open issue #200 ("Add password reset flow") with > 80% title overlap. [Phase 7](../SKILL.md#phase-7-verify-with-user) prepends a warning line to every preview:

```
Possible duplicates: #200 (Add password reset flow)

Add password reset flow for email-based auth

## Context

<...>
```

User selects "Cancel".

```
Issue creation cancelled. Consider commenting on #200 instead.
```
