# Complexity & Readability — pr:review check details

Full rule bodies for the **Complexity & Readability** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-CPLX-001: Function exceeds 100 lines** — Severity: blocker

Any function or method longer than 100 lines (all stacks).

**CHECK-CPLX-002: Nesting depth too deep**

Control flow nested beyond the stack-specific threshold. Prefer early returns over nested conditionals.

- **Bun / NodeJS+React / Bun+React+Tailwind / NodeJS+React+Tailwind**: blocker at 3+ levels (ESLint `max-depth: 2` per CLAUDE.md).
- **unknown**: blocker at 5+ levels.

**CHECK-CPLX-003: Cyclomatic complexity exceeds 15** — Severity: suggestion

Function has more than 15 independent code paths (branches, loops, exception handlers).

**CHECK-CPLX-004: File exceeds 1000 lines** — Severity: blocker

Any code file longer than 1000 lines. Long files must be split.

**CHECK-CPLX-005: Misleading function/variable name** — Severity: blocker

Name implies different behavior than the code does. `get*` that mutates state, `is*` that returns non-boolean, `validate*` that also transforms.

**CHECK-CPLX-006: Inconsistent naming within module** — Severity: suggestion

Same concept named differently in the same file or closely related files — `user_id`, `uid`, `userId`.

- Scope: identifier (variable/function) naming **inside code**. Inconsistent **file/path** naming is CHECK-CS-008 — do not double-report.

**CHECK-CPLX-007: Magic numbers or magic strings** — Severity: suggestion

Numeric or string literals used in logic without a named constant explaining their meaning.

- Example: `if (buffer.length > 8192)` without explaining what 8192 represents.

**CHECK-CPLX-008: Long parameter list (>9 total or >6 positional)** — Severity: suggestion

Function accepts more than 9 total parameters or more than 6 positional, indicating it should accept a config/options object instead.

**CHECK-CPLX-009: Comment explains "what" instead of "why"** — Severity: suggestion

Comments describing what the code does (obvious from the code) instead of why.
