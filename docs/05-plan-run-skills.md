# Plan and run skills

> Chapter 5 of the [repository docs](../README.md#repository-docs).

[Plan](../claude-plugins/autopilot/skills/plan/SKILL.md) prepares an approach for approval. [Run](../claude-plugins/autopilot/skills/run/SKILL.md) plans and implements under the invocation's authorization, then reports verified no repository change or delivers a PR ready for human review.

## Resolve intent, then research

[Gather-context](../claude-plugins/autopilot/skills/gather-context/SKILL.md) reuses a matching same-invocation resolved issue or fetches it once. Stack/branch setup and pack attachment can overlap that read. Task-dependent standards, graph queries, history, and code research wait for the issue title, requirements, and user context; a bare ticket number is not a research brief.

History is requested only for a named regression, previous-decision question, or user request, and only when Entire is enabled. Required documentation reads still apply. Additional documentation providers fill identified gaps rather than repeat the same lookup.

## Explicit brief reuse

Plan, run, linear-plan, and linear-run accept `--brief <path>`. They share [brief validation](../claude-plugins/autopilot/skills/gather-context/references/brief-validation.md) with run-primed and stop on invalid input rather than silently doing a broad crawl. Without the flag they gather normally. A valid base still needs source-dependency and working-tree checks; incomplete broad standards coverage triggers a narrowed digest.

## Shared planning rules

All drafting callers read [common instructions](../claude-plugins/autopilot/skills/plan/references/common-instructions.md). They retain actionable convention clauses, conditions, exceptions, and source provenance from the Context Map. Source IDs and relevance explanations are not a substitute for requirements. Overflow stays visible until affected decisions have enough evidence.

## The shared pipeline

The [pipeline](../claude-plugins/autopilot/skills/plan/references/pipeline.md) drafts and writes one plan, without a review panel, score, or separate finalize task. Every step has an observable verification condition. The required `## Context source` carries the snapshot evidence, including `context-source:`, `graphify-trace:`, and `graphify-shortlist:` when using graphify. These records state what was read; consumers must not fabricate or silently reacquire them.

Plan tracks Gather context and Write plan. Run additionally tracks Implement and verify and Deliver PR. Batch outcome tracking where supported; parsing and status-only phases do not warrant separate tasks.

## How run differs: automated post-implementation

Run installs the preflight history gate once, creates the branch, implements, commits, opens or updates the PR, and monitors until ready for human review. Approval and merge are separate follow-ups. A no-repository-change plan reads its conditional completion procedure; an empty diff alone is not success. User-prohibited verification remains deferred and is reported rather than executed or claimed passed. When such a check is necessary to prove a no-change result, report `Outcome: verification_deferred` and leave completion open.

For a Linear issue, run reads the shared [plan storage procedure](../claude-plugins/autopilot/skills/linear-plan/references/plan-storage.md) before implementation. It stores without title refresh or AI Ready transition; a failed write is reported with recoverable plan text and never gates delivery.
