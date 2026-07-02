# Code review repository standards

> Chapter 12 of the [repository docs](../README.md#repository-docs).

`code-review-action` reviews every PR against the repo's `CLAUDE.md` and the generic `CHECK-*` catalog in the [pr:review skill](../claude-plugins/autopilot/skills/pr:review/SKILL.md). This chapter defines the additional, convention-based contract: when a consumer repository carries `rfc/` or `docs/`, the review enforces those standards too. There is no workflow input or config key — the folders are the opt-in, and repositories without them see no change and pay no cost.

## Discovery

- **`rfc/` (versioned standards)** — the review builds an inventory `{id, title, status, path}` from the `rfc/README.md` index table; when no index exists it globs `rfc/[0-9]*.md` and reads each file's frontmatter. A missing id or title is derived from the `NNNN-slug` filename (or the first H1); a missing or unparseable `status` counts as Draft and is recorded as defaulted — visible in the review, never a silent downgrade.
- **`docs/` (project conventions)** — indexed via the root `README.md` docs table, else `docs/README.md`, else the `docs/*.md` file names.

## Selection

The review reads only diff-relevant standards, chosen mechanically: each inventory entry's title+slug tokens are matched against the changed file paths and the diff's visible domains (log calls → a logging standard, HTTP routes → an API standard, new files → a file-structure standard). When in doubt whether a standard applies, it is loaded — capped at 3 standards per review, ranked by match strength; dropped candidates are recorded in the review's context map, never silently truncated. A standard longer than ~300 lines is read section-by-section, not in full.

## Severity ladder

Severity follows source stability:

| Source                 | Status               | Finding                               |
| ---------------------- | -------------------- | ------------------------------------- |
| RFC                    | Accepted             | CHECK-RFC-001 — blocker               |
| RFC                    | Draft (or defaulted) | CHECK-RFC-002 — suggestion (advisory) |
| RFC                    | Superseded           | never enforced                        |
| docs/README convention | —                    | CHECK-DOC-005 — suggestion            |

Ratifying an RFC (status Accepted) is what makes a standard blocking — a docs convention can advise but never block. Every finding quotes the violated clause verbatim (≤2 lines) and cites the standard as a link at the PR head commit, so citations stay grounded and resolvable. A violation that also matches a generic `CHECK-*` rule is reported once under the generic code, with the RFC cited in its detail.

## RFC hygiene

Two checks protect the `rfc/` contract itself and apply whenever a diff touches `rfc/` files:

- **CHECK-RFC-003** (blocker) — an Accepted RFC edited in place without a `version` bump and Changelog entry.
- **CHECK-RFC-004** (suggestion) — a new or renamed RFC missing from the index, a filename not matching `NNNN-short-slug.md`, or missing/malformed frontmatter.

An RFC modified by the diff is enforced at its base-branch version, so a single PR cannot weaken a standard and ship code that violated the old version at the same time.

## Cost behavior

Discovery is index-first: one small read builds the inventory, and only matched standards (at most 3) are read further, section-targeted for large files. The rule catalog grows by five codes total; per-review cost stays within the normal band for repositories with standards and is unchanged for repositories without them.
