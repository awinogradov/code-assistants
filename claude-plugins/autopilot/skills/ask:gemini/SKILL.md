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

Delegate a task to the Google Gemini CLI and report the result. Gemini runs as a peer model — its output is evaluated critically, never accepted blindly.

## When to Use

- The user asks to run Gemini (`gemini -p`, `gemini --resume`) or references the Gemini CLI.
- The user wants a second model's analysis, refactor, or automated edit of the code.

Do NOT use for: git/PR workflows (use the other autopilot skills) or tasks that do not involve the Gemini CLI.

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
5. Resume: continue a prior session with `gemini -r "latest" "your prompt here"` (or `gemini -r "<session-id>" "your prompt here"`). The resumed session inherits the original model and settings — pass no model flag unless the user explicitly requests a change.
6. **IMPORTANT (clean output)**: in `text` mode Gemini prints only the response to stdout. For a machine-parseable result use `--output-format json` and read the `.response` field with `jq`. Pass `--debug` only when troubleshooting; append `2>/dev/null` to silence diagnostics when they would clutter scripted output.
7. **IMPORTANT (stdin)**: `gemini` reads stdin and appends it to the `-p` prompt. When stdin is not a TTY but also not closed (background tasks, hooks, scripts), Gemini blocks forever waiting for input — append `</dev/null`, e.g. `gemini -p "prompt" </dev/null 2>/dev/null`. Symptom of getting this wrong: zero bytes of stdout, zero CPU, process hangs.
8. Run the command, capture stdout (filtered as appropriate), and summarize the outcome for the user.
9. After Gemini completes, tell the user: "You can resume this Gemini session at any time by saying 'gemini resume' or asking me to continue with additional analysis or changes."

### Quick Reference

| Use case                     | Approval mode           | Key flags                                                      |
| ---------------------------- | ----------------------- | -------------------------------------------------------------- |
| Read-only review or analysis | `default`               | `-p "..."` (no edits applied; model only reads)                |
| Apply local edits            | `auto_edit`             | `--approval-mode auto_edit -s -p "..."`                        |
| Full automation              | `yolo`                  | `--approval-mode yolo -s -p "..."`                             |
| Plan without executing tools | `plan`                  | `--approval-mode plan -p "..."`                                |
| Machine-readable output      | match task needs        | `--output-format json -p "..."`, then parse `.response` (`jq`) |
| Resume recent session        | inherited from original | `gemini -r "latest" "prompt"` (no model flag)                  |

## Following Up

- After every `gemini` command, use `AskUserQuestion` to confirm next steps, collect clarifications, or decide whether to resume.
- When resuming, pass the new prompt positionally: `gemini -r "latest" "new prompt"`. The resumed session reuses the original model and approval mode.
- Restate the chosen model and approval mode when proposing follow-up actions.

## Critical Evaluation of Gemini Output

Gemini is powered by Google models with their own knowledge cutoffs and limitations. Treat Gemini as a **colleague, not an authority**.

- **Trust your own knowledge** when confident. If Gemini claims something you know is wrong, push back directly.
- **Research disagreements** with `WebSearch` or documentation before accepting Gemini's claims.
- **Remember knowledge cutoffs** — Gemini may not know about recent releases, APIs, or changes.
- **Don't defer blindly**, especially on model names/capabilities, recent library versions or API changes, and evolving best practices.

When Gemini is wrong: state the disagreement to the user, provide evidence, and optionally resume the session to discuss — identify yourself as Claude using your actual current model name, frame it as a peer discussion (either AI could be wrong), and let the user decide on genuine ambiguity:

```bash
gemini -r "latest" "This is Claude (<your current model name>) following up. I disagree with [X] because [evidence]. What's your take?"
```

## Error Handling

- Stop and report failures whenever `gemini --version` or a `gemini -p` command exits non-zero; ask for direction before retrying.
- Before using high-impact flags (`--approval-mode yolo`, `--yolo`, `-s` with broad access, `-a`/`--all-files` on large repos) ask permission via `AskUserQuestion` unless already granted.
- When output includes warnings or partial results, summarize them and ask how to adjust via `AskUserQuestion`.
