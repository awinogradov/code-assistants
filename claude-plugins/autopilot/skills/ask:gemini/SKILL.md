---
name: ask:gemini
description: Delegate a code analysis, refactoring, or automated-editing task to the Google Gemini CLI (gemini -p / gemini --resume), then critically evaluate its output as a peer AI. Use when the user asks to run Gemini, references the Gemini CLI, or wants a second model's take on the code.
argument-hint: "[task description] [--model <model>] [--approval-mode <default|auto_edit|yolo|plan>]"
allowed-tools:
  - Bash(gemini *)
  - Bash(echo *)
  - AskUserQuestion
  - WebSearch
  - Read
---

# Ask Gemini

Delegate a task to the Google Gemini CLI and report the result. Gemini runs as a peer model: read [`peer-cli-delegation.md`](../shared-rules/references/peer-cli-delegation.md) and apply it throughout — it owns the delegation mechanics, the follow-up loop, the critical evaluation of Gemini output, and the error-handling protocol, while this file supplies the CLI name, the exec command, the resume syntax, and the flag table. Do NOT use for: git/PR workflows (use the other autopilot skills) or tasks that do not involve the Gemini CLI.

## Input

Parse `$ARGUMENTS` for an optional task description and optional `--model` / `--approval-mode` flags. Anything missing is collected in the next step.

## Running a Task

1. If model or approval mode was not supplied in `$ARGUMENTS`, ask the user (via `AskUserQuestion`, **one prompt with two questions**) which model (`auto`, `pro`, `flash`, `flash-lite`, or a concrete name such as `gemini-2.5-pro` / `gemini-3-pro-preview`) and which approval mode (`default`, `auto_edit`, `yolo`, `plan`).
2. Select the approval mode; default to `--approval-mode default` (Gemini prompts before edits) unless edits or full automation are required. Add `-s, --sandbox` to run tools inside Gemini's sandbox whenever you grant `auto_edit` or `yolo`.
3. Assemble the command with the appropriate options:
   - `-m, --model <MODEL>`
   - `--approval-mode <default|auto_edit|yolo|plan>`
   - `-s, --sandbox`
   - `-a, --all-files`
   - `--include-directories <dir1,dir2>`
   - `-o, --output-format <text|json>`
   - `-p, --prompt "your prompt here"` (forces non-interactive mode)
4. Always run non-interactively with `-p`; a bare positional prompt starts an interactive REPL in a TTY.
5. Resume: continue a prior session with `gemini -r "latest" "your prompt here"` (or `gemini -r "<session-id>" "your prompt here"`); per the shared block's inherit rule, pass no model flag unless the user explicitly requests a change.
6. **IMPORTANT (clean output)**: in `text` mode Gemini prints only the response to stdout. For a machine-parseable result use `--output-format json` and read the `.response` field with `jq`. Pass `--debug` only when troubleshooting; append `2>/dev/null` to silence diagnostics when they would clutter scripted output.
7. **IMPORTANT (stdin)**: `gemini` reads stdin and appends it to the `-p` prompt — apply the shared block's stdin guard, e.g. `gemini -p "prompt" </dev/null 2>/dev/null`.
8. Run the command and follow the shared block's reporting and resume-offer loop; the user resumes by saying "gemini resume".

### Quick Reference

| Use case                     | Approval mode           | Key flags                                                      |
| ---------------------------- | ----------------------- | -------------------------------------------------------------- |
| Read-only review or analysis | `default`               | `-p "..."` (no edits applied; model only reads)                |
| Apply local edits            | `auto_edit`             | `--approval-mode auto_edit -s -p "..."`                        |
| Full automation              | `yolo`                  | `--approval-mode yolo -s -p "..."`                             |
| Plan without executing tools | `plan`                  | `--approval-mode plan -p "..."`                                |
| Machine-readable output      | match task needs        | `--output-format json -p "..."`, then parse `.response` (`jq`) |
| Resume recent session        | inherited from original | `gemini -r "latest" "prompt"` (no model flag)                  |

## Gemini Specifics for the Shared Rules

The shared block leaves these caller-supplied:

- The peer CLI is **Gemini**, powered by Google models; its version check is `gemini --version`.
- High-impact flags that need permission first: `--approval-mode yolo`, `--yolo`, `-s` with broad access, `-a`/`--all-files` on large repos.
- Resume syntax for follow-ups and peer discussion of a disagreement:

```bash
gemini -r "latest" "This is Claude (<your current model name>) following up. I disagree with [X] because [evidence]. What's your take?"
```

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
