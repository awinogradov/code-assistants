# Repository Principles — pr:review check details

Full rule bodies for the **Repository Principles** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to repositories carrying a `principles/` folder.

**CHECK-PRINCIPLE-001: Diff conflicts with a stated repository principle** — Severity: suggestion

A change works against a value stated in `principles/` — the repository's long-lived design values, which its standards and reviews appeal to. Quote the principle verbatim (≤2 lines) in the finding detail and cite it as a `<pr-blob-url>` link (defined in [reviewComment Format](../SKILL.md#reviewcomment-format-30-lines-max)), matching CHECK-RFC-001/002; a finding that only paraphrases the value is not reportable.

- Example: a stated simplicity principle argues against configuration knobs and the diff adds an unrequested feature flag.
- Skip: an Accepted RFC or a `docs/*` convention already covers the same ground — report that check once and cite the principle in its detail; the diff itself amends the principle.
