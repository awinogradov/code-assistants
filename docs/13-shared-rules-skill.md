# The `shared-rules` skill

Autopilot skills and agents are standalone prompt files: each is loaded on its own, so any instruction two of them need used to be solved by copy-pasting the text into both. That worked until a copy drifted. The AskUserQuestion formatting note reached eleven copies in **three** divergent wordings with nothing detecting it, because a copy has no owner.

[`shared-rules`](../claude-plugins/autopilot/skills/shared-rules/SKILL.md) gives each shared block exactly one owner. Consumers read the block at runtime instead of carrying it.

## How a consumer reaches a block

```text
   ┌──────────────────────────────────┐
   │ rfc/0001-reference-formatting.md │
   └────────────────┬─────────────────┘
                    │ ①
                    ▼
   ┌──────────────────────────────────┐
   │ shared-rules/references/*.md     │
   │ one file per block               │
   └──┬────────────────────────────┬──┘
      │ ②                          │ ③
      ▼                            ▼
┌──────────────────┐   ┌──────────────────────────────┐
│ consumer SKILL.md│   │ agents/*.md                  │
│ directive only   │   │ releaseNotesPrompt.ts        │
└──────────────────┘   └──────────────────────────────┘
```

**Flow Legend:**

- ① RFC-0001 stays the binding standard for the reference-formatting block. Its reference file is a guarded copy of the RFC's sentinel block, never an independent source, so the RFC cannot decay into a third mutable copy.
- ② Runtime read. The consumer holds a one-line directive naming the block file; the text itself lives only in `references/`.
- ③ Build-time guard. Two runtimes can read nothing, so they keep a literal copy that `sharedBlockSync` holds byte-identical to the canonical file.

## Reading a block

Every block file is a sibling of the invoking skill, so it resolves from the base directory the harness announces to each skill:

```
<invoking skill's base directory>/../shared-rules/references/<block>.md
```

`${CLAUDE_PLUGIN_ROOT}/skills/shared-rules/references/<block>.md` names the same file, but that variable is not always populated — [`resolve-issue-context`](../claude-plugins/autopilot/agents/resolve-issue-context.md) documents an absolute-path fallback for exactly that reason. Prefer the sibling-relative form.

Directives are written as markdown links. That is not decoration: [`linkResolution`](../.github/actions/code-review-action/src/linkResolution.test.ts) walks every markdown file under `skills/`, so a renamed or deleted block file fails CI at the directive rather than at runtime on every call site.

Why `Read` and not the `Skill` tool: a skill loads its whole `SKILL.md`, so there is no way to pull one section — a consumer needing the 184-character agent preamble would load every block. Reading one file loads one block. `Read` is also already in the review action's `CLAUDE_ALLOWED_TOOLS`, whereas granting `Skill` there would have enabled every autopilot skill (`commits-create`, `pr-create`, `branch-create`) inside the runtime that processes untrusted PR content, and allowlists cascade to subagents.

## The blocks

| Block                           | Canonical file              | Caller supplies         |
| ------------------------------- | --------------------------- | ----------------------- |
| Reference formatting (RFC-0001) | `reference-formatting.md`   | —                       |
| AskUserQuestion formatting      | `askuserquestion-format.md` | —                       |
| Codebase context acquisition    | `repomix-snapshot.md`       | `includePatterns`       |
| Agent structured output         | `agent-json-output.md`      | —                       |
| Linear MCP access               | `linear-mcp-access.md`      | the bare tool-name list |
| Git history policy              | `git-history-policy.md`     | —                       |
| PR title and branch grammar     | `pr-title-grammar.md`       | —                       |
| PR body grammar                 | `pr-body-grammar.md`        | —                       |
| GitHub review-thread retrieval  | `github-review-fetch.md`    | repo, PR number, author |

## Where a block is still inlined

Two runtimes cannot read a file, so they keep a literal copy. Both are single-sourced anyway — only the delivery differs.

- [`releaseNotesPrompt.ts`](../.github/actions/release-action/src/releaseNotesPrompt.ts) is passed to the Anthropic API as a raw system prompt rather than through the Claude Code SDK, so it has no tools at all.
- The seven structured-output agents declare their own `tools`, and [`expert-review`](../claude-plugins/autopilot/agents/expert-review.md) declares `tools: []`. Granting `Read` to seven agents plus a round-trip each, to deduplicate 184 characters, costs more than it saves.

Do not "fix" either by adding a read directive; neither can execute one.

## Guards

- [`sharedBlockSync`](../.github/actions/code-review-action/src/sharedBlockSync.test.ts) — pins RFC-0001 as canonical, asserts every block is non-empty and substantial (an absent sentinel would otherwise extract `""` and compare equal to another `""`), and holds each retained inlined copy byte-identical. The retained-copy matrix is explicit test data, so a dropped or newly added copy fails loudly instead of shrinking the matrix silently.
- [`sharedRulesInvocation`](../.github/actions/code-review-action/src/sharedRulesInvocation.test.ts) — discovers skills by `readdir`, not a hardcoded list, so a new skill cannot ship without a reference-formatting directive; opting out requires naming the skill with a reason. It also asserts every directive names a real reference file, and that no consumer has re-inlined a removed block.

Both are presence guards. CI can prove the directive is in the file; it cannot prove the model reads the block at runtime. That gap is real and deliberate — runtime evidence comes from a dry-run recorded on the PR, and each output-generating skill carries a post-hoc self-check over its own drafted output.

## Adding a block

1. Add `references/<block>.md` wrapped in `<!-- <name>:start -->` / `<!-- <name>:end -->`.
2. Add a row to the table in [`SKILL.md`](../claude-plugins/autopilot/skills/shared-rules/SKILL.md).
3. Register the sentinel in `sharedBlockSync.test.ts`, and a distinctive removed-text phrase in `sharedRulesInvocation.test.ts`.
4. Replace each inlined copy with a read directive naming the new file.
