# Code review repository standards

> Chapter 12 of the [repository docs](../README.md#repository-docs).

`code-review-action` reviews every PR against the repo's `CLAUDE.md` and the generic `CHECK-*` catalog in the [pr-review skill](../claude-plugins/autopilot/skills/pr-review/SKILL.md). This chapter defines the additional, convention-based contract: when a consumer repository carries a root `CODE_REVIEW.md`, that file is the review-rules source; otherwise, when it carries `rfc/`, `docs/`, or `principles/`, the review discovers and enforces those standards. There is no workflow input or config key — the file or the folders are the opt-in, and repositories without them see no change and pay no cost.

## Consumer CODE_REVIEW.md

A repository can distill its standards corpus into one review-ready file: a root `CODE_REVIEW.md` carrying rules with ids, declared severities, and source citations (each rule ideally anchored with `<a id="STR-2">`-style anchors). When a non-empty `CODE_REVIEW.md` exists, the review reads it in full as the applicable-standards source and skips the discovery below entirely — no README/docs indexing, no `rfc/` inventory and selection, no `principles/` matching. `CLAUDE.md` stack rules and the generic `CHECK-*` catalog apply as always.

Findings from the file belong to the Consumer Review Rules family (CHECK-REVIEWFILE-001), but each finding carries the **consumer's own rule id** (e.g. `STR-2`) as its rule code, linked to that rule's anchor in `CODE_REVIEW.md` at the PR head; severity comes from the rule's own declaration (suggestion when it declares none), replacing the severity ladder below. Because the file is the only rules source read, CHECK-RFC-001/002, CHECK-DOC-005, and CHECK-PRINCIPLE-001 are skipped — CHECK-RFC-003/004 hygiene still applies whenever a diff touches `rfc/` files. A `CODE_REVIEW.md` the diff itself modifies is enforced at its base-branch version, so a PR cannot legalize its own diff by editing the rules.

The file is consumer-curated: this repository ships no generator, and on any conflict between the file and its cited sources, the sources stay normative — keeping the distillation honest is the consumer's contract with itself.

## Discovery

Discovery runs only when no root `CODE_REVIEW.md` fired the check-first tier above.

- **`rfc/` (versioned standards)** — the review builds an inventory `{id, title, status, path}` from the `rfc/README.md` index table; when no index exists it globs `rfc/[0-9]*.md` and reads each file's frontmatter. A missing id or title is derived from the `NNNN-slug` filename (or the first H1); a missing or unparseable `status` counts as Draft and is recorded as defaulted — visible in the review, never a silent downgrade.
- **`docs/` (project conventions)** — indexed via the root `README.md` docs table, else `docs/README.md`, else the `docs/*.md` file names.
- **`principles/` (long-lived values)** — indexed via `principles/README.md`, matched by title against the diff's domain. The folder is root-only: values are repo-wide, so unlike `docs/` there is no per-workspace variant. Principles carry no `status` frontmatter, because the lifecycle is the point — docs change continuously, RFCs change on an explicit version bump, and a change to a principle is itself an RFC.

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
| Principle              | —                    | CHECK-PRINCIPLE-001 — suggestion      |

Ratifying an RFC (status Accepted) is what makes a standard blocking — a docs convention or a stated principle can advise but never block. Capping principles at suggestion is deliberate: an unversioned prose value should not gate a merge, and the non-blocking channel is exactly where a design concern no RFC covers yet gets raised — which is often where the next RFC comes from. Every finding quotes the violated clause verbatim (≤2 lines) and cites the standard as a link at the PR head commit, so citations stay grounded and resolvable. A violation that also matches a generic `CHECK-*` rule is reported once under the generic code, with the RFC cited in its detail.

## RFC hygiene

Two checks protect the `rfc/` contract itself and apply whenever a diff touches `rfc/` files:

- **CHECK-RFC-003** (blocker) — an Accepted RFC edited in place without a `version` bump and Changelog entry.
- **CHECK-RFC-004** (suggestion) — a new or renamed RFC missing from the index, a filename not matching `NNNN-short-slug.md`, or missing/malformed frontmatter.

An RFC modified by the diff is enforced at its base-branch version, so a single PR cannot weaken a standard and ship code that violated the old version at the same time.

## Cost behavior

Discovery is index-first: one small read builds the inventory, and only matched standards (at most 3) are read further, section-targeted for large files. The rule catalog grows by six codes total; per-review cost stays within the normal band for repositories with standards and is unchanged for repositories without them.

## Planning against the same standards

Enforcement is only half the loop. The [`digest-repo-standards` agent](../claude-plugins/autopilot/agents/digest-repo-standards.md) reads the same sources inside the [plan skill](../claude-plugins/autopilot/skills/plan/SKILL.md#repository-standards)'s context fan-out and records the selected standards in its Context Map, so a plan is shaped to **comply** with Accepted RFCs rather than propose a change this review would then block — review enforces, plan complies. The agent applies the identical precedence: a root `CODE_REVIEW.md` is read first and emitted as the single standards source, and only in its absence does the agent run the same discovery and selection contract (index-first inventory, token-match selection capped at 3). It adds no `CHECK-*` codes of its own, and when a change edits an Accepted RFC the plan requires the same `version` bump + Changelog entry that `CHECK-RFC-003` guards.
