<img width="1768" height="649" alt="image" src="https://github.com/user-attachments/assets/d66366df-7bf3-4c0a-8e33-465f6d2ffa3b" />


# Code Assistants

Skills and agents for AI-assisted development workflows — plan, implement, commit, PR, and monitor.

## Plugins

- [**autopilot**](./claude-plugins/autopilot/README.md) — plan, implement, commit, PR, and monitor
  - [Upgrade notes](./claude-plugins/autopilot/MIGRATING.md)

## Installation

```bash
/plugin marketplace add awinogradov/code-assistants
/plugin install autopilot@code-assistants
```

See the [plugin README](./claude-plugins/autopilot/README.md#installation) for scoping options and local development.

## Repository docs

The `docs/` guides are numbered chapters in reading order — start at chapter 1 and read on, or jump to the chapter you need.

| #   | Document                                                                        | What it covers                                                                                      |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | [Workspace structure](./docs/01-workspace-structure.md)                         | where new actions, packages, and apps go, and how they wire into Turbo                              |
| 2   | [`agents` field spec](./docs/02-agents-field.md)                                | how skills detect a repository's tech stack from `package.json`                                     |
| 3   | [Review run-summary footer](./docs/03-code-review-run-summary.md)               | how `code-review-action` surfaces per-run cost/latency/token metrics in a collapsible footer        |
| 4   | [Inline suggestions and AI-agent prompts](./docs/04-code-review-suggestions.md) | one-click GitHub suggestion blocks and a "Prompt for AI agents" block on each inline finding        |
| 5   | [Plan and run skills](./docs/05-plan-run-skills.md)                             | how the `plan` and `run` skills go from task to reviewed plan to merged PR, with ASCII diagrams     |
| 6   | [`release` field spec](./docs/06-release-field.md)                              | how `release-action` picks the right artifacts for npm packages, GitHub Actions, and plugins        |
| 7   | [Release auto-merge flow](./docs/07-release-automerge.md)                       | the event-driven action that merges approved, all-green release PRs and propagates downstream       |
| 8   | [Upstream sync](./docs/08-upstream-sync.md)                                     | the one-action `upstream-sync` aggregator and the thin `upstream.yml` consumers run, per-kind       |
| 9   | [Committed Repomix pack](./docs/09-repomix-pack.md)                             | the `.repomix/pack.xml` snapshot, its merge-triggered refresh, and the snapshot-first contract      |
| 10  | [The `pdf:create` skill](./docs/10-pdf-create-skill.md)                         | the portable `@react-pdf/renderer` pipeline that renders a themed PDF, decoupled from the workspace |
| 11  | [Linear tracker support](./docs/11-linear-tracker.md)                           | how `agents.trackers` opts a project into Linear and other issue trackers behind one JSON contract  |

**Standards.**

- [Reference formatting (RFC-0001)](./rfc/0001-reference-formatting.md) — the single reference-formatting + readability standard, versioned as an RFC, inlined into every skill and the release-notes prompt and kept in sync by the `referenceFormattingSync` test; as of v3 every reference (including cross-document files and sections) is a real, resolvable link, guarded by the `linkResolution` test; see [`rfc/`](./rfc/README.md) for the RFC convention
- [Stack rule sets](./rules/) — `Bun`, `Bun+React+Tailwind`, `NodeJS+React`, `NodeJS+React+Tailwind`

## GitHub Actions

- [`files-sync`](./.github/actions/files-sync/README.md) — sync declared files from upstream repos and open one PR with the differences
- [`upstream-sync`](./.github/actions/upstream-sync/README.md) — aggregate the five upstream maintenance syncs behind one action; every kind on by default, opt out per kind
- [`agents-rules-sync`](./.github/actions/agents-rules-sync/README.md) — sync the stack-appropriate `rules/<stack>.md` into `CLAUDE.md` based on `package.json` `agents.rules`
- [`contributing-check`](./.github/actions/contributing-check/README.md) — validate branch name, commit messages, and PR title against `CONTRIBUTING.md`
- [`contributing-sync`](./.github/actions/contributing-sync/README.md) — sync `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE.md`, `SECURITY.md`, and the contributing workflow from upstream
- [`ban-patterns`](./.github/actions/ban-patterns/README.md) — fail the job when forbidden regex patterns match files in the working tree
- [`licenses-audit`](./.github/actions/licenses-audit/README.md) — detect the consumer's package manager (pnpm/npm/bun) and regenerate the license report on dependency-changing PRs, auto-commit drift on same-repo PRs, and fail fork PRs that ship stale license data
- [`release-action`](./.github/actions/release-action/README.md) — conventional-commit-driven release pipeline for npm packages, GitHub Actions, and Claude plugins; supports a custom Anthropic host (gateway/proxy) via `anthropic_base_url`
- [`release-automerge`](./.github/actions/release-automerge/README.md) — merge an approved, all-green release PR (`^release-`), driven by an event-based workflow so `release-publish.yml` runs without a manual click
- [`code-review-action`](./.github/actions/code-review-action/README.md) — AI code review for pull requests via Claude Code, with a react mode for replying to bot mentions; supports a custom Anthropic host (gateway/proxy) via `anthropic_base_url`
- [`code-review-cost-monitor`](./.github/actions/code-review-cost-monitor/README.md) — watch the review run-summary footers for cost regressions on a schedule and open (or update) a deduplicated cost-report issue
- [`code-review-sync`](./.github/actions/code-review-sync/README.md) — sync the canonical AI code-review workflows (`code-review.yml`, `code-review-cost-monitor.yml`) from upstream and open one PR with the differences
- [`auto-label`](./.github/actions/auto-label/README.md) — label PRs with `<scope>/<workspace-member>` labels for the workspace members a diff touches, and prune orphan labels on merge
- [`repomix-sync`](./.github/actions/repomix-sync/README.md) — sync the `repomix-pack` workflow and `repomix.config.json` from upstream so each consumer commits its own codebase snapshot
- [`release-sync`](./.github/actions/release-sync/README.md) — sync the release pipeline workflows (`release`, `publish`, `release-automerge`) from upstream so each consumer runs the same release flow
- [`validate-actions`](./.github/actions/validate-actions/README.md) — lint changed workflow files and composite action inline shell on pull requests
- [`perf-report-action`](./.github/actions/perf-report-action/README.md) — build a target, measure bundle sizes and Lighthouse headlines, compare against a default-branch baseline, and post a sticky PR comment with classified deltas

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)

## License

[MIT](./LICENSE.md) © @awinogradov
