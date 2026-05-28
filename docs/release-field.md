# The `release` field

[`release-action`](../.github/actions/release-action/README.md) reads all per-repo release configuration from a single `release` object in the repo-root `package.json`. This document specifies the field, its accepted values, and the consumer's detection algorithm.

## Why it exists

Release type controls publish targets, version source, and the major-version tag — concerns parallel to stack detection via [`agents`](./agents-field.md), but consumed by a different tool. Slack-notification config (the channel) lives next to the type because it's the same kind of per-repo release setting. Keeping all of it under a single `release` object on `package.json` (sibling of `agents`) gives contributors one place to declare per-repo release metadata, with no separate YAML file.

## Location

A single object under the top-level key `release` in the repository-root `package.json`:

```json
{
  "name": "my-app",
  "release": {
    "type": "lib-nodejs",
    "slack": "#releases"
  }
}
```

The field coexists with normal npm metadata. It is not consumed by npm, Bun, or any package manager — only by `release-action`.

## Spec

```ts
type ReleaseType =
  | "lib-nodejs"
  | "lib-bun"
  | "lib-python"
  | "service-nodejs"
  | "service-python"
  | "github-action"
  | "claude-plugin";

interface ReleaseConfig {
  type: ReleaseType; // required
  slack?: string; // optional Slack channel, e.g. "#releases"
}

// Root-only superset (repository-root `package.json` in a monorepo)
interface RootReleaseConfig {
  members?: string[]; // monorepo: explicit member paths (mutually exclusive with `type`)
  type?: ReleaseType; // standalone: same shape as ReleaseConfig
  slack?: string;
  automerge?: boolean; // root-only opt-in for release-automerge (default false)
}
```

`type` is required on **member** manifests. `slack` is optional — when omitted, `release-action` skips the Slack notification step. When present, it must be a non-empty string.

At the **root** of a monorepo, `release.members` declares the workspace paths to release; `type` is omitted on the root in that case. When neither `members` nor `type` is present, `release-action` falls back to expanding the root's `workspaces` globs and using only members that declare their own `release.type`.

`automerge` is a **root-only**, repo-wide boolean consumed only by [`release-automerge`](../.github/actions/release-automerge/README.md) (default `false`). It opts the repository into auto-merging approved, all-green release PRs; it is independent of `members`/`type` and is never read per member. It is **not** a `release.type` value, so it does not appear in the recognized-`type` table below and does not follow the type-extension workflow.

### Recognized `type` values

| Value            | Version source   | NPM publish | GitHub Release | Major version tag (`v1`) | Use case                       |
| ---------------- | ---------------- | ----------- | -------------- | ------------------------ | ------------------------------ |
| `lib-nodejs`     | `package.json`   | Yes         | Yes            | No                       | Node-targeted npm libraries    |
| `lib-bun`        | `package.json`   | Yes         | Yes            | No                       | Bun-targeted npm libraries     |
| `lib-python`     | `pyproject.toml` | No          | Yes            | No                       | Python libraries               |
| `service-nodejs` | `package.json`   | No          | Yes            | No                       | Internal Node services         |
| `service-python` | `pyproject.toml` | No          | Yes            | No                       | Internal Python services       |
| `github-action`  | `package.json`   | No          | Yes            | Yes                      | Composite or TypeScript Action |
| `claude-plugin`  | `plugin.json`    | No          | Yes            | No                       | Claude Code plugins            |

Any other value is treated as unrecognized and fails the action.

## Consumers

| Tool                                                                  | Reads               | Behavior                                                                                                                                                                  | Source                                                    |
| --------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`release-action`](../.github/actions/release-action/README.md)       | `release.type`      | Selects version source, npm-publish step, GitHub Release step, and major-version tag based on the value's table row.                                                      | `.github/actions/release-action/src/detectReleaseType.ts` |
| [`release-action`](../.github/actions/release-action/README.md)       | `release.slack`     | When present, posts a Slack notification to this channel after publish. When absent, the Slack step is skipped.                                                           | `.github/actions/release-action/src/slackNotify.ts`       |
| [`release-automerge`](../.github/actions/release-automerge/README.md) | `release.automerge` | Merges an approved, all-green release PR only when `true` (read from the repo-root `package.json` at the PR head SHA). When `false` or absent, leaves the PR for a human. | `packages/actions-core/src/releaseField.ts`               |

## Detection algorithm

1. Read `package.json` from the working directory.
2. Parse JSON.
3. Read the top-level `release` object.
4. Validate `release.type` against the table above.
5. Validate `release.slack` is a non-empty string if present.
6. **No fallback** — missing `release`, missing `release.type`, or an unrecognized value fails the action with a message pointing back to this document.

The reference implementation is `packages/actions-core/src/releaseField.ts` (`readReleaseField` / `readRootRelease`), shared by `release-action` and `release-automerge`. The entry script `detectReleaseType.ts` wires the `type` to the action; `slackNotify.ts` reads `slack` from the same parsed config; `release-automerge` reads `release.automerge` via `readRootRelease`.

## Examples

### Node.js library

```json
{
  "name": "@org/ingest",
  "version": "1.4.0",
  "release": {
    "type": "lib-nodejs"
  }
}
```

`release-action` reads the version from `package.json`, publishes to npm, and creates a GitHub Release. No floating major tag. Slack notification is skipped.

### Composite GitHub Action with Slack notification

```json
{
  "name": "@org/release-action",
  "version": "1.0.0",
  "release": {
    "type": "github-action",
    "slack": "#platform-engineering"
  }
}
```

`release-action` skips npm publish, creates a GitHub Release, updates the floating `v1` tag, and posts to `#platform-engineering`.

### Claude plugin

```json
{
  "name": "autopilot",
  "version": "0.4.0",
  "release": {
    "type": "claude-plugin"
  }
}
```

Version source switches to `plugin.json`; npm publish is skipped; GitHub Release is created.

### Monorepo root

```json
{
  "name": "monorepo",
  "workspaces": [".github/actions/*", "packages/*"],
  "release": {
    "members": [
      ".github/actions/release-action",
      ".github/actions/files-sync",
      "claude-plugins/autopilot"
    ]
  }
}
```

`release-action` runs once per member with the per-member `release.type` driving artifacts. Per-member tags use the form `<name>@v<version>` (e.g. `release-action@v1.2.0`) and the floating major tag becomes `<name>@v1`. When `release.members` is omitted, the action falls back to the root `workspaces` array and skips any member that does not declare its own `release` field.

### Repo opting into auto-merge

```json
{
  "name": "monorepo",
  "workspaces": [".github/actions/*", "packages/*"],
  "release": {
    "automerge": true
  }
}
```

`release-automerge` merges approved, all-green `release-*` PRs without a manual click. Because `members`/`type` are omitted, `release-action` still discovers members via the `workspaces` fallback — `automerge` only governs the merge step and is read at the PR head SHA. Omitting `automerge` (or setting it `false`) leaves release PRs for a human to merge.

## Extending

To add a new release type:

1. Add the value to `releaseTypes` in `packages/actions-core/src/releaseField.ts`.
2. Extend the release-action publish logic to handle the new value.
3. Add a row to the table above and mirror it in `.github/actions/release-action/README.md` (keep both tables in the same row order).
