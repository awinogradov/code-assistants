/**
 * Tests for reviewOutput.ts — pure parsing and diff-hunk validation.
 */
import { describe, expect, test } from "bun:test";

import {
  extractValidLines,
  formatInvalidComments,
  isAlreadyMentioned,
  isValidComment,
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

describe("isValidComment", () => {
  const valid = [{ path: "a.ts", line: 10 }];
  test("matches path and line", () => {
    expect(isValidComment({ path: "a.ts", line: 10, body: "x" }, valid)).toBe(true);
  });
  test("rejects wrong line or path", () => {
    expect(isValidComment({ path: "a.ts", line: 11, body: "x" }, valid)).toBe(false);
    expect(isValidComment({ path: "b.ts", line: 10, body: "x" }, valid)).toBe(false);
  });

  const range = [
    { path: "a.ts", line: 10 },
    { path: "a.ts", line: 11 },
    { path: "a.ts", line: 12 },
  ];
  test("accepts a multi-line range fully in the diff", () => {
    expect(isValidComment({ path: "a.ts", line: 12, body: "x", startLine: 10 }, range)).toBe(true);
  });
  test("rejects a multi-line range straddling a non-diff line", () => {
    const gapped = [
      { path: "a.ts", line: 10 },
      { path: "a.ts", line: 12 },
    ];
    expect(isValidComment({ path: "a.ts", line: 12, body: "x", startLine: 10 }, gapped)).toBe(false);
  });
  test("rejects an inverted range (startLine > line)", () => {
    expect(isValidComment({ path: "a.ts", line: 10, body: "x", startLine: 12 }, range)).toBe(false);
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
});
