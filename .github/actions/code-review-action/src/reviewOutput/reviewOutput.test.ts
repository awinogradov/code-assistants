/**
 * Tests for reviewOutput.ts — pure parsing and diff-hunk validation.
 */
import { describe, expect, test } from "bun:test";

import {
  anchorCommentToDiff,
  extractValidLines,
  formatInvalidComments,
  isAlreadyMentioned,
  parseReactionOutput,
  parseStructuredOutput,
} from "./reviewOutput.ts";

describe("parseStructuredOutput", () => {
  test("returns null for empty or literal-null input", () => {
    expect(parseStructuredOutput("")).toBeNull();
    expect(parseStructuredOutput("  null  ")).toBeNull();
  });

  test("returns null for non-object JSON", () => {
    expect(parseStructuredOutput('"a string"')).toBeNull();
    expect(parseStructuredOutput("42")).toBeNull();
  });

  test("returns null (never throws) on truncated / malformed JSON", () => {
    expect(parseStructuredOutput('{"verdict":"approve","reviewComment":"trunc')).toBeNull();
    expect(parseReactionOutput('{"reply":"oop')).toBeNull();
  });

  test("parses a full review object", () => {
    const out = parseStructuredOutput(
      '{"verdict":"requestChanges","reviewComment":"x","inlineComments":[{"path":"a.ts","line":3,"body":"b"}]}'
    );
    expect(out).toEqual({
      verdict: "requestChanges",
      reviewComment: "x",
      inlineComments: [{ path: "a.ts", line: 3, body: "b" }],
    });
  });

  test("parses optional startLine and suggestion on an inline comment", () => {
    const out = parseStructuredOutput(
      '{"verdict":"requestChanges","reviewComment":"x","inlineComments":[{"path":"a.ts","line":42,"body":"b","startLine":40,"suggestion":"  fixed()"}]}'
    );
    expect(out?.inlineComments[0]).toEqual({
      path: "a.ts",
      line: 42,
      body: "b",
      startLine: 40,
      suggestion: "  fixed()",
    });
  });

  test("defaults missing fields", () => {
    expect(parseStructuredOutput("{}")).toEqual({
      verdict: "comment",
      reviewComment: "Review completed.",
      inlineComments: [],
    });
  });
});

describe("parseReactionOutput", () => {
  test("returns null for empty / literal-null / non-object", () => {
    expect(parseReactionOutput("")).toBeNull();
    expect(parseReactionOutput("null")).toBeNull();
    expect(parseReactionOutput("3")).toBeNull();
  });

  test("parses a reply with defaults", () => {
    expect(parseReactionOutput('{"reply":"thanks"}')).toEqual({
      reply: "thanks",
      resolveComments: [],
      updatedVerdict: null,
      updatedReviewComment: null,
    });
  });

  test("parses a verdict update", () => {
    const out = parseReactionOutput(
      '{"reply":"ok","resolveComments":[{"path":"a.ts","line":1}],"updatedVerdict":"approve","updatedReviewComment":"done"}'
    );
    expect(out).toEqual({
      reply: "ok",
      resolveComments: [{ path: "a.ts", line: 1 }],
      updatedVerdict: "approve",
      updatedReviewComment: "done",
    });
  });
});

describe("extractValidLines", () => {
  test("expands a multi-line hunk into each added line", () => {
    const lines = extractValidLines([{ filename: "a.ts", patch: "@@ -1,2 +10,3 @@" }]);
    expect(lines).toEqual([
      { path: "a.ts", line: 10 },
      { path: "a.ts", line: 11 },
      { path: "a.ts", line: 12 },
    ]);
  });

  test("treats a hunk with no explicit count as a single line", () => {
    expect(extractValidLines([{ filename: "a.ts", patch: "@@ -5 +7 @@" }])).toEqual([
      { path: "a.ts", line: 7 },
    ]);
  });

  test("handles a zero-count (pure deletion) hunk as no commentable lines", () => {
    expect(extractValidLines([{ filename: "a.ts", patch: "@@ -3,2 +4,0 @@" }])).toEqual([]);
  });

  test("collects across multiple files and hunks, skips patch-less files", () => {
    const lines = extractValidLines([
      { filename: "a.ts", patch: "@@ -1,1 +1,1 @@\n@@ -8,0 +9,2 @@" },
      { filename: "b.ts" },
    ]);
    expect(lines).toEqual([
      { path: "a.ts", line: 1 },
      { path: "a.ts", line: 9 },
      { path: "a.ts", line: 10 },
    ]);
  });
});

