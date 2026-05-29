/**
 * Tests for aggregateReviews.ts — deterministic dedupe/merge/order of the
 * structured findings emitted by the parallel review sub-agents.
 */
import { describe, expect, test } from "bun:test";

import { aggregateReviews } from "./aggregateReviews.ts";
import type { AgentReview, ReviewFinding } from "./reviewFindings.ts";

const finding = (over: Partial<ReviewFinding>): ReviewFinding => ({
  severity: "suggestion",
  file: "src/a.ts",
  line: 1,
  rule: null,
  title: "title",
  detail: "detail",
  ...over,
});

const review = (category: string, findings: ReviewFinding[]): AgentReview => ({
  category,
  findings,
});

describe("aggregateReviews", () => {
  test("returns an empty list for no reviews and for empty findings", () => {
    expect(aggregateReviews([])).toEqual([]);
    expect(aggregateReviews([review("correctness", [])])).toEqual([]);
  });

  test("orders blockers, then suggestions, then nitpicks", () => {
    const merged = aggregateReviews([
      review("a", [
        finding({ severity: "nitpick", line: 1 }),
        finding({ severity: "blocker", line: 2 }),
        finding({ severity: "suggestion", line: 3 }),
      ]),
    ]);
    expect(merged.map((f) => f.severity)).toEqual(["blocker", "suggestion", "nitpick"]);
  });

  test("dedupes the same (file,line) keeping the higher severity", () => {
    const merged = aggregateReviews([
      review("surface", [finding({ severity: "suggestion", line: 5 })]),
      review("correctness", [finding({ severity: "blocker", line: 5 })]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.severity).toBe("blocker");
  });

  test("merges rule codes at a shared location into one ordered, de-duplicated list", () => {
    const merged = aggregateReviews([
      review("correctness", [finding({ severity: "blocker", line: 5, rule: "CHECK-BUG-002" })]),
      review("ai-smells", [finding({ severity: "suggestion", line: 5, rule: "CHECK-AI-002" })]),
      review("surface", [finding({ severity: "nitpick", line: 5, rule: "CHECK-BUG-002" })]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.rule).toBe("CHECK-BUG-002, CHECK-AI-002");
  });

  test("treats the same line in different files as distinct findings", () => {
    const merged = aggregateReviews([
      review("a", [finding({ file: "src/a.ts", line: 5 })]),
      review("b", [finding({ file: "src/b.ts", line: 5 })]),
    ]);
    expect(merged).toHaveLength(2);
  });

  test("never merges null-line (out-of-diff) findings", () => {
    const merged = aggregateReviews([
      review("a", [finding({ severity: "blocker", line: null })]),
      review("b", [finding({ severity: "suggestion", line: null })]),
    ]);
    expect(merged).toHaveLength(2);
  });

  test("is stable within a severity (preserves first-seen order)", () => {
    const merged = aggregateReviews([
      review("a", [
        finding({ severity: "suggestion", line: 1, title: "first" }),
        finding({ severity: "suggestion", line: 2, title: "second" }),
      ]),
    ]);
    expect(merged.map((f) => f.title)).toEqual(["first", "second"]);
  });
});
