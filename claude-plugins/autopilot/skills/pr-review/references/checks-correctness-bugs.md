# Correctness & Bugs — pr-review check details

Full rule bodies for the **Correctness & Bugs** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-BUG-001: Wrong variable referenced** — Severity: blocker

A variable from an outer scope, a similarly-named variable, or a copy-paste leftover is used instead of the intended one.

- Example: function receives `requestConfig` but the body reads a `config` from an outer scope; a loop variable shadowing an outer `item`.

**CHECK-BUG-002: Shared mutable state across async tasks** — Severity: blocker

Multiple async tasks reading/writing the same mutable object (array, object, or instance field) without synchronization; interleaved awaits can cause inconsistent state even in single-threaded async runtimes.

**CHECK-BUG-004: Incorrect serialization/deserialization** — Severity: blocker

Data lost or corrupted during JSON serialization — missing fields, wrong types, enum value mismatch between sender and receiver.

- Example: `JSON.stringify` drops `undefined` fields the consumer expects as `null`.

**CHECK-PERF-001: Repeated I/O or query inside a loop (N+1)** — Severity: suggestion

A network call, database query, or filesystem read issued once per item in a loop where a single batched call would do.

- Example: `for (const id of ids) { await db.user(id) }` instead of one `db.users(ids)` batch.

**CHECK-PERF-002: Quadratic or unbounded per-item work** — Severity: suggestion

An operation whose cost grows super-linearly with input — a nested scan (`Array.find`/`includes` inside a loop over a large collection) where a `Map`/`Set` would give O(1) lookup.

- Example: `items.filter((a) => others.find((b) => b.id === a.id))` with a large `others`.
- Skip: collections known to be small and fixed by the surrounding code.
