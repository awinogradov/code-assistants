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

- [Workspace structure](./docs/workspace-structure.md) — where new actions, packages, and apps go, and how they wire into Turbo
- [`agents` field spec](./docs/agents-field.md) — how skills detect a repository's tech stack from `package.json`
- [`release` field spec](./docs/release-field.md) — how `release-action` picks the right artifacts for npm packages, GitHub Actions, and Claude plugins
- [Release auto-merge flow](./docs/release-automerge.md) — the event-driven action that merges approved, all-green release PRs, and how its workflow is propagated downstream
- [Committed Repomix pack](./docs/repomix-pack.md) — the `.repomix/pack.xml` snapshot, the merge-triggered workflow that refreshes it, and the snapshot-first contract skills follow
- [Upstream sync](./docs/upstream-sync.md) — the one-action `upstream-sync` aggregator and the thin `upstream.yml` consumers run, with per-kind opt-out
- [Review run-summary footer](./docs/code-review-run-summary.md) — how `code-review-action` surfaces per-run cost/latency/token metrics in a collapsible footer on the main review comment
- [Inline suggestions and AI-agent prompts](./docs/code-review-suggestions.md) — how `code-review-action` adds one-click GitHub suggestion blocks and a "Prompt for AI agents" block to each inline finding
- [Plan and run skills](./docs/plan-run-skills.md) — how the `plan` and `run` skills work end to end: phases, orchestrator↔stack delegation, sub-agent fan-out, and run's automated post-implementation, with ASCII diagrams
- [Plan skills audit](./docs/plan-skills-audit.md) — a dimension-by-dimension audit of the `plan`, `plan-bun`, and `plan-nodejs-react` skills with a prioritized optimization plan
- [Output formatting](./docs/output-formatting.md) — the single reference-formatting + readability standard inlined into every skill and the release-notes prompt, kept in sync by the `referenceFormattingSync` test
- [Stack rule sets](./rules/) — `Bun`, `Bun+React+Tailwind`, `NodeJS+React`, `NodeJS+React+Tailwind`

## GitHub Actions

- [`files-sync`](./.github/actions/files-sync/README.md) — sync declared files from upstream repos and open one PR with the differences
- [`upstream-sync`](./.github/actions/upstream-sync/README.md) — aggregate the five upstream maintenance syncs behind one action; every kind on by default, opt out per kind
- [`agents-rules-sync`](./.github/actions/agents-rules-sync/README.md) — sync the stack-appropriate `rules/<stack>.md` into `CLAUDE.md` based on `package.json` `agents.rules`
- [`contributing-check`](./.github/actions/contributing-check/README.md) — validate branch name, commit messages, and PR title against `CONTRIBUTING.md`
- [`contributing-sync`](./.github/actions/contributing-sync/README.md) — sync `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE.md`, and the contributing workflow from upstream
- [`licenses-audit`](./.github/actions/licenses-audit/README.md) — regenerate the license report on dependency-changing PRs, auto-commit drift on same-repo PRs, and fail fork PRs that ship stale license data
- [`release-action`](./.github/actions/release-action/README.md) — conventional-commit-driven release pipeline for npm packages, GitHub Actions, and Claude plugins
- [`release-automerge`](./.github/actions/release-automerge/README.md) — merge an approved, all-green release PR (`^release-`), driven by an event-based workflow so `release-publish.yml` runs without a manual click
- [`code-review-action`](./.github/actions/code-review-action/README.md) — AI code review for pull requests via Claude Code, with a react mode for replying to bot mentions
- [`auto-label`](./.github/actions/auto-label/README.md) — label PRs with `<scope>/<workspace-member>` labels for the workspace members a diff touches, and prune orphan labels on merge
- [`repomix-sync`](./.github/actions/repomix-sync/README.md) — sync the `repomix-pack` workflow and `repomix.config.json` from upstream so each consumer commits its own codebase snapshot
- [`release-sync`](./.github/actions/release-sync/README.md) — sync the release pipeline workflows (`release`, `publish`, `release-automerge`) from upstream so each consumer runs the same release flow

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

## License

[MIT](./LICENSE.md) © @awinogradov
