# Repository Standards (RFCs) — pr-review check details

Full rule bodies for the **Repository Standards (RFCs)** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to repositories carrying an `rfc/` folder.

**CHECK-RFC-001: Diff violates an Accepted repository RFC** — Severity: blocker

A change contradicts a clause of an RFC whose `status` is Accepted — the repository's ratified standard, immutable except through a version bump.

- Example: an Accepted logging RFC mandates structured JSON logs and the diff adds a plain `console.log` to a service.
- Skip: the RFC's own text names an exception that applies; a defaulted status is Draft, not Accepted — route it to CHECK-RFC-002.

**CHECK-RFC-002: Diff conflicts with a Draft repository RFC** — Severity: suggestion

A change contradicts a clause of a Draft RFC (including standards whose status was defaulted to Draft). Draft standards are proposals — advisory only, never a blocker; name the Draft status in the finding.

- Example: a Draft API-versioning RFC prescribes `/v1/` route prefixes and the diff adds an unversioned route.
- Skip: the Draft's own text scopes itself to future or new code and the diff only extends an existing pattern.

**CHECK-RFC-003: Accepted RFC edited without a version bump** — Severity: blocker

The diff changes the content of an Accepted RFC without incrementing its `version` frontmatter and adding a Changelog entry (and updating `updated` when the format carries it). An Accepted RFC is immutable except through an explicit, recorded version bump.

- Example: rewording a mandate inside an Accepted RFC while `version:` stays unchanged.
- Skip: pure typo or formatting fixes that change no normative content — mention them in prose instead; a status transition (e.g. Draft → Accepted) recorded with a version bump.

**CHECK-RFC-004: RFC file hygiene** — Severity: suggestion

A new or renamed RFC is missing from the `rfc/README.md` index, its filename does not follow `NNNN-short-slug.md`, or its frontmatter is missing or malformed (no parseable `status`).

- Example: adding an `rfc/0008-*.md` standard without an index row; an RFC whose frontmatter lacks `status`.
- Skip: repositories with no `rfc/README.md` index at all — the Glob fallback is the index there; flag only frontmatter problems.
