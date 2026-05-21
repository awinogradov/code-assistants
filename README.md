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

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

## License

[MIT](./LICENSE.md) © @awinogradov
