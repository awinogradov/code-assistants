/**
 * Tests for githubReview.ts pure helpers.
 * Octokit-backed functions (fetch/resolve threads, getLastBotReview) are exercised
 * by the end-to-end review in CI and by the Phase 5 fake-Octokit suite (#149).
 */
import { describe, expect, test } from "bun:test";

import { normalizeBody } from "./githubReview.ts";

describe("normalizeBody", () => {
  test("strips per-line trailing whitespace", () => {
    expect(normalizeBody("line one   \nline two\t\n")).toBe("line one\nline two");
  });

  test("collapses 3+ blank lines to a single blank line", () => {
    expect(normalizeBody("a\n\n\n\nb")).toBe("a\n\nb");
  });

  test("treats bodies differing only in trailing space / extra blanks as equal", () => {
    expect(normalizeBody("### Blockers\n\n- one")).toBe(
      normalizeBody("### Blockers   \n\n\n- one  ")
    );
  });

  test("preserves line breaks — structurally different bodies stay different", () => {
    // The old collapse-all-whitespace approach wrongly made these identical.
    expect(normalizeBody("a\nb")).not.toBe(normalizeBody("a b"));
  });

  test("trims leading and trailing newlines", () => {
    expect(normalizeBody("\n\nbody\n\n")).toBe("body");
  });
});
