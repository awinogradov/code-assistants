---
name: pdf:create
description: >-
  Generate a beautiful, brand-themed, multi-page PDF — report, research doc,
  six-pager, or playbook — from structured content using a bundled
  @react-pdf/renderer pipeline (direct rendering, no headless browser). Use when
  the user asks to create, generate, build, export, or design a PDF, report,
  whitepaper, six-pager, playbook, proposal, or branded document, especially
  from notes, data, or a Google design.md brand spec.
  Trigger on: "PDF", "create a report", "generate a document", "six-pager",
  "playbook", "proposal", "whitepaper", "branded PDF", "design.md", "export to PDF".
  Do NOT use for: editing or extracting text from an existing PDF, or filling PDF forms.
argument-hint: "<what to put in the PDF> [path/to/design.md] [path/to/output.pdf]"
allowed-tools:
  - Read
  - Write
  - Bash(node *)
  - Bash(npm *)
  - Bash(npx *)
  - AskUserQuestion
---

# Create a beautiful PDF (`pdf:create`)

Turn structured content into a polished, multi-page PDF using a bundled, self-contained `@react-pdf/renderer` pipeline. Rendering is **deterministic and runs outside this conversation**: you assemble a small JSON document, a Node script turns it into a themed PDF. You never hand-write rendering code.

## When to use

- The user wants a PDF report, research document, six-pager, playbook, proposal, or any branded multi-page document.
- The user has content (notes, data, sections, tables, charts) and wants it laid out beautifully.
- The user provides — or wants to apply — a brand identity via a Google `design.md` file.

Do not use this to read, edit, merge, or extract from an existing PDF.

## How it works

```text
You assemble  ──►  content.json  ──►  render.tsx  ──►  validate (Zod)  ──►  theme
(from the user's        (Write tool)        │            content + design.md     │
 content + choices)                          │                                    ▼
                                             └──►  registerFonts ──► template ──► output.pdf
```

Three inputs, all passed as file paths (no inline JSON on the command line):

1. **content JSON** — the document model you write (metadata, cover, sections, blocks). This is the only artifact you produce per run; its schema is the stable contract.
2. **design.md** (optional) — a brand spec whose tokens (colors, typography, spacing) become the theme. Omit it to use the bundled default theme.
3. **output path** — where the `.pdf` is written.

## Portability (works without the plugin)

The skill is a self-contained folder: `SKILL.md` plus a `renderer/` Node project with its own pinned dependencies. It has **no** cross-skill calls and **no** MCP dependencies. To use it outside this plugin, copy the whole `pdf:create/` folder into `~/.claude/skills/` — it behaves identically. The only requirement is a local **Node** runtime (Node 18–22 recommended); the first render installs the renderer's dependencies once. It does not run in the hosted claude.ai web sandbox, which has no Node toolchain.

## Workflow

Let `SKILL_DIR` be the directory that contains this `SKILL.md`. Every command below runs from `SKILL_DIR/renderer`.

### Phase 1 — Pick a template and gather content

