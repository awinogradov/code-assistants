# Testing — pr-review check details

Full rule bodies for the **Testing** family of [pr-review §2.3](../SKILL.md#23-review-checks). Applies to every PR — no precondition.

**CHECK-TEST-001: Testing mock behavior, not real behavior** — Severity: blocker

Test configures a mock to return X, then asserts the code got X. This tests the mock, not the code.

- Example: `mockService.get.mockReturnValue(42); expect(handler()).toBe(42)`.

**CHECK-TEST-002: Business logic duplicated in test** — Severity: blocker

Test reimplements the same calculation/logic as production to compute the expected value instead of using known input/output pairs. If production is wrong, the test is wrong the same way.

- Example: `const expected = sum(items) * taxRate + shipping; expect(calculateTotal(items)).toBe(expected)`.

**CHECK-TEST-003: Mock without verifying call arguments** — Severity: suggestion

Test creates a mock but never checks what arguments it was called with, only that the return value flowed through.

- Example: `mockDb.save.mockReturnValue(true)` but no `expect(mockDb.save).toHaveBeenCalledWith(expectedRecord)`.

**CHECK-TEST-004: Error path untested** — Severity: suggestion

Only the happy path is tested. Error conditions (invalid input, timeout, connection failure, empty result) have no coverage.

- Example: tests for `fetchUser` only cover successful fetch, never user-not-found or network error.

**CHECK-TEST-005: Edge cases of modified function not tested** — Severity: suggestion

A function is modified (new parameter, changed boundary) but existing tests don't cover the new behavior.

- Example: adding an `offset` parameter to a pagination function but no test exercises non-zero offset.

**CHECK-TEST-006: Test fixtures duplicated across files** — Severity: suggestion

Same test data or setup copy-pasted in multiple test files instead of shared fixtures.

- Example: three test files each creating the same `mockGrpcChannel` with identical setup.

**CHECK-TEST-007: Test asset (fixture data) inlined as giant string** — Severity: suggestion

Large JSON blobs, XML payloads, or byte strings hardcoded in test files instead of loaded from `tests/assets/` or `tests/fixtures/`.

- Example: 200-line JSON object defined at top of test file.

**CHECK-TEST-008: New public function without test** — Severity: suggestion

A new public function, method, or endpoint added with zero test coverage. Every non-trivial public interface needs at least a happy-path test.

- Example: new exported function `parseConfig` with no test file changes in the diff.

**CHECK-TEST-009: Flaky test indicator — sleep or retry in test** — Severity: suggestion

Tests using `setTimeout`, fixed delays, or retry loops to wait for conditions — indicates a timing-dependent test.

- Example: `await new Promise(r => setTimeout(r, 500)); expect(queue).toBeEmpty()`.
