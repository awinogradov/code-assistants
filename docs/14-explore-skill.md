# The explore skill

> Chapter 14 of the [repository docs](../README.md#repository-docs).

[Explore](../claude-plugins/autopilot/skills/explore/SKILL.md) writes a reusable repository brief, then supports surgical changes without a plan/branch/PR chain. Later plan/run calls can explicitly reuse it with `--brief <path>`.

## Refresh classification

The [selective refresh contract](../claude-plugins/autopilot/skills/explore/references/selective-refresh.md) records each stable section's supporting files, content hashes, discovery roots, and completeness in `brief.sources.json`. The sidecar binds to the exact brief content and base. Legacy briefs remain readable but need a full prime before selective refresh.

A full prime is required for missing/incomplete evidence, diverged history, structural changes, or unknown impact. Otherwise changed sources refresh only affected sections. A delta refresh preserves stable sections byte-identical. Structural inputs include repository instructions, package/lock files, documentation indexes, standards, entry points, and module boundaries. New or renamed files under a discovery root invalidate every section depending on that root.

Local staged, unstaged, untracked, and branch changes participate in invalidation. A base SHA alone cannot validate a brief containing another checkout's local edits. Derived pack/changelog/release-note changes do not force architecture rediscovery.

## Brief format

The nine sections remain Architecture map, Data flow, Conventions and standards, Key types, Test and verify, In-flight changes, Local session state, Git state, and Snapshot. The first five and Snapshot are stable; the three Git/session sections are recomputed on every refresh. Base records origin/main; the sidecar records actual supporting file content and discovery coverage.

## Diagrams

Generate diagrams only on user request or when prose does not explain a meaningful boundary or interaction clearly. Keep prose otherwise. Preserve unaffected diagrams during refresh.

## Fix loop

Locate work through the brief, read affected current files, edit, and perform only permitted verification. Report deferred checks explicitly. Changed sources invalidate dependent claims until refreshed. Commit and PR requests hand off to their dedicated skills.
