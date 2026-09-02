# Autopilot Claude Plugin

[![GitHub Release](https://img.shields.io/badge/release-v7.4.0-blue)](https://github.com/awinogradov/code-assistants/releases/latest)
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

### From npm (version-pinned)

The full plugin — `skills/`, `agents/`, `lib/`, `.claude-plugin/plugin.json`, and `.mcp.json` — ships as the public npm package `@code-assistants/autopilot`, so a consuming repository pins one immutable version in `package.json` and its lockfile records the resolved artifact with registry integrity. Per this repo's conventions, pin the exact version (no `^` or `~`):

```bash
npm install --save-exact @code-assistants/autopilot
# or
bun add --exact @code-assistants/autopilot
```

Dependabot and Renovate then propose upgrades through their normal dependency path — no more tracking a plugin version and a source commit SHA separately.

The installed package directory is itself a single-plugin Claude Code marketplace (it ships its own `.claude-plugin/marketplace.json`), so register it from the local path — no writes to Claude's internal plugin cache:

```bash
/plugin marketplace add ./node_modules/@code-assistants/autopilot
/plugin install autopilot@code-assistants-autopilot
```

Verified end-to-end with Claude Code 2.1.226 against the 7.1.2 artifact (`marketplace add` → `install` → plugin enabled); the pack-and-install contract is enforced continuously by [`lib/packContract.test.ts`](./lib/packContract.test.ts).

npm is the dependency-managed distribution. The alternatives stay supported and unchanged: the GitHub marketplace above, [`agents-skills-sync`](../../.github/actions/agents-skills-sync/README.md) for file-sync consumers, and portable-skills copying per [RFC-0002](../../rfc/0002-portable-skills-layout.md).

### Local development

```bash
claude --plugin-dir .
```

After installation, restart Claude Code.

### Use with Codex, Kimi, and other CLIs

The `skills/` directory IS the portable Agent Skills layout ([RFC-0002](../../rfc/0002-portable-skills-layout.md)) — no generated copy, no transform. Copy skill directories straight into your CLI's skills directory (`~/.codex/skills/` for Codex CLI; a configured skills directory for Kimi Code CLI), or let the [`agents-skills-sync`](../../.github/actions/agents-skills-sync/README.md) action publish them verbatim into your repository's `.agents/skills/`. A `/autopilot:x` slash command corresponds to the skill `x` — the namespace comes from the plugin at runtime. See [Portable single-source skills](../../docs/18-agent-skills-export.md) for details and the Claude Code-only mechanics in `plan` and `run-primed`.

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
        │   ├── digest-repo-standards.md
        │   ├── expert-review.md
        │   ├── resolve-alert-context.md
        │   ├── resolve-assignees.md
        │   ├── digest-session-history.md
        │   ├── resolve-issue-context.md
        │   ├── scan-and-analyze-todos.md
        │   └── search-codebase-todos.md
        └── skills/                 # Skills
            ├── ascii-schemas/
            ├── branch-create/
            ├── commits-create/
            ├── commits-restructure/
            ├── dependabot-resolve/
            ├── explore/
            ├── gather-context/
            ├── issue-create/
            ├── issue-run/
            ├── linear-create/
            ├── linear-plan/
            ├── linear-run/
            ├── pdf-create/             # bundles a self-contained Node renderer/ sub-project
            ├── plan/                   # bundles references/ loaded on demand
            ├── pr-answer/
            ├── pr-create/
            ├── pr-monitor/
            ├── pr-resolve/
            ├── pr-review/
            ├── pr-update/
            ├── pr-validate/
            ├── preflight-check/
            ├── run/
            ├── run-primed/
            ├── shared-rules/           # bundles references/ — the canonical shared instruction blocks
            └── todo-cleanup/
```

## Slash Skills

All user-invocable entries are skills. Skills natively accept `$ARGUMENTS` and show `argument-hint` autocomplete. Invoke any of the entries below via `/<name>` at the slash prompt.

### Codebase context snapshot

The skills that need whole-codebase context — `/autopilot:plan`, `/autopilot:run`, `/autopilot:run-primed`, `/autopilot:linear-plan`, `/autopilot:linear-run`, `/autopilot:explore`, `/autopilot:issue-create`, `/autopilot:pr-review`, `/autopilot:pr-answer`, `/autopilot:pr-resolve` — acquire it through an ordered source chain: a committed [graphify](https://github.com/Graphify-Labs/graphify) knowledge graph (`graphify-out/graph.json`, queried offline) when the repository carries one, otherwise the committed `.repomix/pack.xml` snapshot (via `attach_packed_output`, falling back to a live `pack_codebase`), otherwise plain Grep/Glob/Read and `git`. `/autopilot:run-primed` re-runs the chain rather than reusing the `outputId` recorded in its context brief, because that id is session-scoped and dead in a forked session. The repomix snapshot is refreshed by CI on every merge to `main`; see the consumer host repo's [Committed Repomix pack](../../docs/09-repomix-pack.md) doc for details.

### `/autopilot:branch-create`

Create a git branch following repository naming conventions with GitHub issue integration. For an issue branch it also self-assigns the issue to you when possible (best-effort; never blocks branch creation).

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

### `/autopilot:issue-run`

Pick one of the repository's recent open issues and start autopilot on it. Lists the most-recently-updated open issues via `gh issue list`, lets you select one (or type any number), then hands it to `/autopilot:run`.

```bash
/autopilot:issue-run                # List recent open issues, pick one, run autopilot
/autopilot:issue-run 142            # Skip the picker, run autopilot on issue #142
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

Perform deep analysis and create a validated implementation plan. Detects tech stack automatically. Uses the [codebase context snapshot](#codebase-context-snapshot). See [how the plan and run skills work](../../docs/05-plan-run-skills.md) for the full phase-by-phase flow.

```bash
/autopilot:plan #42                                                      # From GitHub issue
/autopilot:plan 123                                                      # From GitHub issue number
/autopilot:plan https://github.com/org/repo/issues/789                   # From GitHub URL
/autopilot:plan "add user authentication"                                # From description
/autopilot:plan #42 I think we should start with the auth module         # Issue + additional context
```

### `/autopilot:run`

Plan and implement without a plan-approval pause, then select one of two terminal paths. A task whose verified plan explicitly requires no repository edits reports `Outcome: no_repository_change`; a repository change is committed, opened as a PR, and monitored for review approval. A Linear-issue input additionally gets the finalized plan stored on its ticket before implementation — the same stored format `/autopilot:linear-plan` writes; see [the linear-plan skill](../../docs/16-linear-plan-skill.md). Uses the [codebase context snapshot](#codebase-context-snapshot). See [how the plan and run skills work](../../docs/05-plan-run-skills.md#how-run-differs-automated-post-implementation) for the terminal-path contract.

```bash
/autopilot:run #42                                                      # From GitHub issue
/autopilot:run 123                                                      # From GitHub issue number
/autopilot:run https://github.com/org/repo/issues/789                   # From GitHub URL
/autopilot:run ENG-123                                                  # From Linear issue (plan stored on the ticket)
/autopilot:run "add user authentication"                                # From description
/autopilot:run #42 I think we should start with the auth module         # Issue + additional context
```

### `/autopilot:run-primed`

Same as `/autopilot:run`, but reads the repository from a validated `.claude/context/brief.md` instead of re-running the codebase fan-out. See [the run-primed skill](../../docs/15-run-primed-skill.md) for the full contract.

**Precondition:** the session must already have been primed by `/autopilot:explore`, and the orchestrator must have placed that brief in this checkout — `.claude/context/` is git-ignored, so a clone never carries it. A restored transcript on its own is not enough. When the brief is missing, malformed, stale, or from another revision, the skill stops with an actionable error and names `/autopilot:run` as the fallback; it never downgrades on its own.

```bash
/autopilot:run-primed #42                                               # From GitHub issue
/autopilot:run-primed https://github.com/org/repo/issues/789            # From GitHub URL
```

### `/autopilot:explore`

Map the repository broadly, write a durable context brief to `.claude/context/brief.md`, then take surgical fixes one at a time. Uses the [codebase context snapshot](#codebase-context-snapshot). See [the explore skill](../../docs/14-explore-skill.md) for the full flow.

Reach for it when you have an _area_ rather than a target and the changes that follow are small and located. Unlike `/autopilot:plan` and `/autopilot:run` it never branches, never opens a PR, and never asks for approval — invoking it commits you to nothing.

```bash
/autopilot:explore                                                      # Takes no arguments; the map is broad by design
```

Re-invoking it refreshes the brief, replaying the full fan-out only when something other than derived files moved upstream. Deleting the brief is the supported reset.

### `/autopilot:linear-create`

Create a Linear issue with the same five-section body as `/autopilot:issue-create` (Context / What / Why / Scope / Solution), then pick its workflow status, labels, and assignee through a short wizard. Above the five sections it keeps your original prompt verbatim in a collapsed section. See [Linear tracker support](../../docs/11-linear-tracker.md) for the tracker contract.

**Precondition:** a `linear` tracker in `package.json` `agents.trackers`. Without one the skill stops and points at `/autopilot:issue-create` for a GitHub issue instead.

```bash
/autopilot:linear-create                                                # Prompt for hint, generate everything
/autopilot:linear-create "users cannot reset password via email"        # Use hint to seed title and body
```

### `/autopilot:linear-plan`

Same as `/autopilot:plan`, but stores the finished plan in its Linear ticket's description so it outlives the session — then stops, without implementing. See [the linear-plan skill](../../docs/16-linear-plan-skill.md) for the stored format.

**Precondition:** a `linear` tracker in `package.json` `agents.trackers`, a Linear issue as the argument, and a reachable Linear MCP server. All three are checked before the expensive planning pass, and each names `/autopilot:plan` as the alternative. Storing is unconditional — expert review runs only when `--experts-review` is passed (as in `/autopilot:plan`), and the stored header records the score, or `Score: skipped` without the flag, as information for the ticket's reader, never as a gate.

```bash
/autopilot:linear-plan ENG-123                                          # From Linear id
/autopilot:linear-plan https://linear.app/acme/issue/ENG-123            # From Linear URL
```

### `/autopilot:linear-run`

Same as `/autopilot:run`, but first checks the Linear ticket for a durable plan. A valid stored plan is executed verbatim; when no executable stored plan is available, the skill drafts and reviews a fresh plan before continuing autonomously. See [the linear-run skill](../../docs/17-linear-run-skill.md) for the two-mode contract.

**Precondition:** only a Linear ticket is required. Missing, unreadable, malformed, or unverifiable stored-plan data selects the fresh-plan path instead of rejecting the issue. The fallback never invokes `/autopilot:linear-plan` or rewrites the ticket description.

```bash
/autopilot:linear-run ENG-123                                           # From Linear id
/autopilot:linear-run https://linear.app/acme/issue/ENG-123             # From Linear URL
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

Address PR review comments. Fetches review feedback, categorizes by severity, makes code fixes, replies to comment threads, and updates the PR. Uses the [codebase context snapshot](#codebase-context-snapshot). Aborts when the pull request conflicts with its base, since fixes pushed onto a conflicting branch stay unmergeable.

```bash
/autopilot:pr-resolve
```

### `/autopilot:pr-monitor`

Monitor a PR for review approval and CI check status. Blocks until approved with all checks passing, automatically resolving review feedback and fixing CI failures. Detects a conflicting branch and rebases it onto its base the sanctioned way, reporting and stopping when the rebase cannot complete cleanly.

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

### `/autopilot:pdf-create`

Generate a beautiful, brand-themed, multi-page PDF — report, research doc, six-pager, or playbook — from structured content, using a bundled `@react-pdf/renderer` pipeline (direct rendering, no headless browser). Optionally themed by a Google `design.md`. The skill is self-contained and portable: copy its folder into `~/.claude/skills/` to use it without the plugin (requires a local Node runtime). See the [pdf-create skill doc](../../docs/10-pdf-create-skill.md).

```bash
/autopilot:pdf-create "quarterly report from these notes"                 # Default theme
/autopilot:pdf-create "strategy six-pager" ./brand/design.md             # Brand-themed
/autopilot:pdf-create "ops playbook" ./brand/design.md ./playbook.pdf    # Theme + output path
```

### `/autopilot:ask-codex`

Delegate a code-analysis, refactoring, or automated-editing task to the OpenAI Codex CLI, then critically evaluate its output as a peer AI. Prompts for model and reasoning effort, picks a sandbox mode, runs `codex exec` safely (stderr suppression, stdin-hang fix), and supports session resume. Requires the `codex` CLI installed and on `PATH`.

```bash
/autopilot:ask-codex                                   # Prompt for model + effort, run a Codex task
/autopilot:ask-codex "audit auth flow for races"       # Seed the task description
/autopilot:ask-codex "refactor parser" --model gpt-5.5 --effort high
```

### `/autopilot:ask-gemini`

Delegate a code-analysis, refactoring, or automated-editing task to the Google Gemini CLI, then critically evaluate its output as a peer AI. Prompts for model and approval mode, runs `gemini -p` non-interactively (clean output handling, stdin-hang guard), and supports native session resume (`--resume`). Requires the `gemini` CLI installed and on `PATH`.

```bash
/autopilot:ask-gemini                                    # Prompt for model + approval mode, run a Gemini task
/autopilot:ask-gemini "audit auth flow for races"        # Seed the task description
/autopilot:ask-gemini "refactor parser" --model pro --approval-mode auto_edit
```

### `/autopilot:shared-rules`

The canonical home for instruction blocks several skills need — reference formatting (RFC-0001), AskUserQuestion formatting, codebase context acquisition (graphify → repomix → default tools), agent structured output, Linear MCP access, and PR title/body grammar. Each block is a file under `references/`, so a consumer reads exactly the one it needs instead of carrying a copy. Mostly read by other skills rather than invoked directly; see the host repo's [shared-rules doc](../../docs/13-shared-rules-skill.md).

```bash
/autopilot:shared-rules                                  # List the blocks and where each is read from
```

## Agents

### Helper sub-agents (10 agents)

Context-isolating workers invoked by other skills to keep the parent conversation small. Each returns a structured summary only. Deterministic work is not delegated: the plan/run branch digest and GitHub issue fetch run as bundled helper CLIs under [`lib/`](./lib) (see [Bundled helpers](#bundled-helpers) below), so `gather-context` spawns an agent only for semantic digests.

| Agent                    | Model   | Used by                  | Purpose                                                                                      |
| ------------------------ | ------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `analyze-pr-commits`     | sonnet  | `pr-create`, `pr-update` | Summarize branch commits, diff, and linked issue for PR context                              |
| `digest-repo-standards`  | sonnet  | `gather-context`         | Digest the repo's README, docs/, rfc/, and principles/ into a bounded standards summary      |
| `analyze-staged-changes` | haiku   | `commits-create`         | Categorize staged files and recommend a commit strategy                                      |
| `digest-session-history` | haiku   | `plan`, `run`, `explore` | Map task files and commits to the Entire sessions and checkpoints that produced them         |
| `expert-review`          | inherit | `plan`, `plan-*`         | Score an implementation plan as a domain expert                                              |
| `resolve-alert-context`  | sonnet  | `plan`, `run`            | Fetch GitHub code-scanning alert context via the code-scanning API                           |
| `resolve-assignees`      | sonnet  | `linear-create`          | Resolve candidate assignees from CODEOWNERS and Linear team members, current user first      |
| `resolve-issue-context`  | sonnet  | `pr-review`              | Fetch GitHub/Linear issue context; optionally auto-assign current user (idempotent) via `gh` |
| `scan-and-analyze-todos` | sonnet  | `todo-cleanup`           | Scan codebase for TODOs and check linked GitHub issue statuses                               |
| `search-codebase-todos`  | haiku   | `pr-review`              | Search the codebase for TODOs and references to a specific issue                             |

## Internal Skills (not in slash menu)

These skills set `user-invocable: false` — they run only when invoked programmatically via `Skill(autopilot:X)` from other skills. They do not appear in the `/` menu.

### `preflight-check`

Validate git working state before branching, committing, or opening a PR. Mode-aware: in `plan`/`branch` modes it fetches remote and offers to pull; in `commits`/`pr` modes it warns if you are on `main` and offers to create a branch first. Each mode's own checks live in a `references/` file that only that mode reads.

Invoked automatically at the start of `/autopilot:branch-create`, `/autopilot:commits-create`, `/autopilot:pr-create`, and `/autopilot:plan`. On the `/autopilot:run` family it runs **once per session**, unconditionally, before any git mutation — that single invocation installs the git-history policy gate for the rest of the session, and is why the three creation skills skip their own preflight under `--autopilot`. See [skill token budget](../../docs/19-skill-token-budget.md).

### `gather-context`

Acquire all planning context in one parallel fan-out and emit a Context Map. Invoked automatically by `/autopilot:plan` and `/autopilot:run` after they detect the input type, and by `/autopilot:explore`.

The fan-out issues every context call in a single message — the repo-standards and branch-diff digest agents, the session-history digest when Entire is enabled, issue or alert resolution, the TODO search, the codebase snapshot, stack detection, and git state — then runs one snapshot pass and returns the Context Map. Sub-agents return bounded JSON, so the full text of a README, the selected RFCs, and an unbounded `git diff` never reaches the calling skill's context.

An optional `Scope` input selects how that pass reads the snapshot: `task` (the default, used by `plan` and `run`) narrows to what the change touches, `broad` maps the repository breadth-first for `/autopilot:explore`, and `primed` reads only the gaps a validated brief leaves for `/autopilot:run-primed`. The emitted Context Map has the same sections at every scope. `primed` is the one value that also gates off a fan-out agent — the repo-standards digest, whose output the brief already carries.

Planning is stack-agnostic apart from three values (example libraries, expert table, verify examples), which both skills resolve from `plan/references/stack-deltas.md` keyed by `agents.rules`. There are no per-stack planning skills.

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

The plugin ships one server: `wiretext` (ASCII wireframes). Linear connectivity is consumer-level: interactive skills use a user- or project-configured Linear MCP server (`claude mcp add --transport http linear https://mcp.linear.app/mcp`), while agents and headless runs use a bundled zero-dependency GraphQL helper (`lib/linear/`) keyed by `LINEAR_API_KEY`. See [Linear tracker support](../../docs/11-linear-tracker.md).

### Bundled helpers

Deterministic retrieval ships as zero-dependency CLIs under [`lib/`](./lib) — run by Node ≥ 24 native type stripping or Bun, always exiting 0 with one typed JSON payload plus telemetry — rather than as delegated agents:

- [`lib/github/fetch-pr-reviews.ts`](./lib/github/fetch-pr-reviews.ts) performs the four bounded, read-only `gh` reads (REST reviews and comments, PR metadata, GraphQL `reviewThreads` resolution state), replacing the delegated `fetch-pr-reviews` agent the `pr-answer`, `pr-resolve`, and `pr-review` skills previously spawned. The invocation and output contract live in the [github-review-fetch shared block](./skills/shared-rules/references/github-review-fetch.md).
- [`lib/git/digest-branch.ts`](./lib/git/digest-branch.ts) digests the current branch against its base — commits, numstat, `git cherry` stale-merge detection, worktree state — replacing the delegated `digest-branch-diff` agent in the `gather-context` fan-out. Degraded `cherry`/`rev-list` reads report `isStaleMerged`/`baseAhead` as `null`, never as a confident negative.
- [`lib/github/fetch-issue.ts`](./lib/github/fetch-issue.ts) fetches a GitHub issue and, with `--assign`, self-assigns the authenticated user with a verifying re-read, replacing the `resolve-issue-context` agent's GitHub path in the same fan-out. Each helper's invocation and output contract lives in its header comment.

### Versioning

Update version in `.claude-plugin/plugin.json` following [semantic versioning](https://semver.org/):

| Change Type      | Version Bump | Example       |
| ---------------- | ------------ | ------------- |
| Breaking changes | MAJOR        | 1.0.0 → 2.0.0 |
| New features     | MINOR        | 1.0.0 → 1.1.0 |
| Bug fixes        | PATCH        | 1.0.0 → 1.0.1 |

### Testing Locally

See [Local development](#local-development) in the Installation section.
