---
number: 1
version: 2
title: Reference formatting & readability
status: Accepted
author: "@awinogradov"
created: 2026-06-04
updated: 2026-06-05
---

# RFC-0001: Reference formatting & readability

The single source of truth for how every reference in generated output is formatted — issue bodies, pull request descriptions, code-review comments, and release notes. The block below is inlined verbatim into every autopilot skill (`claude-plugins/autopilot/skills/*/SKILL.md`) and into the release-notes prompt (`releaseNotesPrompt.ts`); the `referenceFormattingSync` test keeps every copy byte-identical with this RFC. Because this RFC is versioned and Accepted, skills, prompts, and the output they generate cite it as RFC-0001 instead of linking a doc that moves.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Prefer stable references that never rot; render the same kind of reference the same way everywhere:

- Code identifiers and file names — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked specimen names the thing without a link that breaks when a file moves or a doc is restructured.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections in the same document — link the heading by its anchor, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`; a same-file anchor moves with the file and stays clickable on GitHub.
- Other docs and cross-document sections — do NOT link the doc name or an anchor in another file; those rot the moment that doc is restructured. Inline a short gist of the point you need instead.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->

## Changelog

- **v2** (2026-06-05) — A section in the same document may be linked by its anchor (e.g. `[Phase 6](#phase-6-reply-to-review-threads)`); cross-document sections still use an inline gist.
- **v1** (2026-06-04) — Initial version.
