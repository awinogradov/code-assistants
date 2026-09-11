# Linear creation metadata

Once the target team is known, launch these independent reads in one message, alongside code-context gathering:

- `list_issue_statuses` for the team; suggest its initial state.
- `list_issue_labels` for the team; suggest the configured repo label only if returned.
- Assignee resolution below, with relevant paths when already known. Do not delay metadata reads merely to discover paths; without them the resolver uses catch-all owners.

Launch the [resolve-assignees agent](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/resolve-assignees.md) to gather candidates — CODEOWNERS plus the Linear team's members, with the current Linear user resolved and returned first (flagged `self`):

```
Use the Agent tool with:
- `subagent_type`: "autopilot:resolve-assignees"
- `prompt`: "Resolve assignee candidates. Repository: [owner/repo]. Linear team: [team]."
- `description`: "Resolve assignees"
```

Keep the self candidate first and retain a Leave unassigned option. If resolution fails, report it and default to unassigned.

Return the fetched candidates to the creation skill. Do not prompt inside this reference: the caller presents status, labels, and assignee together. Missing metadata is explicit; never invent a state, label, or member. Candidate data may be reused within this invocation for the same team, not across sessions or team changes.
