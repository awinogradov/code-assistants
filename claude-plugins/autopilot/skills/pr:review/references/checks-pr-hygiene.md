# PR Hygiene — pr:review check details

Full rule bodies for the **PR Hygiene** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies universally — stack is not relevant.

**CHECK-PR-010: Task ↔ solution ↔ result alignment** — Severity: suggestion

Compare three artifacts and flag divergence in each leg. Skip a leg only when its source is absent or vague (no linked issue, or empty PR body).

- **declared task** = the linked issue (requirements / acceptance criteria from the [§1.5](../SKILL.md#15-context-map) Context Map)
- **declared solution** = the PR title + body
- **exact result** = the diff

Legs:

- **task ↔ solution** — the PR's stated approach omits, contradicts, or silently re-scopes an issue requirement.
- **solution ↔ result** — a claim in the PR description is not backed by any hunk in the diff (asserted but absent). Undescribed changes present in the diff are the blocker CHECK-PR-001 below — do not double-report them here.
- **task ↔ result** — an issue requirement, or a codebase TODO referencing the issue ([§1.5](../SKILL.md#15-context-map) Related work), has no corresponding change in the diff (unaddressed); or the diff addresses something the issue never asked for (scope creep) without explanation.

**CHECK-PR-001: Diff matches PR title/description** — Severity: blocker

The actual changes must match what the PR title and description claim. No hidden changes, no scope creep, no "while I was here" additions. (Scope-creep _claims_ and unaddressed requirements are CHECK-PR-010; this is the blocker for undescribed changes present in the diff.)

**CHECK-PR-002: PR is atomic — single concern** — Severity: suggestion

PR addresses one logical change. Bug fixes shouldn't include refactoring; features shouldn't include unrelated cleanup.

**CHECK-PR-003: PR is reviewable size (<1000 lines of meaningful diff)** — Severity: suggestion

Exclude generated files, lockfiles, and config, but the meaningful code diff should be reviewable in one sitting.

**CHECK-PR-004: No merge commits in feature branch** — Severity: suggestion

Feature branches should be rebased on main, not merged. Merge commits clutter history.

**CHECK-PR-005: No "fix review" or "address feedback" commits** — Severity: suggestion

Review feedback should be squashed into the relevant original commit, not added as separate commits.

**CHECK-PR-006: No unrelated file changes** — Severity: suggestion

Files modified that have nothing to do with the PR's purpose — whitespace, import reordering, formatting in unrelated files.

**CHECK-PR-007: Description explains "why", not just "what"** — Severity: suggestion

The PR description should explain motivation and context, not just list changed files.

**CHECK-PR-008: Breaking changes called out** — Severity: blocker

Breaking changes (API changes, config format changes, removed features) must be explicitly listed in the PR description with migration steps.

**CHECK-PR-009: Release notes section present for user-facing changes** — Severity: suggestion

Feature/fix PRs affecting users should include a `**Release notes:**` section in the PR description.
