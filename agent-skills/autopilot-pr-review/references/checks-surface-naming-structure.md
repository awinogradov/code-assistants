# Surface Naming & Structure — pr:review check details

Full rule bodies for the **Surface Naming & Structure** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-CS-007: Filename too broad for its contents** — Severity: suggestion

File named generically (`utils.ts`, `helpers.ts`, `common.ts`) when it contains code for a specific domain and sits among 10+ other files.

- Example: `maintenance.ts` containing only queue maintenance routines should be `queueMaintenance.ts`.

**CHECK-CS-008: Inconsistent naming scheme across related files** — Severity: suggestion

Related files follow different naming patterns — some `_client`, others `_service`, mixing conventions.

- Scope: **file and path** naming. Inconsistent **identifier** naming inside code is CHECK-CPLX-006 — do not double-report.

**CHECK-CS-009: New file in wrong directory** — Severity: suggestion

File placed in a directory that doesn't match its purpose per the project's directory-structure conventions.

- Example: a service module placed in `src/api/` instead of `src/services/`.
