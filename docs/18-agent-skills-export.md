# Agent skills export

> Chapter 18 of the [repository docs](../README.md#repository-docs).

How the autopilot plugin's skills and agents reach Codex, Kimi, and other SKILL.md-compatible CLIs: a committed portable layout derived from the Claude plugin, and a sync action that publishes it into consumer repositories.

> Source of truth: [`scripts/export-agent-skills/`](../scripts/export-agent-skills/exportAgentSkills.ts) (the export pipeline), [`agent-skills/`](../agent-skills/README.md) (the generated layout), and [`agents-skills-sync`](../.github/actions/agents-skills-sync/README.md) (the consumer-facing action).

## The pattern this exists for

The rules layer went vendor-neutral first: [`agents-rules-sync`](../.github/actions/agents-rules-sync/README.md) publishes `AGENTS.md` as the canonical rules file with `CLAUDE.md` as a symlink. Skills and agents were the remaining gap — the plugin ships in Claude Code plugin format only, while the ecosystem converged on the portable Agent Skills format: Codex CLI loads `SKILL.md` skills from `~/.codex/skills/` and `.codex/skills/`, and Kimi Code CLI loads them from user, project, and extra directories.

The same principle applies at every layer: the Claude plugin layout is the single source of truth, and vendor layouts are derived, never hand-edited.

## The export pipeline

`bun run export:skills` regenerates the committed `agent-skills/` directory from [`claude-plugins/autopilot/`](../claude-plugins/autopilot/README.md). The transform is mechanical:

- **Names** — portable consumers reject `:` in skill names and un-prefixed names collide in consumer repos, so `pr:review` becomes `autopilot-pr-review` (see `toPortableSlug` in [`transformSkill.ts`](../scripts/export-agent-skills/transformSkill.ts)).
- **Frontmatter** — reduced to the portable contract, `name` + `description`; Claude-only keys (`allowed-tools`, `argument-hint`, `model`) are dropped.
- **References** — every relative link is relocated so it resolves in the flat exported layout: sibling-skill links point at the renamed directories, agent links point at the converted agent-skills, and links whose target is not exported (a Claude-only skill, the plugin's `lib/`) fall back to the plugin source on GitHub. `Skill(autopilot:x)` invocation mentions become the backticked portable name.
- **Agents** — each of the 12 subagent definitions under [`agents/`](../claude-plugins/autopilot/agents/) becomes a skill of its own ([`transformAgent.ts`](../scripts/export-agent-skills/transformAgent.ts)): the instruction body is already markdown, and a prepended provenance note tells a CLI without subagents to run the task inline and treat the structured output block as the result.
- **Tracked files only** — the exporter enumerates `git ls-files`, so gitignored artifacts never leak into the layout.

`bun run export:skills:check` regenerates into a temp directory and fails on any diff; it runs inside `bun run lint`, so CI blocks a plugin change that forgets to regenerate the layout. [`validate-plugins.ts`](../scripts/validate-plugins.ts) additionally validates every exported `SKILL.md` against `portableSkillFrontmatterSchema` — kebab-case name without `:`, and no Claude-only key may survive the export.

## Claude-only skills

A skill is excluded from the export when its core mechanic is the Claude Code harness itself — the criteria and the list live in [`claudeOnly.ts`](../scripts/export-agent-skills/claudeOnly.ts), and the generated [`agent-skills/README.md`](../agent-skills/README.md) names each exclusion with its reason. Degraded prose is acceptable; a silently missing human gate is not. Links pointing at an excluded skill rewrite to its GitHub source, so nothing in the exported layout rots.

## Consuming the layout

Three ways in, by decreasing automation:

1. **Synced repositories** — a consumer repo runs the [`agents-skills-sync`](../.github/actions/agents-skills-sync/README.md) action, which enumerates the layout via the Git Trees API and opens one idempotent [`files-sync`](../.github/actions/files-sync/README.md) PR writing everything under `.agents/skills/` — the vendor-neutral directory Codex and Kimi read.
2. **Manual install** — copy skill directories from [`agent-skills/`](../agent-skills/README.md) into the CLI's skills directory; the generated README carries per-vendor paths.
3. **Claude Code** — none of the above: install the [autopilot plugin](../claude-plugins/autopilot/README.md), which keeps subagents, tool permissions, plan mode, and MCP wiring.
