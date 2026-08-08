# Common Sense — pr:review check details

Full rule bodies for the **Common Sense** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-CS-001: Constant value is clearly wrong** — Severity: blocker

A constant whose value doesn't match what it represents — too large, too small, wrong units, or nonsensical for the domain.

- Example: `TIMEOUT_MS = 1` (1ms is too short for most network calls).

**CHECK-CS-002: Timeout too short or too long** — Severity: suggestion

Timeout values dangerously short (false failures) or too long (blocking resources). Compare against the expected operation duration.

- Example: `const requestTimeout = 0.5` for a call involving ML inference; `const sessionTimeout = 86400 * 30`.

**CHECK-CS-003: Unbounded growth — no limits on collections** — Severity: suggestion

A data structure that grows without bound (cache, in-memory queue, log buffer) without eviction policy or size limit.

- Example: `this.history = []` that pushes every request but never trims.

**CHECK-CS-004: Error message doesn't help debugging** — Severity: suggestion

An error message lacking enough context to diagnose — missing which value failed, what was expected, or what operation was attempted.

**CHECK-CS-005: Log message at wrong level** — Severity: suggestion

Expected/handled conditions logged as errors (noisy), or critical failures logged as warnings (hidden).

- Example: `logger.error("user not found")` for a normal 404 flow.

**CHECK-CS-006: Feature flag or environment variable undocumented** — Severity: suggestion

A new environment variable or feature flag added without documenting it in README, config template, or deployment docs.
