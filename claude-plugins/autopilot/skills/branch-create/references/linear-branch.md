# Linear branch operations

## Fetch the ticket

**If `provider` is `linear`:** fetch the ticket via the Linear MCP `get_issue` tool with `{ "id": "<LINEAR-ID>" }` and read its `title` (for the slug) and `state.name`; if no Linear MCP tool resolves (see the access note below), stop with its `No Linear MCP available …` message instead of continuing without ticket data. Skip the main skill’s GitHub `gh` steps and do NOT self-assign — Linear assignment is deferred to a later phase; emit `unassigned — Linear assignment deferred`. Then continue to [Phase 3](../SKILL.md#phase-3-generate-branch-slug).

**Linear MCP access:** Read [`linear-mcp-access.md`](../../shared-rules/references/linear-mcp-access.md) and apply its tool-resolution rule, using the bare tool names `get_issue`, `list_issue_statuses`, `save_issue`.

## Start the ticket

**If `provider` is `linear` AND `--start` was passed:** move the ticket to "In Progress" — best-effort, never blocks the branch. Resolve the target state id with the Linear MCP `list_issue_statuses` tool for the ticket's team, then call the Linear MCP `save_issue` tool with `{ "id": "<LINEAR-ID>", "state": "<In Progress state>" }` — tool resolution per [Fetch the ticket](#fetch-the-ticket). On success, emit `✓ Ticket <LINEAR-ID> moved to In Progress`; when no Linear MCP tool resolves under any prefix, emit `issue not started — no Linear MCP available (check /mcp or connect one)`; on any other failure, emit `issue not started — <reason>`. Always continue — but the emitted line MUST reach the branch result, never only intermediate text.
