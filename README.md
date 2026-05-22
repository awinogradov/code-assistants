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

- [`agents` field spec](./docs/agents-field.md) — how skills detect a repository's tech stack from `package.json`
- [Stack rule sets](./rules/) — `Bun`, `Bun+React+Tailwind`, `NodeJS+React`, `NodeJS+React+Tailwind`

## GitHub Actions

- [`files-sync`](./.github/actions/files-sync/README.md) — sync declared files from upstream repos and open one PR with the differences
- [`agents-rules-sync`](./.github/actions/agents-rules-sync/README.md) — sync the stack-appropriate `rules/<stack>.md` into `CLAUDE.md` based on `package.json` `agents.rules`
- [`contributing-check`](./.github/actions/contributing-check/README.md) — validate branch name, commit messages, and PR title against `CONTRIBUTING.md`
- [`contributing-sync`](./.github/actions/contributing-sync/README.md) — sync `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE.md`, and the contributing workflow from upstream
- [`release-action`](./.github/actions/release-action/README.md) — conventional-commit-driven release pipeline for npm packages, GitHub Actions, and Claude plugins

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

## License

[MIT](./LICENSE.md) © @awinogradov
