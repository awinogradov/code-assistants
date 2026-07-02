---
number: 1
version: 5
title: Reference formatting & readability
status: Accepted
author: "@awinogradov"
created: 2026-06-04
updated: 2026-07-02
---

# RFC-0001: Reference formatting & readability

The single source of truth for how every reference in generated output is formatted — issue bodies, pull request descriptions, code-review comments, and release notes. The block below is inlined verbatim into every autopilot skill (`claude-plugins/autopilot/skills/*/SKILL.md`) and into the release-notes prompt (`releaseNotesPrompt.ts`); the `referenceFormattingSync` test keeps every copy byte-identical with this RFC. As of v3 every reference — including cross-document files and sections — is a real, resolvable link; the `linkResolution` test checks that every local link target and heading anchor exists. Because this RFC is versioned and Accepted, skills, prompts, and the output they generate cite it as RFC-0001 instead of linking a doc that moves.

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve. Any prose mention of a file or path that exists in the repo is such a reference — link it so it resolves on the default branch at writing time; a path that does not exist yet (a file the text proposes to create) or one shown inside a command or fenced block is a code specimen, not a reference.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- External resources — articles, posts, vendor docs, and web standards or specs you cite — link them inline as `[title](url)` to the canonical source, taking the title from the source (or the site name). Use only a URL present in your input or context — never produce one from memory; a source with no known URL stays plain prose. When several sources back one document, they may be gathered into a short references list.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->

## Changelog

- **v5** (2026-07-02) — Prose mentions of existing repo files are references to link, not specimens — existence is the test (planned files and paths inside commands or fenced blocks stay backticked). New external-resources rule: cite articles, posts, vendor docs, and standards as inline titled links to a URL present in context; never produce a URL from memory ([#386](https://github.com/awinogradov/code-assistants/issues/386)).
- **v4** (2026-07-02) — Tracker IDs GitHub does not auto-link (e.g. Linear `ENG-123`) must resolve: a markdown link in prose, the plain issue URL on magic-word lines (`Closes`/`Fixes`) — the form both GitHub's autolinker and Linear's magic-word parser accept. Bare tracker IDs are no longer allowed ([#387](https://github.com/awinogradov/code-assistants/issues/387)).
- **v3** (2026-06-17) — Cross-document references are now linked, not inlined. Link any file, doc, skill, agent, or action you point the reader at, and link cross-document sections by `path#anchor` (repo-relative in repository files, absolute `<repo-blob-url>` in generated output). Every reference must resolve; the `linkResolution` test enforces it. Reverses the v1–v2 rule that cross-document references use an inline gist.
- **v2** (2026-06-05) — A section in the same document may be linked by its anchor (e.g. `[Phase 6](#phase-6-reply-to-review-threads)`); cross-document sections still use an inline gist.
- **v1** (2026-06-04) — Initial version.
