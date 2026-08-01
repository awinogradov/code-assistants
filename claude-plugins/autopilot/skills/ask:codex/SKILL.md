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

Delegate a task to the OpenAI Codex CLI and report the result. Codex runs as a peer model: read [`peer-cli-delegation.md`](../shared-rules/references/peer-cli-delegation.md) and apply it throughout — it owns the delegation mechanics, the follow-up loop, the critical evaluation of Codex output, and the error-handling protocol, while this file supplies the CLI name, the exec command, the resume syntax, and the flag table. Do NOT use for: git/PR workflows (use the other autopilot skills) or tasks that do not involve the Codex CLI.

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
5. Resume: continue a prior session with `echo "your prompt here" | codex exec --skip-git-repo-check resume --last 2>/dev/null`. Insert any flags **between** `exec` and `resume`; per the shared block's inherit rule, pass no config flags on resume unless the user explicitly requests them.
6. **IMPORTANT**: append `2>/dev/null` to every `codex exec` command to suppress thinking tokens (stderr). Only show stderr when the user explicitly asks to see thinking tokens or for debugging.
7. **IMPORTANT (stdin)**: `codex exec` always reads stdin and concatenates it with the positional prompt — apply the shared block's stdin guard, e.g. `codex exec ... "prompt" </dev/null 2>/dev/null`.
8. Run the command and follow the shared block's reporting and resume-offer loop; the user resumes by saying "codex resume".

### Quick Reference

| Use case                       | Sandbox mode            | Key flags                                                                                |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| Read-only review or analysis   | `read-only`             | `--sandbox read-only 2>/dev/null`                                                        |
| Apply local edits              | `workspace-write`       | `--sandbox workspace-write --full-auto 2>/dev/null`                                      |
| Permit network or broad access | `danger-full-access`    | `--sandbox danger-full-access --full-auto 2>/dev/null`                                   |
| Resume recent session          | inherited from original | `echo "prompt" \| codex exec --skip-git-repo-check resume --last 2>/dev/null` (no flags) |
| Run from another directory     | match task needs        | `-C <DIR>` plus other flags `2>/dev/null`                                                |

## Codex Specifics for the Shared Rules

The shared block leaves these caller-supplied:

- The peer CLI is **Codex**, powered by OpenAI models; its version check is `codex --version`.
- High-impact flags that need permission first: `--full-auto`, `--sandbox danger-full-access`, `--skip-git-repo-check`.
- Resume syntax for follow-ups and peer discussion of a disagreement:

```bash
echo "This is Claude (<your current model name>) following up. I disagree with [X] because [evidence]. What's your take?" | codex exec --skip-git-repo-check resume --last 2>/dev/null
```

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