Choose the template that fits the request (see [Templates](#templates)). If the user has not implied one, ask with `AskUserQuestion` (Report / Research doc / Six-pager / Playbook). Collect the content: title and metadata, an optional cover, and the ordered sections with their blocks (headings, paragraphs, lists, tables, figures, charts, callouts, pull quotes).

### Phase 2 — Write the content JSON

Read `renderer/references/content-schema.md` for the full schema, and `renderer/references/examples/report.content.json` for a worked example. Then write a content JSON file (e.g. to a temp path or the user's working directory) that conforms to it. Keep prose in the content; do not put styling in it — styling comes from the theme.

### Phase 3 — Resolve a brand theme (optional)

If the user supplied (or points to) a `design.md`, pass its path with `--design`. Otherwise omit it and the bundled default theme is used. See [design.md theming](#designmd-theming).

### Phase 4 — Install renderer dependencies (one-time)

```bash
node install-check.mjs
```

This installs the renderer's pinned runtime dependencies on first use and is a no-op afterward (guarded by a marker file). If `node` is not found, tell the user this skill needs a local Node runtime on PATH.

### Phase 5 — Render

```bash
node --import tsx render.tsx \
  --content "<content.json>" \
  --out "<output.pdf>" \
  [--design "<design.md>"] \
  [--template <report|researchDoc|sixPager|playbook>]
```

`--template` overrides the `template` field in the content JSON; usually you can omit it. The script validates both inputs and exits non-zero with a clear, field-named message on any problem (see [Failure modes](#failure-modes)).

### Phase 6 — Report and verify

On success the script prints the output path and byte size. Tell the user where the PDF is. If anything failed, read the error message — it names the offending file, field, font, or token — fix the content JSON or design.md, and re-run.

## The content JSON contract

The renderer accepts one document object. Top level: `schemaVersion` (1), `template`, `metadata`, optional `cover`, `toc` (boolean), `sections[]`, and optional `appendix[]`. Each section has an `id`, `title`, and ordered `blocks[]`. Blocks are a discriminated union on `type`: `heading`, `paragraph`, `list`, `table`, `figure`, `chart`, `callout`, `pullquote`, `pagebreak`. The authoritative schema with every field is in `renderer/references/content-schema.md`; mirror `renderer/references/examples/report.content.json`.

## design.md theming

A `design.md` is a markdown file with YAML front-matter design tokens (colors, typography, spacing, rounded) plus a human-readable body. The loader parses the front-matter, resolves `{path.to.token}` references, validates the tokens, and produces the theme the components consume. Colors and typography names map onto the document's palette and text styles. If a token reference is broken or a referenced font cannot be resolved, the render **fails loudly** rather than producing a silently wrong PDF. With no `design.md`, the bundled default theme (standard PDF font families, a neutral professional palette) is used. See `renderer/references/design-md-spec.md`.

Custom brand fonts are supported: drop TTF/WOFF static-weight files into `renderer/assets/fonts/` and reference the family from the design.md `fonts` mapping. Variable fonts are rejected (the PDF format does not support them) — ship explicit weights.

## Templates

- **report** — cover, table of contents, executive summary, sequential sections, appendix. The general-purpose business document.
- **researchDoc** — cover with authors, abstract, numbered sections, references appendix; supports pull quotes.
- **sixPager** — Amazon-style six narrative sections (Introduction, Goals, Tenets, State of the Business, Lessons Learned, Strategic Priorities) plus an unlimited appendix for tables and charts.
- **playbook** — operational guide: each section is a "play" with step lists, callouts, and owner/RACI tables.

All templates share the cover → TOC → sections → appendix spine, a fixed header/footer with page numbers, and a navigable bookmark outline.

## Failure modes

- **`node` not found** — install Node (18–22) and re-run. The hosted claude.ai sandbox is unsupported.
- **content JSON invalid** — the error names the failing field; fix it against `references/content-schema.md`.
- **broken design.md token reference** — the error names the unresolved `{token}`; fix the design.md.
- **unresolved or variable font** — the error names the family; add a static-weight file to `assets/fonts/` or use a standard family.
- **a block taller than a page** — split it (e.g. break a huge table into sections); the renderer keeps headings with following content via `minPresenceAhead`, not by forcing oversized blocks onto one page.

## Examples

Generate a report from notes, default theme:

```bash
# after writing /tmp/report.content.json
node install-check.mjs
node --import tsx render.tsx --content /tmp/report.content.json --out ./quarterly-report.pdf
```

Generate a branded six-pager with a company design.md:

```bash
node install-check.mjs
node --import tsx render.tsx \
  --content /tmp/sixpager.content.json \
  --design ./brand/design.md \
  --out ./strategy-sixpager.pdf \
  --template sixPager
```

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, section, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Every reference must resolve: render it as a real link whose target exists, and prefer the most stable link form so it does not rot. Render the same kind of reference the same way everywhere:

- Code specimens — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked token names a thing as an example; it is not a reference and carries no link.
- Files, docs, skills, agents, and actions you point the reader at — link them, e.g. `[release field spec](<repo-blob-url>/docs/06-release-field.md)`. Use a repo-relative path in repository files and the absolute `<repo-blob-url>` form in generated output posted outside the repo (PR/issue bodies, review comments, release notes), where relative paths do not resolve.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Sections — link the heading by its anchor. Same document: a bare `#anchor`, e.g. `[Phase 6](#phase-6-reply-to-review-threads)`. Another document: `path#anchor` — a repo-relative path in repository files, the absolute `<repo-blob-url>/path#anchor` form in generated output. A GitHub anchor is the heading lower-cased, spaces turned to hyphens, punctuation dropped.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link. A tracker ID GitHub does not auto-link (e.g. Linear `ENG-123`) is dead text when bare: in prose, ALWAYS render it as a markdown link, e.g. `[ENG-123](https://linear.app/<workspace>/issue/ENG-123)` — a slug-less issue URL resolves. On a magic-word line (`Closes`/`Fixes`/`Related to` in a PR body's `**Issues:**` section) use plain forms only: bare `#N` for GitHub, the plain issue URL for other trackers — never a markdown-bracket link, which breaks the close-parsers.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