describe("anchorCommentToDiff", () => {
  const valid = [{ path: "a.ts", line: 10 }];
  test("returns a single-line comment in-diff unchanged", () => {
    expect(anchorCommentToDiff({ path: "a.ts", line: 10, body: "x" }, valid)).toEqual({
      path: "a.ts",
      line: 10,
      body: "x",
      startLine: undefined,
    });
  });
  test("routes a single-line comment off-diff to the body (null)", () => {
    expect(anchorCommentToDiff({ path: "a.ts", line: 11, body: "x" }, valid)).toBeNull();
    expect(anchorCommentToDiff({ path: "b.ts", line: 10, body: "x" }, valid)).toBeNull();
  });

  const range = [
    { path: "a.ts", line: 10 },
    { path: "a.ts", line: 11 },
    { path: "a.ts", line: 12 },
  ];
  test("keeps a full in-diff range and its suggestion", () => {
    expect(
      anchorCommentToDiff({ path: "a.ts", line: 12, body: "x", startLine: 10, suggestion: "f" }, range)
    ).toEqual({ path: "a.ts", line: 12, body: "x", startLine: 10, suggestion: "f" });
  });
  test("clamps a cross-hunk range to the largest in-diff span ending at line, dropping the suggestion", () => {
    const gapped = [
      { path: "a.ts", line: 9 },
      { path: "a.ts", line: 11 },
      { path: "a.ts", line: 12 },
    ];
    expect(
      anchorCommentToDiff({ path: "a.ts", line: 12, body: "x", startLine: 9, suggestion: "f" }, gapped)
    ).toEqual({ path: "a.ts", line: 12, body: "x", startLine: 11, suggestion: undefined });
  });
  test("falls back to a single-line comment when only line is in-diff, dropping the suggestion", () => {
    const onlyLine = [
      { path: "a.ts", line: 10 },
      { path: "a.ts", line: 12 },
    ];
    expect(
      anchorCommentToDiff({ path: "a.ts", line: 12, body: "x", startLine: 10, suggestion: "f" }, onlyLine)
    ).toEqual({ path: "a.ts", line: 12, body: "x", startLine: undefined, suggestion: undefined });
  });
  test("normalizes an inverted range (startLine > line) and drops the suggestion", () => {
    expect(
      anchorCommentToDiff({ path: "a.ts", line: 10, body: "x", startLine: 12, suggestion: "f" }, range)
    ).toEqual({ path: "a.ts", line: 12, body: "x", startLine: 10, suggestion: undefined });
  });
  test("routes a range whose last line is off-diff to the body (null)", () => {
    expect(anchorCommentToDiff({ path: "a.ts", line: 13, body: "x", startLine: 11 }, range)).toBeNull();
  });
});

describe("isAlreadyMentioned", () => {
  test("detects the path:line token in the body", () => {
    expect(isAlreadyMentioned({ path: "src/a.ts", line: 5, body: "x" }, "see src/a.ts:5 above")).toBe(
      true
    );
    expect(isAlreadyMentioned({ path: "src/a.ts", line: 5, body: "x" }, "nothing here")).toBe(false);
  });
});

describe("formatInvalidComments", () => {
  test("returns empty string for no comments", () => {
    expect(formatInvalidComments([])).toBe("");
  });

  test("downgrades blockers to suggestions and includes the location header", () => {
    const out = formatInvalidComments([{ path: "a.ts", line: 9, body: "🚧 broken" }]);
    expect(out).toContain("## Additional Comments (not in diff)");
    expect(out).toContain("`a.ts:9`");
    expect(out).toContain("🙋‍♂️ broken");
    expect(out).not.toContain("🚧");
  });

  test("carries a suggestion into the body as a fenced block when present", () => {
    const out = formatInvalidComments([
      { path: "a.ts", line: 9, body: "broken", suggestion: "  const fixed = 1;" },
    ]);
    expect(out).toContain("```suggestion\n  const fixed = 1;\n```");
  });

  test("omits the suggestion fence when no suggestion is set", () => {
    expect(formatInvalidComments([{ path: "a.ts", line: 9, body: "broken" }])).not.toContain(
      "```suggestion"
    );
  });
});
