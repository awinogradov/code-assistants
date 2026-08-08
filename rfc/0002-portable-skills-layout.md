---
number: 2
version: 1
title: Portable single-source skills layout
status: Accepted
author: awinogradov
created: 2026-08-08
updated: 2026-08-08
---

# RFC-0002: Portable single-source skills layout

## Summary

The autopilot plugin's `claude-plugins/autopilot/skills/` directory is the one authored source of truth for skills, and it is portable by construction: every SKILL.md-compatible CLI (Claude Code, Codex, Kimi, …) consumes it either directly or via a verbatim sync. No generated per-vendor layout, no content transform, no drift gate.

## Motivation

The [Agent Skills open format](https://opencode.ai/docs/skills/) requires only `name` and `description` in frontmatter, and spec-compliant runtimes ignore keys they do not recognize — including Claude Code's extensions. The ecosystem norm is a single shared skills directory consumed by every tool. A compiled per-vendor copy therefore adds repo size, PR noise, and drift machinery without adding capability, and the previous colon-form directory names (`skills/pr:review/`) additionally made the repository impossible to check out on Windows, where `:` is an illegal path character.

## Standard

### SKILLS-001 — Dash-only skill names

Skill directory names and their frontmatter `name:` values are dash-only kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). `:` is forbidden. Enforced by `skillFrontmatterSchema` in [scripts/schemas.ts](../scripts/schemas.ts) via `bun run validate`. Claude Code namespaces skills at runtime (`/autopilot:pr-review`), so no prefix is encoded in the name.

### SKILLS-002 — Frontmatter is the portable superset

Frontmatter carries the portable core (`name`, `description`) plus Claude Code extensions (`argument-hint`, `allowed-tools`, `model`) as authored. Other runtimes ignore the extensions; nothing is stripped for export because there is no export.

### SKILLS-003 — Verbatim sync contract

The [agents-skills-sync](../.github/actions/agents-skills-sync/README.md) action ships the layout byte-identical into consumer repositories at `.agents/skills/<skill-name>/…` — plain, unprefixed directory names, structure preserved. This keeps every relative cross-skill link resolving in the consumer copy. Name collisions with other skill sets in a consumer repository are the consumer's to resolve.

### SKILLS-004 — Extraction-safe references

A link inside a skill whose target lives **outside** the skills layout (for example a subagent definition under `agents/`) is written as an absolute GitHub blob URL, not a relative path — it must keep resolving after the layout is copied or synced out of this repository. Links between skills stay relative (SKILLS-003 preserves them). This is the sanctioned exception to [RFC-0001](./0001-reference-formatting.md)'s repo-relative preference, justified by its own "prefer the most stable link form" rule.

### SKILLS-005 — Agents are Claude-only

Subagent definitions under `claude-plugins/autopilot/agents/` are Claude Code runtime objects (isolated context, `tools` restriction, model override) and are not part of the portable layout. Other CLIs reading a skill that delegates to a subagent follow the linked definition (SKILLS-004) and run the task inline.

## Consequences

- Editing a skill is one change in one place; CI has no generated tree to police.
- Skills whose core mechanic is a Claude Code harness feature (plan mode in `plan`, session briefs in `run-primed`) ship in the portable layout as readable workflow documents; their harness-bound steps do not reproduce elsewhere, and consumer-facing docs say so.
- External deep links into the old colon paths (`…/skills/pr:review/…`) rot; the rename is a breaking change recorded in the plugin's MIGRATING notes.

## Changelog

- **v1** (2026-08-08) — Initial version: dash-only names, portable-superset frontmatter, verbatim `.agents/skills/` sync, extraction-safe references, agents Claude-only.
