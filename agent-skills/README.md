# Autopilot Agent Skills (portable layout)

<!-- GENERATED FILE — do not edit. Regenerate with `bun run export:skills`. -->

Generated from the [autopilot Claude Code plugin](https://github.com/awinogradov/code-assistants/tree/main/claude-plugins/autopilot) — the single source of truth. Each directory below is a portable [Agent Skill](https://github.com/awinogradov/code-assistants/blob/main/docs/18-agent-skills-export.md) (`SKILL.md`) consumable by any SKILL.md-compatible CLI. A Claude Code slash command `/autopilot:x` corresponds to the exported skill `autopilot-x`.

## Install

- **OpenAI Codex CLI** — copy the skill directories into `~/.codex/skills/` (personal) or `.codex/skills/` (project); `~/.agents/skills/` also works. Invoke with the `$` prefix (e.g. `$autopilot-commits-create`) or let auto-matching pick the skill up.
- **Kimi Code CLI** — copy the skill directories into a configured skills directory (user, project, or extra); see [Agent Skills — Kimi Code CLI docs](https://moonshotai.github.io/kimi-cli/en/customization/skills.html).
- **Claude Code** — do not install these; use the [autopilot plugin](https://github.com/awinogradov/code-assistants/tree/main/claude-plugins/autopilot) instead, which keeps subagents, tool permissions, and plan mode.

Repositories synced by the agents-skills-sync action receive this layout under `.agents/skills/` automatically.

## Skills

| Skill | Description |
| ----- | ----------- |
| [autopilot-ascii-schemas](./autopilot-ascii-schemas/SKILL.md) | Generate ASCII schemas, diagrams, and UI wireframes using Unicode box-drawing characters (wiretext conventions). Use when creating architecture diagrams, entity-relationship models, database schemas, flow charts, deployment topologies, sequence diagrams, data flow visualizations, UI wireframes, screen mockups, or any visual schema in plans, documents, or conversations. Trigger on: "diagram", "schema", "ASCII art", "draw", "visualize", "architecture diagram", "ER diagram", "flow chart", "topology", "sequence diagram", "data flow", "wireframe", "mockup", "screen layout", "UI sketch", "page layout". Do NOT use for: code formatting, markdown tables, or image-based diagrams. If @wiretext/mcp server is connected, prefer its create_wireframe/render_wireframe tools for UI wireframes — they produce higher-fidelity output with 30+ components. |
| [autopilot-ask-codex](./autopilot-ask-codex/SKILL.md) | Delegate a code analysis, refactoring, or automated-editing task to the OpenAI Codex CLI (codex exec / codex resume), then critically evaluate its output as a peer AI. Use when the user asks to run Codex, references OpenAI Codex, or wants a second model's take on the code. |
| [autopilot-ask-gemini](./autopilot-ask-gemini/SKILL.md) | Delegate a code analysis, refactoring, or automated-editing task to the Google Gemini CLI (gemini -p / gemini --resume), then critically evaluate its output as a peer AI. Use when the user asks to run Gemini, references the Gemini CLI, or wants a second model's take on the code. |
| [autopilot-branch-create](./autopilot-branch-create/SKILL.md) | Create and checkout a git branch following repository naming conventions with GitHub issue integration. Use when creating branches, or when invoked from other skills. |
| [autopilot-commits-create](./autopilot-commits-create/SKILL.md) | Analyze staged changes and create conventional commits with intelligent grouping. Use when creating commits, or when invoked from other skills. |
| [autopilot-commits-restructure](./autopilot-commits-restructure/SKILL.md) | Restructure messy draft commits into proper conventional commits |
| [autopilot-dependabot-resolve](./autopilot-dependabot-resolve/SKILL.md) | Review and merge dependabot PRs safely using gh CLI. Process one-by-one to avoid package-lock.json conflicts |
| [autopilot-explore](./autopilot-explore/SKILL.md) | Map this repository broadly, write a durable context brief to .claude/context/brief.md, then take surgical fixes one at a time with no plan, branch, or PR machinery. Use when you have an area rather than a task — "help me understand this repo", "explore the refactoring flow" — and want the codebase understood before deciding what to change. |
| [autopilot-gather-context](./autopilot-gather-context/SKILL.md) | Acquire all planning context in one parallel fan-out and emit a Context Map. Use when plan or run needs issue, standards, branch, and codebase context without loading raw documents into the parent conversation. |
| [autopilot-issue-create](./autopilot-issue-create/SKILL.md) | Create a GitHub issue with a structured body (Context, What, Why, Scope, Solution) and curated labels via the gh CLI. Use when filing new issues, or when invoked from other skills. |
| [autopilot-issue-run](./autopilot-issue-run/SKILL.md) | List recent open GitHub or Linear issues, pick one, and start autopilot on it via the run skill. Use to go from browsing issues to a running autopilot session in one step. |
| [autopilot-linear-create](./autopilot-linear-create/SKILL.md) | Create a Linear issue with a structured body (Context, What, Why, Scope, Solution) and wizard-selected status, label, and assignee via the Linear MCP. Use when filing a Linear ticket on a linear-tracked project. |
| [autopilot-linear-plan](./autopilot-linear-plan/SKILL.md) | Plan a Linear issue exactly as the plan skill does, expert-reviewed when --experts-review is passed, then store the finished plan in that issue's description so it outlives the session. Storing is unconditional — the recorded score or skip is information on the ticket, never used as a gate. |
| [autopilot-linear-run](./autopilot-linear-run/SKILL.md) | Run any Linear issue end to end. Executes a valid stored plan verbatim when one exists; otherwise drafts, reviews, and implements a fresh plan without a human approval gate. |
| [autopilot-pdf-create](./autopilot-pdf-create/SKILL.md) | Generate a beautiful, brand-themed, multi-page PDF — report, research doc, six-pager, or playbook — from structured content using a bundled @react-pdf/renderer pipeline (direct rendering, no headless browser). Use when the user asks to create, generate, build, export, or design a PDF, report, whitepaper, six-pager, playbook, proposal, or branded document, especially from notes, data, or a Google design.md brand spec. Trigger on: "PDF", "create a report", "generate a document", "six-pager", "playbook", "proposal", "whitepaper", "branded PDF", "design.md", "export to PDF". Do NOT use for: editing or extracting text from an existing PDF, or filling PDF forms. |
| [autopilot-pr-answer](./autopilot-pr-answer/SKILL.md) | Answer a user comment on a PR review and update review state if needed |
| [autopilot-pr-create](./autopilot-pr-create/SKILL.md) | Create a pull request with validated title and description following repository conventions. Use when creating PRs, or when invoked from other skills. |
| [autopilot-pr-monitor](./autopilot-pr-monitor/SKILL.md) | Monitor a PR for review approval and CI check status, blocking until approved with all checks passing. Fixes CI failures and resolves review feedback. Use when waiting for PR approval. |
| [autopilot-pr-resolve](./autopilot-pr-resolve/SKILL.md) | Address PR review comments by analyzing feedback, making code fixes, and replying to reviewers. Use when resolving review feedback on a pull request. |
| [autopilot-pr-review](./autopilot-pr-review/SKILL.md) | Review a pull request and provide constructive feedback with structured verdict. Used by awinogradov/code-review-action |
| [autopilot-pr-update](./autopilot-pr-update/SKILL.md) | Update an existing pull request's title and description based on current branch commits. Use when PR needs to be refreshed after new commits or when asked to update PR. |
| [autopilot-pr-validate](./autopilot-pr-validate/SKILL.md) | Validate a PR title and branch name against repository contributing guidelines |
| [autopilot-preflight-check](./autopilot-preflight-check/SKILL.md) | Validate git working state before committing, branching, or opening a PR. Detects wrong branch, stale merged branches, uncommitted changes, and out-of-date main. |
| [autopilot-run](./autopilot-run/SKILL.md) | Plan, implement, commit, create PR, and monitor until approved |
| [autopilot-shared-rules](./autopilot-shared-rules/SKILL.md) | Canonical home for instruction blocks shared by several autopilot skills and agents — reference formatting (RFC-0001), AskUserQuestion formatting and content-preview contract, codebase context acquisition (graphify → repomix → default tools), agent structured output, issue body grammar, Linear MCP access, peer CLI delegation, and PR title/body grammar. Read the one block you need instead of carrying a copy. |
| [autopilot-todo-cleanup](./autopilot-todo-cleanup/SKILL.md) | Scan codebase for TODO/FIXME comments, verify actuality, create GitHub issues, and update links |

## Skills derived from subagents

These run as isolated subagents in Claude Code; in other CLIs they run inline and their structured output block is the result.

| Skill | Description |
| ----- | ----------- |
| [autopilot-analyze-pr-commits](./autopilot-analyze-pr-commits/SKILL.md) | Analyze branch commits, diff, and the linked GitHub or Linear issue for PR context. Use when pr:create or pr:update needs pre-computed context without polluting parent conversation. |
| [autopilot-analyze-staged-changes](./autopilot-analyze-staged-changes/SKILL.md) | Categorize staged files and assess commit strategy. Use when commits:create needs pre-computed analysis without polluting parent conversation. |
| [autopilot-digest-branch-diff](./autopilot-digest-branch-diff/SKILL.md) | Summarize a branch's commits and diff against main, and detect a stale-merged branch whose work already landed upstream. Use when planning skills need the in-flight change set without an unbounded diff in parent context. |
| [autopilot-digest-repo-standards](./autopilot-digest-repo-standards/SKILL.md) | Read a repository's own README, docs/, rfc/, principles/, and CLAUDE.md and return a bounded standards digest. Use when planning skills need the project's conventions without loading the full documents into parent context. |
| [autopilot-digest-session-history](./autopilot-digest-session-history/SKILL.md) | Map task-relevant files and commits to the Entire sessions and checkpoints that produced them via the entire CLI. Use when planning skills need session history without raw transcripts in parent context. |
| [autopilot-expert-review](./autopilot-expert-review/SKILL.md) | Review an implementation plan as a domain expert. Use when plan skills need isolated expert scoring to prevent context flooding. |
| [autopilot-fetch-pr-reviews](./autopilot-fetch-pr-reviews/SKILL.md) | Fetch, filter, and categorize PR review comments by severity. Use when PR skills need categorized review feedback without raw API output in context. |
| [autopilot-resolve-alert-context](./autopilot-resolve-alert-context/SKILL.md) | Fetch GitHub code-scanning alert context via the code-scanning API. Use when plan/run resolve a code-scanning-alert input without polluting parent context. |
| [autopilot-resolve-assignees](./autopilot-resolve-assignees/SKILL.md) | Resolve candidate assignees for an issue from CODEOWNERS and Linear team members, with the current Linear user first. Use when a creation skill needs an assignee picklist without polluting parent context. |
| [autopilot-resolve-issue-context](./autopilot-resolve-issue-context/SKILL.md) | Fetch issue context from GitHub (gh) or Linear (bundled GraphQL helper keyed by LINEAR_API_KEY) and optionally auto-assign the current user (idempotent, opt-in via caller flag). Use when commands need structured issue data without polluting parent context. |
| [autopilot-scan-and-analyze-todos](./autopilot-scan-and-analyze-todos/SKILL.md) | Scan codebase for TODO/FIXME comments and analyze their GitHub or Linear issue status. Use when todo-cleanup needs scan + analysis without polluting parent context. |
| [autopilot-search-codebase-todos](./autopilot-search-codebase-todos/SKILL.md) | Search for TODOs and GitHub/Linear issue references in the codebase. Use when plan command needs TODO search in parallel with other context agents. |

## Claude Code-only skills (not exported)

- [plan](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/plan/SKILL.md) — its human approval gate is Claude Code plan mode (EnterPlanMode/ExitPlanMode); without it the skill's contract — no edits before an approved plan — silently disappears
- [run-primed](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/run-primed/SKILL.md) — consumes the SHA-validated context brief a Claude Code explore session writes to .claude/context/brief.md and fails loudly without that Claude-session artifact
