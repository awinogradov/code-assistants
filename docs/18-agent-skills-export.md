# Portable single-source skills

> Chapter 18 of the [repository docs](../README.md#repository-docs).

How the autopilot skills reach Codex, Kimi, and other SKILL.md-compatible CLIs: one authored layout, consumed by every tool, with a verbatim sync into consumer repositories. The binding standard is [RFC-0002](../rfc/0002-portable-skills-layout.md).

> Source of truth: [`claude-plugins/autopilot/skills/`](../claude-plugins/autopilot/README.md) (the authored layout) and [`agents-skills-sync`](../.github/actions/agents-skills-sync/README.md) (the consumer-facing action).

## The pattern this exists for

The rules layer went vendor-neutral first: [`agents-rules-sync`](../.github/actions/agents-rules-sync/README.md) publishes `AGENTS.md` as the canonical rules file with `CLAUDE.md` as a symlink. Skills follow the same principle one step further: the [Agent Skills open format](https://opencode.ai/docs/skills/) needs only `name` + `description`, spec-compliant runtimes ignore frontmatter keys they do not recognize (Claude Code's extensions included), and the ecosystem norm is a single shared skills directory. So there is no compiled per-vendor copy at all — the plugin's own `skills/` directory is portable by construction.

An earlier iteration shipped a generated `agent-skills/` tree with an export pipeline and a CI drift gate; RFC-0002 replaced it with this single-source layout (skill names went dash-only — `pr:review` became `pr-review` — which also made the repository checkoutable on Windows).

## What keeps the layout portable

- **Dash-only names** ([SKILLS-001](../rfc/0002-portable-skills-layout.md#skills-001--dash-only-skill-names)) — enforced by `bun run validate` via `skillFrontmatterSchema` in [`scripts/schemas.ts`](../scripts/schemas.ts). Claude Code adds its namespace at runtime (`/autopilot:pr-review`), so nothing vendor-specific is encoded in the name.
- **Frontmatter as the portable superset** ([SKILLS-002](../rfc/0002-portable-skills-layout.md#skills-002--frontmatter-is-the-portable-superset)) — Claude extensions (`argument-hint`, `allowed-tools`, `model`) stay as authored; other runtimes ignore them.
- **Extraction-safe references** ([SKILLS-004](../rfc/0002-portable-skills-layout.md#skills-004--extraction-safe-references)) — links between skills are relative (structure is preserved everywhere the layout lands); links out of the layout (subagent definitions under [`agents/`](../claude-plugins/autopilot/agents/)) are absolute GitHub URLs so a synced copy never rots.
- **Agents stay Claude-only** ([SKILLS-005](../rfc/0002-portable-skills-layout.md#skills-005--agents-are-claude-only)) — subagents are Claude Code runtime objects; a CLI without subagents follows the linked definition and runs the task inline.

## Consuming the layout

Three ways in, by decreasing automation:

1. **Synced repositories** — a consumer repo runs the [`agents-skills-sync`](../.github/actions/agents-skills-sync/README.md) action, which enumerates the layout via the Git Trees API and opens one idempotent [`files-sync`](../.github/actions/files-sync/README.md) PR writing everything verbatim under `.agents/skills/` — the vendor-neutral directory Codex and Kimi read ([SKILLS-003](../rfc/0002-portable-skills-layout.md#skills-003--verbatim-sync-contract)).
2. **Manual install** — copy skill directories from `claude-plugins/autopilot/skills/` into the CLI's skills directory (`~/.codex/skills/` or `.codex/skills/` for Codex; a configured skills directory for [Kimi Code CLI](https://moonshotai.github.io/kimi-cli/en/customization/skills.html)).
3. **Claude Code** — none of the above: install the [autopilot plugin](../claude-plugins/autopilot/README.md), which keeps subagents, tool permissions, plan mode, and MCP wiring.

The `plan` and `run-primed` skills are readable everywhere but rely on Claude Code mechanics (plan-mode approval gate; SHA-validated session briefs) that other CLIs do not reproduce.
