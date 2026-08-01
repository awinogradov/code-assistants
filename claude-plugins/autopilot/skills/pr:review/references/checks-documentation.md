# Documentation — pr:review check details

Full rule bodies for the **Documentation** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to repositories carrying a `docs/` folder and `README.md`.

**CHECK-DOC-001: Docs not updated in the same PR as the code** — Severity: suggestion

Documentation ships with the code that changes it. A diff that adds or alters a documented behavior, endpoint, or area without updating the corresponding `docs/*.md` (or `README.md`) in the same PR is incomplete.

**CHECK-DOC-002: New or renamed doc missing from the README index** — Severity: suggestion

The root `README.md` Documentation section is the single index — every `.md` under `docs/` (at any depth) must be listed there. A new or renamed `docs/*.md` not added to the index is a finding.

**CHECK-DOC-003: Doc filename not kebab-case or not self-descriptive** — Severity: nitpick

`docs/*.md` files must be `kebab-case`, self-descriptive, and share a domain prefix with their siblings (e.g. `tts-google.md`, `tts-elevenlabs.md`, not `elevenlabs.md`). A subfolder must not carry its own `readme.md`; the root README is the only index.

**CHECK-DOC-004: Doc file too large or covering multiple areas** — Severity: nitpick

A `docs/*.md` file exceeds ~5000 characters or documents more than one area. Split it; keep code examples minimal (link to source, explain the "why" in prose).

**CHECK-DOC-005: Diff contradicts a documented project convention** — Severity: suggestion

A change violates a convention documented in the repository's `docs/*` or README — the [§1.5](../SKILL.md#15-context-map) Applicable standards map lists the conventions in play. Docs are unversioned prose, so this is capped at suggestion; a convention that must block belongs in an Accepted RFC. Quote the contradicted sentence verbatim (≤2 lines) in the finding detail and cite the doc section as a `<pr-blob-url>` link (defined in [reviewComment Format](../SKILL.md#reviewcomment-format-30-lines-max)).

- Example: a `docs/*.md` API chapter prescribes cursor pagination and the diff adds an offset-paginated endpoint.
- Skip: the doc describes current behavior the diff intentionally changes AND the same PR updates that doc.
