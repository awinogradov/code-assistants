# Output formatting

The single source of truth for how every reference in generated output is formatted — issue bodies, pull request descriptions, code-review comments, and release notes. The block below is inlined verbatim into every skill (`claude-plugins/autopilot/skills/*/SKILL.md`) and into the release-notes prompt (`releaseNotesPrompt.ts`); the `referenceFormattingSync` test keeps every copy byte-identical with this one.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Render the same kind of reference the same way everywhere:

- File names / paths — link to the file when a URL or repo-relative path is derivable, e.g. `[pr:review/SKILL.md](<repo-blob-url>/claude-plugins/autopilot/skills/pr:review/SKILL.md)`; when no target is derivable, a backticked specimen like `reviewOutput.ts` is fine.
- Section references — ALWAYS a link to the doc anchor, e.g. `[§1.5](<doc-url>#15-context-map)`; never leave a section reference bare.
- Doc names — link the doc you reference, e.g. `[CLAUDE.md](<repo-blob-url>/CLAUDE.md)`, `[README.md](<repo-blob-url>/README.md)`.
- Code identifiers that are not file names (functions, types, vars) — backticks, e.g. `buildReviewComments`.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; if you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
