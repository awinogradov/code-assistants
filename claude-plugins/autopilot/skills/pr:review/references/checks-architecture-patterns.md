# Architecture & Patterns — pr:review check details

Full rule bodies for the **Architecture & Patterns** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-ARCH-001: Shared library utility not used** — Severity: suggestion

Code reimplements functionality already available in a shared library (logging, telemetry, pooling, database client, metrics). Check shared libraries before writing new utilities. Use Grep to confirm an existing implementation when in doubt.

**CHECK-ARCH-002: Reinventing stdlib or well-known library** — Severity: suggestion

Custom implementation of functionality available in the language stdlib or an approved dependency.

- Example: a custom retry helper when `p-retry` is already a dependency.

**CHECK-ARCH-003: Copy-paste from another service without abstraction** — Severity: suggestion

Large code blocks copied from another repo/service instead of extracting to a shared library.

**CHECK-ARCH-004: New dependency for trivial functionality** — Severity: suggestion

Adding a package for something doable in <20 lines with stdlib. Each dependency adds supply-chain risk.

- Example: adding `dotenv` to read 2 environment variables when `process.env` suffices.

**CHECK-DEP-001: Deprecated or unmaintained dependency added** — Severity: suggestion

A newly added dependency is deprecated, archived, or visibly unmaintained, or pulls a heavy/duplicate transitive tree for a small need.

- Example: adding `request` (deprecated) instead of the built-in `fetch`.

**CHECK-DEP-002: Dependency with incompatible or missing license** — Severity: suggestion

A new dependency carries a license incompatible with the project (e.g. GPL into a permissively-licensed project) or has no discernible license.

**CHECK-ARCH-007: Inconsistent error handling pattern** — Severity: suggestion

New code uses a different error-handling pattern than existing code in the same module (some methods raise, some return null).

**CHECK-ARCH-008: Inconsistent async pattern** — Severity: suggestion

Mixing sync and async code in the same layer. If the module is async, new code should be async too.

**CHECK-ARCH-010: Duplicated logic across files** — Severity: suggestion

Same or near-identical logic (>5 lines) appearing in multiple places. Should be extracted to a shared utility.

- Example: 13-line gRPC channel setup duplicated in 3 service files.
