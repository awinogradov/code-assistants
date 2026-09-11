# The linear-plan skill

> Chapter 16 of the [repository docs](../README.md#repository-docs).

[Linear-plan](../claude-plugins/autopilot/skills/linear-plan/SKILL.md) drafts a plan and stores it on its ticket without implementing. It shares task resolution, explicit brief reuse, and drafting rules with plan. Progress is Gather context, Write plan, Store plan; there is no scoring or review-panel phase.

## Stored format

The canonical [storage reference](../claude-plugins/autopilot/skills/linear-plan/references/plan-storage.md) writes `Format: v2`: Summary, Implementation Steps, Files, Context evidence, Pre-Implementation, and Post-Implementation under one Implementation plan anchor. Linear-run accepts legacy `v1` plans without Context evidence; reading a ticket never upgrades it.

Context evidence records inspected revision, file relationships, applicable constraints, and incomplete coverage. It never carries a reusable session-scoped outputId. It narrows later research but does not replace current-code and standards verification. The two implementation-lifecycle sections remain caller-owned.

## How the write works

Re-read the current description immediately before writing. Replace the anchored plan while preserving the prior prefix byte-identical; first stores wrap the original task. Normalize authored Markdown only. The same write may improve a rough title; a successful store then attempts the AI Ready transition. Report both outcomes. Failures emit the full plan for recovery.

Run on a Linear issue uses the same storage procedure with its own attribution and no title refresh or AI Ready transition. Linear-run never writes a replacement stored plan.
