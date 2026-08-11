# Consumer Review Rules — pr-review check details

Full rule bodies for the **Consumer Review Rules** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to repositories carrying a root `CODE_REVIEW.md`.

**CHECK-REVIEWFILE-001: Diff violates a rule in the consumer CODE_REVIEW.md** — Severity: as the violated rule declares (suggestion when it declares none)

A change contradicts a rule in the repository's root `CODE_REVIEW.md` — the consumer's distilled, review-ready rules corpus that [§1.4](../SKILL.md#14-project-context-read-before-reviewing) read as the standards source in place of the `docs/`/`rfc/`/`principles/` discovery. Report the finding under the consumer's own rule id (e.g. `STR-2`), quote the violated rule verbatim (≤2 lines) in the detail, and render the id per [§2.5](../SKILL.md#25-rule-codes) — linked to its anchor in `CODE_REVIEW.md` at the PR head when the file carries one.

- Example: `CODE_REVIEW.md` declares `LOG-1` (blocker) "Never log secrets, tokens, PII" and the diff adds a token to an info-level log call — report a blocker under `LOG-1`.
- Skip: the rule's own text names an exception that applies; a generic `CHECK-*` check already covers the same ground — report once under the generic code and cite the consumer rule in its detail; the diff itself amends `CODE_REVIEW.md` — the file is enforced at its base-branch version per [§1.4](../SKILL.md#14-project-context-read-before-reviewing), so rule edits are reviewed as content, not enforced against their own PR.
