# Logging — pr:review check details

Full rule bodies for the **Logging** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies when the diff adds or changes log calls or error/exception messages in service/backend code.

**CHECK-LOG-001: Dynamic value interpolated into a log message** — Severity: suggestion

The log message must be a static string so aggregators group it across occurrences. IDs, counts, durations, hosts, and user input belong in structured context fields, not in the message via interpolation or concatenation.

- Example: `logger.info("Request " + id + " took " + ms + "ms")` → `logger.info({ request_id: id, duration_ms: ms }, "Request processed.")`.

**CHECK-LOG-002: Log level mismatched to the message pattern** — Severity: suggestion

Progressive ("-ing", about-to-act) messages must be `debug`; completed business events are `info` in past tense; recoverable failures are `warning`; unrecoverable failures are `error` with a reason. A progressive message at `info`, or a bare `error` with no reason, is a mismatch.

- Example: `logger.info("Processing payment.")` → `logger.info("Payment processed.")`, or keep the wording and drop to `debug`.

**CHECK-LOG-003: Non-static error or exception message** — Severity: suggestion

The string passed to an error constructor or `throw` must be static; put dynamic context as error properties (or structured fields) so error trackers group it as one issue instead of thousands.

- Example: `throw new Error("Couldn't connect to " + host)` → a static message with `host` carried as an error property.

**CHECK-LOG-004: Asynchronous or fire-and-forget logging** — Severity: suggestion

Log calls must be synchronous. Wrapping them in `setImmediate`, `process.nextTick`, a `Promise` callback, or `await`-ing them solely to defer risks dropping records on shutdown and makes ordering non-deterministic.

**CHECK-LOG-005: Logging an error at the throw site** — Severity: suggestion

A function that throws should not also log the same failure — the error carries the context and the handler logs it once. Logging at both the raise and the catch sites double-reports the same incident.

**CHECK-LOG-006: Large or binary payload logged in full** — Severity: suggestion

Binary or oversized data (audio, images, encoded blobs, whole buffers) logged in full. Log its byte length (and an optional bounded preview), not the content. Useful text such as model prompts/completions may be logged in context fields when the pipeline can handle the volume.
