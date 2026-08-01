# Service Standards — pr:review check details

Full rule bodies for the **Service Standards** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies when the diff adds or changes a backend service's API, entrypoint, or runtime config.

**CHECK-SVC-001: New or changed HTTP API without an OpenAPI schema** — Severity: suggestion

A new or changed public HTTP endpoint must have a matching OpenAPI/JSON schema, and a breaking change must be versioned with backward compatibility rather than altering an existing version in place.

**CHECK-SVC-002: Service entrypoint without health checks** — Severity: suggestion

A new long-running service must expose liveness, readiness, and startup health checks for orchestration. Flag a service entrypoint that wires none.

**CHECK-SVC-003: Unstructured service logging** — Severity: suggestion

Service logs must be structured JSON carrying a correlation/trace ID for cross-service tracing (the Logging checks then govern their quality). Plain `console.log` or free-form string logs in a service are a finding.

**CHECK-SVC-004: Runtime or language version below the supported floor** — Severity: nitpick

A new service must target the supported runtimes (e.g. Node.js 22+ LTS with TypeScript 5.8+, or Bun 1.2.19+ with TypeScript 5.8+). A manifest pinning an older floor is a finding.
