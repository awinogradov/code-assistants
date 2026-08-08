# Surface Correctness — pr-review check details

Full rule bodies for the **Surface Correctness** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-BUG-005: Unreachable code after early return** — Severity: suggestion

Code placed after an unconditional `return`, `raise`, `break`, or `continue` that can never execute.

**CHECK-BUG-006: Timezone-naive datetime operations** — Severity: suggestion

Mixing timezone-aware and timezone-naive datetimes, or assuming local time when UTC is required.

- Example: `new Date()` without explicit UTC handling when the codebase standardizes on a UTC helper.

**CHECK-BUG-007: Incorrect exception handling — catching too broadly** — Severity: suggestion

Bare `catch (e) { ... }` that swallows errors without rethrowing — especially where an `AbortError` or a programmer error should propagate.

- Example: `catch (e) { logger.error("failed"); }` swallowing an `AbortError` from a cancelled fetch.

**CHECK-BUG-008: Return type mismatch with type annotation** — Severity: suggestion

A function's actual return value doesn't match its type annotation on some code paths.

- Example: `function getName(): string` with an implicit `return undefined` on cache miss.
