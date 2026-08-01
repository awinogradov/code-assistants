# Platform Standards — pr:review check details

Full rule bodies for the **Platform Standards** family of [pr:review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-PLAT-001: No issue IDs in commit messages** — Severity: blocker

GitHub issue references (`#123`, `Closes #123`) must NOT appear in commit messages. The PR description handles issue linking via magic words.

- Platform ref: `commitlint.config.mjs` custom rule `no-issue-id`.

**CHECK-PLAT-002: Lint or type suppression comment (@ts-ignore / @ts-expect-error / eslint-disable)** — Severity: blocker

Zero tolerance for lint/type suppression comments. Any `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `eslint-disable-next-line` is a blocker.

**CHECK-PLAT-003: Wrong validation library** — Severity: suggestion

Data validation must use the stack-appropriate library, not manual validation or plain classes.

- **Bun / NodeJS+React / Bun+React+Tailwind / NodeJS+React+Tailwind**: must use Zod, not manual validation or plain interfaces for runtime validation.
- Skip if the diff does not add or modify validation logic.
