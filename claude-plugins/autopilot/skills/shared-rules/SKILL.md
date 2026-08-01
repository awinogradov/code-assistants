---
name: shared-rules
description: Canonical home for instruction blocks shared by several autopilot skills and agents — reference formatting (RFC-0001), AskUserQuestion formatting and content-preview contract, repomix snapshot acquisition, agent structured output, issue body grammar, Linear MCP access, peer CLI delegation, and PR title/body grammar. Read the one block you need instead of carrying a copy.
---

# Shared Rules

The single source of truth for instruction text that more than one autopilot skill needs. Each block lives in its own file under `references/`, so a consumer reads exactly the block it needs and nothing else.

Skills used to carry these blocks inline, one copy per skill. That is why the AskUserQuestion note drifted into two wordings across 11 copies with nothing detecting it — a copy has no owner. A block here has exactly one owner and a guard.

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
| Reference formatting (RFC-0001)  | [reference-formatting.md](./references/reference-formatting.md)         | before writing any output that mentions a file, standard, section, commit, or issue |
| AskUserQuestion formatting       | [askuserquestion-format.md](./references/askuserquestion-format.md)     | before composing an AskUserQuestion `question` parameter                            |
| AskUserQuestion preview contract | [askuserquestion-contract.md](./references/askuserquestion-contract.md) | before composing a dialog that presents generated content for review                |
| Repomix snapshot acquisition     | [repomix-snapshot.md](./references/repomix-snapshot.md)                 | before acquiring a codebase snapshot                                                |
| Agent structured output          | [agent-json-output.md](./references/agent-json-output.md)               | when an agent must return a bare JSON object to its parent                          |
| Issue body grammar               | [issue-body-grammar.md](./references/issue-body-grammar.md)             | before generating a GitHub or Linear issue body                                     |
| Linear MCP access                | [linear-mcp-access.md](./references/linear-mcp-access.md)               | before calling any Linear MCP tool                                                  |
| Peer CLI delegation              | [peer-cli-delegation.md](./references/peer-cli-delegation.md)           | before delegating a task to a peer AI CLI and evaluating its output                 |
| PR title and branch grammar      | [pr-title-grammar.md](./references/pr-title-grammar.md)                 | before generating or validating a PR title or branch name                           |
| PR body grammar                  | [pr-body-grammar.md](./references/pr-body-grammar.md)                   | before generating or updating a PR description                                      |

Two blocks are parameterised by the caller rather than fixed: the repomix `includePatterns` value, and the Linear tool-name list. Each block file states what the caller supplies.

## Where a block is still inlined

Two runtimes can read nothing, so they keep a literal copy. Both are guarded byte-identical against the canonical file by the `sharedBlockSync` test, so they are still single-sourced — only the delivery differs.

- [releaseNotesPrompt.ts](../../../../.github/actions/release-action/src/releaseNotesPrompt.ts) carries the reference-formatting block. It is passed to the Anthropic API as a raw system prompt, not through the Claude Code SDK, so it has no tools at all.
- The seven structured-output agents carry the agent JSON block. Agents declare their own tools and [expert-review](../../agents/expert-review.md) declares `tools: []`.

Do not "fix" either by adding a read directive — neither can execute one.

## Adding a block

1. Add `references/<block>.md` wrapped in a `<!-- <name>:start -->` / `<!-- <name>:end -->` sentinel pair.
2. Add a row to the table above.
3. Register the sentinel name and its consumers in `sharedBlockSync.test.ts`, and the directive phrase in `sharedRulesInvocation.test.ts`.
4. Replace each inlined copy with a read directive naming the new file.

RFC-0001 remains the binding standard for the reference-formatting block; `references/reference-formatting.md` is a guarded copy of its sentinel block, never an independent source. Changing that rule means [bumping the RFC's version](../../../../rfc/0001-reference-formatting.md), not editing the reference file.
