# AI Code Smells — pr-review check details

Full rule bodies for the **AI Code Smells** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-AI-001: Unnecessary abstraction layer** — Severity: suggestion

Interface/protocol/base class with exactly one implementation and no plan for others.

- Example: `AudioConverterProtocol` with only `WavConverter` implementing it.

**CHECK-AI-002: Output parameters (mutable args used for returning data)** — Severity: blocker

Function mutates a passed-in object to "return" data through it instead of using actual return values. A C-ism with no place in TypeScript.

- Example: `function getStatus(result) { result.status = "active"; result.code = 200; }` — should return a value.

**CHECK-AI-003: Unnecessary async wrapping** — Severity: suggestion

Function marked `async` with no `await` — synchronous code wearing an async costume.

**CHECK-AI-004: Logging every line of execution** — Severity: suggestion

Debug logging at entry, exit, and every intermediate step. Logs should capture decisions and state changes, not trace every line.

**CHECK-AI-005: Excessive type annotations on obvious code** — Severity: suggestion

Type annotations on every local variable, including trivially obvious ones, adding noise without aiding understanding.

**CHECK-AI-006: Placeholder implementation left in production code** — Severity: blocker

An empty stub body, a `throw new Error("Not implemented")`, or a `// TODO` placeholder in code that should be fully implemented.

**CHECK-DEAD-001: Dead code introduced by the diff** — Severity: suggestion

Commented-out code blocks, or unused imports / variables / private functions / exports, added or left behind by this change. Ship live code only — recover history from version control instead of parking it in comments.

- Example: a commented-out former implementation kept "just in case"; an `import` added but never referenced.
- Skip: pre-existing dead code your change did not introduce (mention it in prose, do not block on it).
