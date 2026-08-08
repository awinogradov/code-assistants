# Security — pr-review check details

Full rule bodies for the **Security** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-SEC-001: Hardcoded secret or credential** — Severity: blocker

An API key, token, password, private key, or connection string with embedded credentials committed in source instead of read from a secret store or environment variable.

- Example: `const apiKey = "sk-live-..."`; a database URL with inline `user:password@host`.
- Skip: obvious non-secret placeholders (`"xxx"`, `"<your-token>"`, `process.env.X` references).

**CHECK-SEC-002: Injection via unsanitized input** — Severity: blocker

Untrusted input concatenated into a SQL query, shell command, file path, or HTML sink without parameterization, escaping, or validation.

- Example: `db.query("SELECT * FROM users WHERE id = " + req.params.id)`; user input in a filesystem path without normalization (path traversal).

**CHECK-SEC-003: Missing or broken access control** — Severity: blocker

A privileged action, route, or resource accessed without verifying authentication or the caller's authorization; a check present but trivially bypassed.

- Example: a mutation endpoint that never checks the caller owns the resource; an `isAdmin` flag read from client-supplied input.

**CHECK-SEC-004: Weak or misused cryptography** — Severity: blocker

A broken algorithm (MD5/SHA1 for security), a non-constant-time secret comparison, a hardcoded/static IV or salt, or `Math.random()` for security-sensitive values.

- Example: comparing tokens with `===` instead of `crypto.timingSafeEqual`.

**CHECK-SEC-005: Unsafe deserialization or dynamic evaluation of untrusted input** — Severity: blocker

`eval`/`Function`, dynamic `import()`/`require()` with a user-controlled path, or deserializing attacker-controlled data into executable structures.

**CHECK-SEC-006: Secrets or PII written to logs or responses** — Severity: suggestion

Tokens, passwords, full request bodies with credentials, or personal data logged or returned in an API/error response.

- Example: `console.log("auth", req.headers.authorization)`; an error handler returning a stack trace with a connection string to the client.

**CHECK-SEC-007: External input crosses a trust boundary without validation** — Severity: suggestion

Data from outside the program — a request body/params, an external API response, a webhook payload, env vars, or file contents — consumed without validating its shape at the boundary before use. Distinct from CHECK-SEC-002 (injection sinks) and CHECK-PLAT-003 (which validation library): this fires when external input is trusted with no validation at all.

- Example: `const { amount } = await res.json()` used directly in a calculation without parsing the response against a schema.
- Skip if the diff does not read external input, or the value is already validated at the boundary before this use.
