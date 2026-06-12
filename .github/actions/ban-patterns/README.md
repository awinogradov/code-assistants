# Ban patterns

Composite GitHub Action that greps the working tree for consumer-supplied forbidden regex
patterns and fails the job with an `::error::` annotation when any pattern matches. It replaces
copy-pasted "ban X pattern" inline workflow steps (like the time-based-waits check from
[symbiot PR 140](https://github.com/awinogradov/symbiot/pull/140)) with a single declarative
`uses:` line, so the rule set lives in workflow inputs instead of opaque shell.

## Usage

The action greps files already on disk — run `actions/checkout` first.

```yaml
name: PR

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  ban-patterns:
    name: Ban patterns
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Ban time-based waits in features
        uses: awinogradov/code-assistants/.github/actions/ban-patterns@main
        with:
          paths: features/
          include-globs: |
            *.feature
            *.ts
          patterns: |
            ^\s*(And |Given |When |Then )?I (wait|pause|sleep)( |$)
            waitForTimeout\(
            (^|[^.])setTimeout\(
            globalThis\.setTimeout\(
          error-message: Time-based waits are banned in features/. See features/README.md.
          issue-link: https://github.com/awinogradov/symbiot/issues/131
```

## Inputs

| Input           | Required | Default                 | Description                                                                                                                                                                                        |
| --------------- | -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patterns`      | Yes      | —                       | Newline-separated list of extended (ERE) regex patterns to ban. Blank lines are ignored. The action fails explicitly when the list is empty — GitHub does not enforce `required: true` at runtime. |
| `paths`         | No       | `.`                     | Newline-separated list of files or directories to search. Blank lines are ignored.                                                                                                                 |
| `include-globs` | No       | _(empty — all files)_   | Newline-separated list of file globs passed to grep as `--include` filters (e.g. `*.ts`). Globs match the file **basename** only — scope directories via `paths`.                                  |
| `error-message` | No       | `Banned pattern found.` | Single-line message emitted in the error annotation when any pattern matches.                                                                                                                      |
| `issue-link`    | No       | _(empty)_               | URL appended to the error annotation pointing at the rule's rationale.                                                                                                                             |

Patterns are GNU grep EREs as run on `ubuntu-latest` runners, so GNU extensions like `\s` and
`\b` work. Inside a YAML block scalar (`patterns: |`) no extra escaping is needed — write the
regex exactly as you would on a grep command line.

## Outputs

| Output | Description                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| _none_ | The action signals violations through job status. Matches surface in the step log and as an error annotation on the PR. |

## Permissions

The workflow's default `GITHUB_TOKEN` is sufficient — the action itself makes no API calls and
never writes to the repository:

- `contents: read` — `actions/checkout` needs it to put the files on disk for grep.

## Behavior

The action runs a single `shell: bash` step:

1. Fails with `::error::` if `patterns` is empty or whitespace-only (runtime guard, since
   `required: true` is documentation-only for actions).
2. Runs `grep -rIEn --exclude-dir=.git --exclude-dir=node_modules` once per pattern across all
   `paths`, applying any `include-globs`. Binary files are skipped.
3. Scans **all** patterns before failing, so one run reports every violation.
4. On any match: prints the matching `file:line:content` hits (wrapped in a
   [`::stop-commands::` guard](https://docs.github.com/actions/reference/workflows-and-actions/workflow-commands#stopping-and-starting-workflow-commands)
   so matched file content cannot inject workflow commands), then emits
   `::error::<error-message> See <issue-link>` (the ` See <issue-link>` suffix is omitted when
   `issue-link` is empty) and exits 1.
5. A grep failure other than "no match" — invalid regex, unreadable or missing path — fails the
   job with its own distinct `::error::` annotation instead of silently passing.

All inputs reach the script through environment variables, never shell interpolation, so a
hostile pattern or path cannot inject commands.

## Versioning

Reference the action by tag of the autopilot repo, e.g.:

```yaml
uses: awinogradov/code-assistants/.github/actions/ban-patterns@v1
```

Consumers may also reference `@main` to always pick up the latest behavior. The input set and
the default scan scope are treated as a frozen API: changes are additive only, and any
behavior-changing default ships behind a new opt-in input.
