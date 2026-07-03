/**
 * Tests for reviewOutput.ts — pure parsing and diff-hunk validation.
 */
import { describe, expect, test } from "bun:test";

import {
  anchorCommentToDiff,
  extractValidLines,
  formatInvalidComments,
  isAlreadyMentioned,
  normalizeRuleLinkFragments,
  parseReactionOutput,
  parseStructuredOutput,
  repairOverEscapedWhitespace,
} from "./reviewOutput.ts";

describe("repairOverEscapedWhitespace", () => {
  test("converts over-escaped whitespace in a single-line body", () => {
    expect(repairOverEscapedWhitespace("a\\nb")).toBe("a\nb");
    expect(repairOverEscapedWhitespace("a\\tb")).toBe("a\tb");
  });

  test("collapses a literal \\r\\n to a single newline in one pass", () => {
    expect(repairOverEscapedWhitespace("a\\r\\nb")).toBe("a\nb");
  });

  test("leaves a body that already has a real newline untouched (guard)", () => {
    const healthy = "real\nbreak with a `\\n` code span";
    expect(repairOverEscapedWhitespace(healthy)).toBe(healthy);
  });

  test("is a no-op on empty or escape-free text", () => {
    expect(repairOverEscapedWhitespace("")).toBe("");
    expect(repairOverEscapedWhitespace("plain text")).toBe("plain text");
  });
});

describe("normalizeRuleLinkFragments", () => {
  test("lowercases an uppercase rule-link fragment, keeping the display text", () => {
    expect(normalizeRuleLinkFragments("[CHECK-BUG-002](https://x/SKILL.md#CHECK-BUG-002)")).toBe(
      "[CHECK-BUG-002](https://x/SKILL.md#check-bug-002)",
    );
  });

  test("lowercases a mixed-case fragment and every link in a merged form", () => {
    expect(normalizeRuleLinkFragments("[[CHECK-A-1](u#Check-A-1), [CHECK-B-2](u#CHECK-B-2)]")).toBe(
      "[[CHECK-A-1](u#check-a-1), [CHECK-B-2](u#check-b-2)]",
    );
  });

  test("leaves lowercase fragments, bare mentions, and non-rule URLs untouched", () => {
    const clean =
      "[CHECK-BUG-002](u#check-bug-002) plain CHECK-BUG-002 [file.ts:8](u/file.ts#L8) [§2.5](#25-rule-codes)";
    expect(normalizeRuleLinkFragments(clean)).toBe(clean);
  });
});

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

  test("repairs over-escaped reviewComment and inline body, but not suggestion", () => {
    const raw = JSON.stringify({
      verdict: "comment",
      reviewComment: "a\\nb",
      inlineComments: [{ path: "x.ts", line: 1, body: "c\\nd", suggestion: "e\\nf" }],
    });
    const out = parseStructuredOutput(raw);
    expect(out?.reviewComment).toBe("a\nb");
    expect(out?.inlineComments[0]?.body).toBe("c\nd");
    // A suggestion is committed verbatim, so its escapes are left untouched.
    expect(out?.inlineComments[0]?.suggestion).toBe("e\\nf");
  });

  test("lowercases uppercase rule-link fragments in reviewComment and inline body", () => {
    const raw = JSON.stringify({
      verdict: "comment",
      reviewComment: "bad [CHECK-BUG-002](u#CHECK-BUG-002)",
      inlineComments: [{ path: "x.ts", line: 1, body: "🚧 fix [CHECK-AI-002](u#CHECK-AI-002)" }],
    });
    const out = parseStructuredOutput(raw);
    expect(out?.reviewComment).toBe("bad [CHECK-BUG-002](u#check-bug-002)");
    expect(out?.inlineComments[0]?.body).toBe("🚧 fix [CHECK-AI-002](u#check-ai-002)");
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

  test("repairs over-escaped reply and updatedReviewComment, keeps null", () => {
    const withUpdate = parseReactionOutput(
      JSON.stringify({ reply: "a\\nb", updatedVerdict: "comment", updatedReviewComment: "c\\nd" })
    );
    expect(withUpdate?.reply).toBe("a\nb");
    expect(withUpdate?.updatedReviewComment).toBe("c\nd");

    const noUpdate = parseReactionOutput(JSON.stringify({ reply: "x\\ny" }));
    expect(noUpdate?.reply).toBe("x\ny");
    expect(noUpdate?.updatedReviewComment).toBeNull();
  });

  test("lowercases uppercase rule-link fragments in reply and updatedReviewComment", () => {
    const out = parseReactionOutput(
      JSON.stringify({
        reply: "see [CHECK-PR-009](u#CHECK-PR-009)",
        updatedVerdict: "approve",
        updatedReviewComment: "ok [CHECK-BUG-002](u#CHECK-BUG-002)",
      })
    );
    expect(out?.reply).toBe("see [CHECK-PR-009](u#check-pr-009)");
    expect(out?.updatedReviewComment).toBe("ok [CHECK-BUG-002](u#check-bug-002)");
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
