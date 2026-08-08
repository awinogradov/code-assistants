---
name: autopilot-shared-rules
description: >-
  Canonical home for instruction blocks shared by several autopilot skills and
  agents — reference formatting (RFC-0001), AskUserQuestion formatting and
  content-preview contract, codebase context acquisition (graphify → repomix →
  default tools), agent structured output, issue body grammar, Linear MCP
  access, peer CLI delegation, and PR title/body grammar. Read the one block you
  need instead of carrying a copy.
---

# Shared Rules

The single source of truth for instruction text that more than one autopilot skill needs. Each block lives in its own file under `references/`, so a consumer reads exactly the block it needs and nothing else. Editing the mechanism itself — adding a block, or touching a runtime that keeps an inlined copy — is documented in [MAINTAINING.md](MAINTAINING.md).

## Reading a block

Every block file is a sibling of the invoking skill. Resolve it from **this skill's directory**, which the harness announces to each skill as its base directory:

```
<invoking skill's base directory>/../shared-rules/references/<block>.md
```

`${CLAUDE_PLUGIN_ROOT}/skills/shared-rules/references/<block>.md` is the same path when that variable is set, but it is not always populated — the sibling-relative form is the reliable one.

Apply the block's content **verbatim**. It is an instruction, not a summary to paraphrase.

## Blocks

| Block                            | File                                                                    | Read it when                                                                        |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Reference formatting (RFC-0001)  | [reference-formatting.md](references/reference-formatting.md)         | before writing any output that mentions a file, standard, section, commit, or issue |
| AskUserQuestion formatting       | [askuserquestion-format.md](references/askuserquestion-format.md)     | before composing an AskUserQuestion `question` parameter                            |
| AskUserQuestion preview contract | [askuserquestion-contract.md](references/askuserquestion-contract.md) | before composing a dialog that presents generated content for review                |
| Codebase context acquisition     | [repomix-snapshot.md](references/repomix-snapshot.md)                 | before acquiring codebase context (graphify → repomix → default tools)              |
| Agent structured output          | [agent-json-output.md](references/agent-json-output.md)               | when an agent must return a bare JSON object to its parent                          |
| Issue body grammar               | [issue-body-grammar.md](references/issue-body-grammar.md)             | before generating a GitHub or Linear issue body                                     |
| Linear MCP access                | [linear-mcp-access.md](references/linear-mcp-access.md)               | before calling any Linear MCP tool                                                  |
| Peer CLI delegation              | [peer-cli-delegation.md](references/peer-cli-delegation.md)           | before delegating a task to a peer AI CLI and evaluating its output                 |
| PR title and branch grammar      | [pr-title-grammar.md](references/pr-title-grammar.md)                 | before generating or validating a PR title or branch name                           |
| PR body grammar                  | [pr-body-grammar.md](references/pr-body-grammar.md)                   | before generating or updating a PR description                                      |

Blocks are parameterised by the caller where noted (the repomix `includePatterns` value, the Linear tool-name list, the peer CLI specifics, the AskUserQuestion strings): each block file states what the caller supplies.
