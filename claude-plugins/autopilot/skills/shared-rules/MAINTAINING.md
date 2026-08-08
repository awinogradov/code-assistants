# Maintaining shared blocks

Contributor documentation for the [shared-rules](./SKILL.md) mechanism. A consuming skill needs only [SKILL.md](./SKILL.md); this file is for editing the mechanism itself.

## Why blocks have one owner

Skills used to carry these blocks inline, one copy per skill. That is why the AskUserQuestion note drifted into two wordings across 11 copies with nothing detecting it — a copy has no owner. A block here has exactly one owner and a guard.

## Where a block is still inlined

Two runtimes can read nothing, so they keep a literal copy. Both are guarded byte-identical against the canonical file by the `sharedBlockSync` test, so they are still single-sourced — only the delivery differs.

- [releaseNotesPrompt.ts](../../../../.github/actions/release-action/src/releaseNotesPrompt.ts) carries the reference-formatting block. It is passed to the Anthropic API as a raw system prompt, not through the Claude Code SDK, so it has no tools at all.
- The seven structured-output agents carry the agent JSON block. Agents declare their own tools and [expert-review](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/expert-review.md) declares `tools: []`.

Do not "fix" either by adding a read directive — neither can execute one.

## Adding a block

1. Add `references/<block>.md` wrapped in a `<!-- <name>:start -->` / `<!-- <name>:end -->` sentinel pair.
2. Add a row to the table in [SKILL.md](./SKILL.md).
3. Register the sentinel name and its consumers in `sharedBlockSync.test.ts`, and the directive phrase in `sharedRulesInvocation.test.ts`.
4. Replace each inlined copy with a read directive naming the new file.

RFC-0001 remains the binding standard for the reference-formatting block; `references/reference-formatting.md` is a guarded copy of its sentinel block, never an independent source. Changing that rule means [bumping the RFC's version](../../../../rfc/0001-reference-formatting.md), not editing the reference file.
