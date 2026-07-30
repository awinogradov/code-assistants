<!-- linear-mcp:start -->

### Linear MCP access

**Linear MCP access:** Linear operations here use the session's connected Linear MCP server, matching tools by name — the suffix after the final `__` — under whatever server prefix the session exposes (e.g. `mcp__linear__*` or `mcp__linear-server__*`). The plugin bundles no Linear server; the server is always user- or project-configured at the consumer level. The prefix must identify a Linear server (a `linear` server name or the `mcp.linear.app` endpoint) — never bind a generic tool name like `get_issue` to a non-Linear MCP. If a tool is not visible, search for it with ToolSearch by bare tool name before concluding it is absent. Only when no Linear MCP tool resolves under any prefix, stop and tell the user: `No Linear MCP available — check /mcp for a disconnected or unauthenticated Linear server, or connect one: claude mcp add --transport http linear https://mcp.linear.app/mcp`.

**The tool list is caller-supplied.** Each invoking skill names the bare tool names it needs — `linear:create` uses `save_issue`, `list_issue_statuses`, `list_issue_labels`; `branch:create` uses `get_issue`, `list_issue_statuses`, `save_issue`. The resolution rule above is identical whichever set applies.

<!-- linear-mcp:end -->
