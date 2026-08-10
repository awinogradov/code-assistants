# Migrating

## 0.1.x → next (single-source layout)

The action now syncs the autopilot skills **verbatim** from the single-source layout `claude-plugins/autopilot/skills/` (see [RFC-0002](../../../rfc/0002-portable-skills-layout.md)) instead of the removed generated `agent-skills/` tree. Two visible changes in consumer repositories:

- **Destination directory names lost their `autopilot-` prefix** — skills now land at `.agents/skills/pr-review/`, `.agents/skills/run/`, … instead of `.agents/skills/autopilot-pr-review/`, so relative cross-skill links inside the synced files keep resolving.
- **Previously synced `.agents/skills/autopilot-*` directories are not auto-deleted.** The underlying [files-sync](../files-sync/README.md) action writes and updates files but never deletes; remove the old prefixed directories manually after the first sync on the new version.

No workflow changes are required — inputs and outputs are unchanged.

## 1.0.0

### Breaking changes

- _Document migration steps here._
