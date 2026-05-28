# Autopilot Claude Plugin

[![GitHub Release](https://img.shields.io/badge/release-v0.1.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/awinogradov/code-assistants/actions/workflows/release_create.yml)

> Part of the [code-assistants](../../README.md) marketplace repository.

Slash commands, skills, and agents for AI-assisted development workflows.

**Upgrading?** See [MIGRATING.md](./MIGRATING.md) for breaking changes and upgrade instructions.

## Installation

### From GitHub (recommended)

First, add the marketplace:

```bash
/plugin marketplace add awinogradov/code-assistants
```

Then install the plugin. Choose the scope that fits your workflow:

| Scope       | Flag              | Stored in                     | Shared via git | Availability              |
| ----------- | ----------------- | ----------------------------- | -------------- | ------------------------- |
| **user**    | `--scope user`    | `~/.claude/settings.json`     | No             | All your projects         |
| **project** | `--scope project` | `.claude/settings.json`       | Yes            | All project collaborators |
| **local**   | `--scope local`   | `.claude/settings.local.json` | No             | Only you, only this repo  |

```bash
# Install for all your projects (default)
/plugin install autopilot@code-assistants

# Install for the team (checked into git)
/plugin install autopilot@code-assistants --scope project

# Install only for this repo, not shared
/plugin install autopilot@code-assistants --scope local
```

### Local development

```bash
claude --plugin-dir .
```

After installation, restart Claude Code.

## Structure

```
code-assistants/
├── .claude-plugin/
│   └── marketplace.json            # Marketplace manifest (lists all plugins)
└── claude-plugins/
    └── autopilot/                  # This plugin
        ├── .claude-plugin/
        │   └── plugin.json         # Plugin metadata
        ├── .mcp.json               # MCP servers
        ├── agents/                 # Sub-agents
        │   ├── analyze-pr-commits.md
        │   ├── analyze-staged-changes.md
        │   ├── expert-review.md
        │   ├── fetch-pr-reviews.md
        │   ├── resolve-issue-context.md
        │   ├── scan-and-analyze-todos.md
        │   ├── search-codebase-todos.md
        │   ├── pr:review:ai-smells.md
        │   ├── pr:review:architecture.md
        │   ├── pr:review:common-sense.md
        │   ├── pr:review:complexity.md
        │   ├── pr:review:correctness.md
        │   ├── pr:review:pr-hygiene.md
        │   ├── pr:review:standards.md
        │   ├── pr:review:surface-correctness.md
        │   ├── pr:review:surface-naming.md
        │   ├── pr:review:surface-testing.md
        │   └── pr:review:testing.md
        └── skills/                 # Skills
            ├── ascii-schemas/
            ├── branch:create/
            ├── commits:create/
            ├── commits:restructure/
            ├── dependabot:resolve/
            ├── issue:create/
            ├── plan/
            ├── plan-bun/
            ├── plan-nodejs-react/
            ├── pr:answer/
            ├── pr:create/
            ├── pr:monitor/
            ├── pr:resolve/
            ├── pr:review/
            ├── pr:update/
            ├── pr:validate/
            ├── preflight-check/
            ├── run/
            └── todo-cleanup/
```

## Slash Skills

All user-invocable entries are skills. Skills natively accept `$ARGUMENTS` and show `argument-hint` autocomplete. Invoke any of the entries below via `/<name>` at the slash prompt.

### Codebase context snapshot

The skills that need whole-codebase context — `/autopilot:plan`, `/autopilot:run`, `/autopilot:issue-create`, `/autopilot:pr-review`, `/autopilot:pr-answer`, `/autopilot:pr-resolve` — read the committed `.repomix/pack.xml` snapshot first (via `attach_packed_output`) and fall back to a live `pack_codebase` when it is absent. The snapshot is refreshed by CI on every merge to `main`; see the consumer host repo's [Committed Repomix pack](../../docs/repomix-pack.md) doc for details.

### `/autopilot:branch-create`

Create a git branch following repository naming conventions with GitHub issue integration.

```bash
/autopilot:branch-create 123                                     # Auto-generate slug from GitHub issue title
/autopilot:branch-create 123 "custom description"                # Use custom slug
/autopilot:branch-create --hotfix "memory leak in editor"        # Emergency production fix
/autopilot:branch-create --trivial "fix typo in readme"          # Typos, docs, formatting
/autopilot:branch-create --maintenance "upgrade node to 22"      # Deps, CI, configs
/autopilot:branch-create --proposal "add vim keybindings"        # Suggest a change without an issue
```

### `/autopilot:issue-create`

Create a GitHub issue with a structured body (Context / What / Why / Scope / Solution) and curated labels via the `gh` CLI. Titles are plain business descriptions — no convention prefixes. Uses the [codebase context snapshot](#codebase-context-snapshot).

```bash
/autopilot:issue-create                                                # Prompt for hint, generate everything
/autopilot:issue-create "users cannot reset password via email"        # Use hint to seed title and body
/autopilot:issue-create "refactor token streaming pipeline"            # Solution may include ASCII diagram
```

### `/autopilot:commits-create`

Analyze changes and create a conventional commit message.

```bash
/autopilot:commits-create                     # Analyze staged changes, generate commit
/autopilot:commits-create "add auth feature"  # Provide context for better message
```

### `/autopilot:commits-restructure`

Restructure messy draft commits (wip, fix, btw) into proper conventional commits.

```bash
/autopilot:commits-restructure              # Restructure commits since main
/autopilot:commits-restructure --base dev   # Restructure commits since dev branch
```

### `/autopilot:pr-create`

Create a pull request with validated title and description.

```bash
/autopilot:pr-create                                              # Basic PR, closes issue from branch
/autopilot:pr-create --draft                                      # Create as draft
/autopilot:pr-create --closes 124,125                             # Close additional issues
/autopilot:pr-create --related 100                                # Link related issues
/autopilot:pr-create --draft --closes 124 --related 100,101       # Combine all options
/autopilot:pr-create --release-notes                              # Include release notes section
/autopilot:pr-create --release-notes --closes 124                 # Release notes + close issues
```

### `/autopilot:pr-update`

Update an existing PR's title and description based on current branch commits.

```bash
/autopilot:pr-update                                    # Update PR from current commits
/autopilot:pr-update --release-notes                    # Update with release notes section
/autopilot:pr-update --closes 125                       # Add issue to close
/autopilot:pr-update --related 100                      # Add related issue
```

### `/autopilot:plan`

Perform deep analysis and create a validated implementation plan. Detects tech stack automatically. Uses the [codebase context snapshot](#codebase-context-snapshot).

```bash
/autopilot:plan #42                                                      # From GitHub issue
/autopilot:plan 123                                                      # From GitHub issue number
/autopilot:plan https://github.com/org/repo/issues/789                   # From GitHub URL
/autopilot:plan "add user authentication"                                # From description
/autopilot:plan #42 I think we should start with the auth module         # Issue + additional context
```

### `/autopilot:run`

Plan, implement, commit, create PR, and monitor until approved. Same as `/autopilot:plan` but after plan confirmation, automatically commits, creates a PR, and monitors for review approval. Uses the [codebase context snapshot](#codebase-context-snapshot).

```bash
/autopilot:run #42                                                      # From GitHub issue
/autopilot:run 123                                                      # From GitHub issue number
/autopilot:run https://github.com/org/repo/issues/789                   # From GitHub URL
/autopilot:run "add user authentication"                                # From description
/autopilot:run #42 I think we should start with the auth module         # Issue + additional context
```

### `/autopilot:todo-cleanup`

Scan codebase for TODO/FIXME comments, verify actuality against GitHub issues, and create/link issues.

```bash
/autopilot:todo-cleanup
```

### `/autopilot:dependabot-resolve`

Review and merge dependabot PRs safely, one-by-one.

```bash
/autopilot:dependabot-resolve
```

### `/autopilot:pr-review`

Review a pull request and provide constructive feedback with structured verdict output. Used by the [Code Review Action](https://github.com/awinogradov/code-review-action) action. Uses the [codebase context snapshot](#codebase-context-snapshot).

```bash
/autopilot:pr-review REPO: owner/repo PR_NUMBER: 123 REVIEWER: tars-copilot PR_AUTHOR: username
```

### `/autopilot:pr-answer`

Answer a user comment on a PR review and update review state if needed. Used by the [Code Review Action](https://github.com/awinogradov/code-review-action) action. Uses the [codebase context snapshot](#codebase-context-snapshot).

```bash
/autopilot:pr-answer REPO: owner/repo PR_NUMBER: 123 REVIEWER: tars-copilot COMMENT_BODY: "..." COMMENT_PATH: src/file.ts COMMENT_LINE: 42
```

### `/autopilot:pr-resolve`

Address PR review comments. Fetches review feedback, categorizes by severity, makes code fixes, replies to comment threads, and updates the PR. Uses the [codebase context snapshot](#codebase-context-snapshot).

```bash
/autopilot:pr-resolve
```

### `/autopilot:pr-monitor`

Monitor a PR for review approval and CI check status. Blocks until approved with all checks passing, automatically resolving review feedback and fixing CI failures.

```bash
/autopilot:pr-monitor
```

### `/autopilot:pr-validate`

Validate a PR title and branch name against contributing guidelines. Used by the [contributing-action](https://github.com/awinogradov/contributing-action) action.

```bash
/autopilot:pr-validate PR_TITLE: "Allow password reset via email" BRANCH_NAME: "issue-123-add-password-reset" PR_AUTHOR: "username"
```

### `/autopilot:ascii-schemas`

Generate ASCII schemas, diagrams, and UI wireframes using Unicode box-drawing characters (wiretext conventions). Use for architecture diagrams, ER models, flow charts, sequence diagrams, and UI mockups.

```bash
/autopilot:ascii-schemas
```

## Agents

### `pr:review:*` (11 agents)

Specialized review sub-agents launched in parallel by the `pr:review` skill. Each owns one review category with its own model declaration. The main skill aggregates findings from all agents into a unified review.

| Agent                           | Model  | Focus                                                   |
| ------------------------------- | ------ | ------------------------------------------------------- |
| `pr:review:correctness`         | sonnet | Logic errors, async bugs, serialization                 |
| `pr:review:testing`             | sonnet | Mock quality, coverage gaps, test structure             |
| `pr:review:complexity`          | haiku  | Function length, nesting, naming, comments              |
| `pr:review:standards`           | haiku  | Lint suppression, commit conventions, validation libs   |
| `pr:review:architecture`        | sonnet | Code reuse, coupling, pattern consistency               |
| `pr:review:ai-smells`           | sonnet | Over-engineering, unnecessary wrappers, verbose logging |
| `pr:review:common-sense`        | sonnet | Constants, operational concerns, error messages         |
| `pr:review:pr-hygiene`          | sonnet | Diff/description match, atomicity, commit structure     |
| `pr:review:surface-correctness` | haiku  | Unreachable code, datetime, broad catches               |
| `pr:review:surface-testing`     | haiku  | Missing tests, flaky indicators, placeholders           |
| `pr:review:surface-naming`      | haiku  | Duplication, file naming, directory placement           |

### Helper sub-agents (7 agents)

Context-isolating workers invoked by other skills to keep the parent conversation small. Each returns a structured summary only.

| Agent                    | Model   | Used by                        | Purpose                                                                               |
| ------------------------ | ------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `analyze-pr-commits`     | sonnet  | `pr:create`, `pr:update`       | Summarize branch commits, diff, and linked issue for PR context                       |
| `analyze-staged-changes` | haiku   | `commits:create`               | Categorize staged files and recommend a commit strategy                               |
| `expert-review`          | inherit | `plan`, `plan-*`               | Score an implementation plan as a domain expert                                       |
| `fetch-pr-reviews`       | sonnet  | `pr:answer`, `pr:resolve`      | Fetch, filter, and categorize PR review comments by severity                          |
| `resolve-issue-context`  | sonnet  | `plan`, `run`, `branch:create` | Fetch GitHub issue context; optionally auto-assign current user (idempotent) via `gh` |
| `scan-and-analyze-todos` | sonnet  | `todo-cleanup`                 | Scan codebase for TODOs and check linked GitHub issue statuses                        |
| `search-codebase-todos`  | haiku   | `plan`                         | Search the codebase for TODOs and references to a specific issue                      |

## Internal Skills (not in slash menu)

These skills set `user-invocable: false` — they run only when invoked programmatically via `Skill(autopilot:X)` from other skills. They do not appear in the `/` menu.

### `preflight-check`

Validate git working state before branching, committing, or opening a PR. Mode-aware: in `plan`/`branch` modes it fetches remote and offers to pull; in `commits`/`pr` modes it warns if you are on `main` and offers to create a branch first. Invoked automatically at the start of `/autopilot:branch-create`, `/autopilot:commits-create`, `/autopilot:pr-create`, `/autopilot:plan`, and `/autopilot:run`.

### `plan-*`

Stack-specific planning skills invoked automatically by `/autopilot:plan` and `/autopilot:run` based on the repo's `package.json` `agents.rules` field.

Available variants: `plan-bun` (also handles `Bun+React+Tailwind`), `plan-nodejs-react` (also handles `NodeJS+React+Tailwind`)

## Contributing

### Adding Skills

Create a subdirectory in `skills/` with a `SKILL.md` file:

```
skills/
└── my-skill/
    ├── SKILL.md      # Required: skill definition
    └── references/   # Optional: supporting docs
```

### Adding Agents

Create a `.md` file in `agents/` with capabilities:

```markdown
---
description: Agent role and expertise
capabilities:
  - Specific task 1
  - Specific task 2
---

Detailed agent instructions...
```

### MCP Servers

Configure in `.mcp.json` at plugin root:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "sse",
      "url": "https://mcp.example.com/sse"
    }
  }
}
```

### Versioning

Update version in `.claude-plugin/plugin.json` following [semantic versioning](https://semver.org/):

| Change Type      | Version Bump | Example       |
| ---------------- | ------------ | ------------- |
| Breaking changes | MAJOR        | 1.0.0 → 2.0.0 |
| New features     | MINOR        | 1.0.0 → 1.1.0 |
| Bug fixes        | PATCH        | 1.0.0 → 1.0.1 |

### Testing Locally

See [Local development](#local-development) in the Installation section.
