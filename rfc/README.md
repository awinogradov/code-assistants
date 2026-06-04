# RFCs

Versioned design records for conventions that skills, prompts, and the output they generate cite by a stable ID. An RFC is the durable home for a standard: once Accepted it changes only by issuing a new version, so anything that references it — skills, prompts, and the PRs and comments they generate — points at a fixed target instead of a doc that moves.

## Why an RFC instead of a doc

A plain doc under `docs/` changes silently and can be restructured at any time, which rots every link into it. An RFC is immutable except through an explicit, reviewable version bump, so a citation like `[RFC-0001](./0001-reference-formatting.md)` never breaks.

## Frontmatter

Every RFC starts with a YAML frontmatter block:

| Field     | Description                                           |
| --------- | ----------------------------------------------------- |
| `number`  | RFC number — unique and incrementing (1, 2, 3, …)     |
| `version` | Content version — incremented on each in-place change |
| `title`   | Short human-readable title                            |
| `status`  | One of `Draft`, `Accepted`, `Superseded`              |
| `author`  | GitHub handle of the author                           |
| `created` | ISO date the RFC was created (`YYYY-MM-DD`)           |
| `updated` | ISO date of the last version bump (`YYYY-MM-DD`)      |

## Statuses

- **Draft** — proposed and open for discussion; may still change.
- **Accepted** — ratified and stable. Change its content only through an explicit `version` bump recorded in the RFC's Changelog; supersede it with a new RFC only when replacing the standard wholesale.
- **Superseded** — replaced by a later RFC; kept for history. Note the successor in the body.

## Filenames and IDs

Files are named `NNNN-short-slug.md`, where `NNNN` is the zero-padded four-digit RFC number. Cite an RFC by its ID — `RFC-NNNN` (e.g. RFC-0001) — and link the file; never reference a standard by a `docs/` path or a section anchor that can move.

## Index

| RFC      | Title                                                                | Status   |
| -------- | -------------------------------------------------------------------- | -------- |
| RFC-0001 | [Reference formatting & readability](./0001-reference-formatting.md) | Accepted |
