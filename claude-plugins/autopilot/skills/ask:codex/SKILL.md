---
name: ask:codex
description: Delegate a code analysis, refactoring, or automated-editing task to the OpenAI Codex CLI (codex exec / codex resume), then critically evaluate its output as a peer AI. Use when the user asks to run Codex, references OpenAI Codex, or wants a second model's take on the code.
argument-hint: "[task description] [--model <model>] [--effort <xhigh|high|medium|low>]"
allowed-tools:
  - Bash(codex *)
  - Bash(echo *)
  - AskUserQuestion
  - WebSearch
  - Read
---

# Ask Codex

Delegate a task to the OpenAI Codex CLI and report the result. Codex runs as a peer model — its output is evaluated critically, never accepted blindly.

## When to Use

- The user asks to run Codex (`codex exec`, `codex resume`) or references OpenAI Codex.
- The user wants a second model's analysis, refactor, or automated edit of the code.

Do NOT use for: git/PR workflows (use the other autopilot skills) or tasks that do not involve the Codex CLI.

## Input

Parse `$ARGUMENTS` for an optional task description and optional `--model` / `--effort` flags. Anything missing is collected in the next step.

## Running a Task

1. If model or effort was not supplied in `$ARGUMENTS`, ask the user (via `AskUserQuestion`, **one prompt with two questions**) which model (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`, `gpt-5.3-codex`) and which reasoning effort (`xhigh`, `high`, `medium`, `low`).
2. Select the sandbox mode; default to `--sandbox read-only` unless edits or network access are required.
3. Assemble the command with the appropriate options:
   - `-m, --model <MODEL>`
   - `--config model_reasoning_effort="<xhigh|high|medium|low>"`
   - `--sandbox <read-only|workspace-write|danger-full-access>`
   - `--full-auto`
   - `-C, --cd <DIR>`
   - `--skip-git-repo-check`
   - `"your prompt here"` (final positional argument)
4. Always pass `--skip-git-repo-check`.
5. Resume: continue a prior session with `echo "your prompt here" | codex exec --skip-git-repo-check resume --last 2>/dev/null`. Insert any flags **between** `exec` and `resume`, and pass no config flags on resume unless the user explicitly requests them (the session inherits the original model, effort, and sandbox).
6. **IMPORTANT**: append `2>/dev/null` to every `codex exec` command to suppress thinking tokens (stderr). Only show stderr when the user explicitly asks to see thinking tokens or for debugging.
7. **IMPORTANT (stdin)**: `codex exec` always reads stdin and concatenates it with the positional prompt. If stdin is not closed, codex blocks forever. When stdin is not a TTY but also not closed (background tasks, hooks, scripts), append `</dev/null`, e.g. `codex exec ... "prompt" </dev/null 2>/dev/null`. Symptom of getting this wrong: zero bytes of stdout, zero CPU, process hangs.
8. Run the command, capture stdout (filtered as appropriate), and summarize the outcome for the user.
9. After Codex completes, tell the user: "You can resume this Codex session at any time by saying 'codex resume' or asking me to continue with additional analysis or changes."

### Quick Reference

| Use case                       | Sandbox mode            | Key flags                                                                                |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| Read-only review or analysis   | `read-only`             | `--sandbox read-only 2>/dev/null`                                                        |
| Apply local edits              | `workspace-write`       | `--sandbox workspace-write --full-auto 2>/dev/null`                                      |
| Permit network or broad access | `danger-full-access`    | `--sandbox danger-full-access --full-auto 2>/dev/null`                                   |
| Resume recent session          | inherited from original | `echo "prompt" \| codex exec --skip-git-repo-check resume --last 2>/dev/null` (no flags) |
| Run from another directory     | match task needs        | `-C <DIR>` plus other flags `2>/dev/null`                                                |

## Following Up

- After every `codex` command, use `AskUserQuestion` to confirm next steps, collect clarifications, or decide whether to resume.
- When resuming, pipe the new prompt via stdin: `echo "new prompt" | codex exec --skip-git-repo-check resume --last 2>/dev/null`. The resumed session reuses the original model, effort, and sandbox.
- Restate the chosen model, reasoning effort, and sandbox mode when proposing follow-up actions.

## Critical Evaluation of Codex Output

Codex is powered by OpenAI models with their own knowledge cutoffs and limitations. Treat Codex as a **colleague, not an authority**.

- **Trust your own knowledge** when confident. If Codex claims something you know is wrong, push back directly.
- **Research disagreements** with `WebSearch` or documentation before accepting Codex's claims.
- **Remember knowledge cutoffs** — Codex may not know about recent releases, APIs, or changes.
- **Don't defer blindly**, especially on model names/capabilities, recent library versions or API changes, and evolving best practices.

When Codex is wrong: state the disagreement to the user, provide evidence, and optionally resume the session to discuss — identify yourself as Claude using your actual current model name, frame it as a peer discussion (either AI could be wrong), and let the user decide on genuine ambiguity:

```bash
echo "This is Claude (<your current model name>) following up. I disagree with [X] because [evidence]. What's your take?" | codex exec --skip-git-repo-check resume --last 2>/dev/null
```

## Error Handling

- Stop and report failures whenever `codex --version` or a `codex exec` command exits non-zero; ask for direction before retrying.
- Before using high-impact flags (`--full-auto`, `--sandbox danger-full-access`, `--skip-git-repo-check`) ask permission via `AskUserQuestion` unless already granted.
- When output includes warnings or partial results, summarize them and ask how to adjust via `AskUserQuestion`.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as `[title](url)` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
