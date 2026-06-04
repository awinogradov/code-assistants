/**
 * Tests for inlineCommentBody.ts — hunk lookup, body rendering (suggestion fence
 * + AI-agent prompt), and the Octokit `comments[]` payload shape.
 */
import { describe, expect, test } from "bun:test";

import {
  boundHunkToLine,
  buildReviewComments,
  findHunkForLine,
  renderInlineCommentBody,
  stripReviewChrome,
} from "./inlineCommentBody.ts";

const patch = [
  "@@ -1,3 +1,4 @@",
  " context1",
  "+added2",
  " context3",
  "+added4",
  "@@ -20,2 +21,3 @@",
  " ctx21",
  "+add22",
  " ctx23",
].join("\n");

describe("findHunkForLine", () => {
  test("returns the hunk whose new-file range covers the line", () => {
    const hunk = findHunkForLine(patch, 2);
    expect(hunk).toContain("@@ -1,3 +1,4 @@");
    expect(hunk).toContain("+added2");
    expect(hunk).not.toContain("@@ -20,2 +21,3 @@");
  });

  test("selects the second hunk for a line in its range", () => {
    const hunk = findHunkForLine(patch, 22);
    expect(hunk?.startsWith("@@ -20,2 +21,3 @@")).toBe(true);
    expect(hunk).toContain("+add22");
  });

  test("returns undefined when no hunk covers the line", () => {
    expect(findHunkForLine(patch, 100)).toBeUndefined();
  });
});

describe("renderInlineCommentBody", () => {
  const hunk = "@@ -1,3 +1,4 @@\n context1\n+added2";

  test("embeds the finding and the diff hunk in the AI-agent prompt", () => {
    const body = renderInlineCommentBody({
      comment: { path: "src/a.ts", line: 2, body: "🚧 Bug here" },
      hunk,
    });
    expect(body).toContain("🚧 Bug here");
    expect(body).toContain("<summary>Prompt for AI agents</summary>");
    expect(body).toContain("<comment>\nBug here\n</comment>");
    expect(body).toContain("<file context>\n@@ -1,3 +1,4 @@");
    expect(body).toContain("src/a.ts, line 2");
    expect(body).not.toContain("```suggestion");
  });

  test("strips severity emoji and rule link from the embedded prompt copy only", () => {
    const body = renderInlineCommentBody({
      comment: {
        path: "src/a.ts",
        line: 2,
        body: "🚧 Off-by-one [CHECK-BUG-003](https://x#CHECK-BUG-003)",
      },
      hunk,
    });
    // Human-facing finding stays verbatim...
    expect(body).toContain("🚧 Off-by-one [CHECK-BUG-003](https://x#CHECK-BUG-003)");
    // ...while the embedded prompt copy is chrome-free.
    expect(body).toContain("<comment>\nOff-by-one\n</comment>");
  });

  test("renders a suggestion fence with the replacement verbatim (indentation preserved)", () => {
    const body = renderInlineCommentBody({
      comment: { path: "src/a.ts", line: 2, body: "fix", suggestion: "  const fixed = 1;" },
      hunk,
    });
    expect(body).toContain("```suggestion\n  const fixed = 1;\n```");
  });

  test("describes a multi-line range in the prompt", () => {
    const body = renderInlineCommentBody({
      comment: { path: "src/a.ts", line: 4, startLine: 2, body: "fix" },
      hunk,
    });
    expect(body).toContain("src/a.ts, lines 2 to 4");
  });

  test("omits the file-context block when no hunk is available", () => {
    const body = renderInlineCommentBody({
      comment: { path: "src/a.ts", line: 2, body: "fix" },
      hunk: undefined,
    });
    expect(body).not.toContain("<file context>");
  });
});

describe("buildReviewComments", () => {
  const prFiles = [{ filename: "src/a.ts", patch }];

  test("builds a single-line payload with side RIGHT and no start_line", () => {
    const [comment] = buildReviewComments(
      [{ path: "src/a.ts", line: 2, body: "b", suggestion: "  fix()" }],
      prFiles,
    );
    expect(comment?.path).toBe("src/a.ts");
    expect(comment?.line).toBe(2);
    expect(comment?.side).toBe("RIGHT");
    expect(comment?.start_line).toBeUndefined();
    expect(comment?.body).toContain("```suggestion\n  fix()\n```");
    expect(comment?.body).toContain("<file context>\n@@ -1,3 +1,4 @@");
  });

  test("adds start_line and start_side for a multi-line range", () => {
    const [comment] = buildReviewComments(
      [{ path: "src/a.ts", line: 4, startLine: 2, body: "b" }],
      prFiles,
    );
    expect(comment?.line).toBe(4);
    expect(comment?.start_line).toBe(2);
    expect(comment?.start_side).toBe("RIGHT");
  });

  test("renders without file context when the file has no patch", () => {
    const [comment] = buildReviewComments(
      [{ path: "src/a.ts", line: 2, body: "b" }],
      [{ filename: "src/a.ts" }],
    );
    expect(comment?.body).not.toContain("<file context>");
  });
});

describe("boundHunkToLine", () => {
  // A 30-new-line hunk (lines 1..30), all added, plus the header.
  const bigHunk = [
    "@@ -0,0 +1,30 @@",
    ...Array.from({ length: 30 }, (_, i) => `+line${i + 1}`),
  ].join("\n");

  test("narrows a large hunk to a window centered on the finding", () => {
    const bounded = boundHunkToLine(bigHunk, 15);
    const bodyLines = bounded.split("\n").slice(1); // drop the kept @@ header
    // radius 6 each side → at most 2*6+1 = 13 body lines.
    expect(bodyLines.length).toBeLessThanOrEqual(13);
    expect(bounded).toContain("+line15");
    expect(bounded).toContain("@@ -0,0 +1,30 @@"); // header kept verbatim
    expect(bounded).not.toContain("+line1\n"); // far line dropped
    expect(bounded).not.toContain("+line30");
  });

  test("includes a line exactly at the radius bound and excludes one past it", () => {
    const bounded = boundHunkToLine(bigHunk, 15);
    expect(bounded).toContain("+line9"); // 15 - 6, inclusive
    expect(bounded).toContain("+line21"); // 15 + 6, inclusive
    expect(bounded).not.toContain("+line8"); // 15 - 7, excluded
    expect(bounded).not.toContain("+line22"); // 15 + 7, excluded
  });

  test("keeps removed lines that fall inside the window", () => {
    const hunk = ["@@ -1,3 +1,3 @@", " ctx1", "-old2", "+new2", " ctx3"].join("\n");
    expect(boundHunkToLine(hunk, 2)).toContain("-old2");
  });

  test("passes a hunk smaller than the window through unchanged", () => {
    const small = "@@ -1,3 +1,4 @@\n context1\n+added2";
    expect(boundHunkToLine(small, 2)).toBe(small);
  });

  test("passes a hunk with an unparseable header through unchanged", () => {
    const malformed = "no header here\n+added";
    expect(boundHunkToLine(malformed, 2)).toBe(malformed);
  });
});

describe("stripReviewChrome", () => {
  test("strips a leading severity emoji and a trailing single rule link", () => {
    expect(stripReviewChrome("🚧 Off-by-one [CHECK-BUG-003](https://x#CHECK-BUG-003)")).toBe(
      "Off-by-one",
    );
  });

  test("strips a trailing merged rule link", () => {
    expect(stripReviewChrome("🙋‍♂️ foo [[CHECK-A-1](u), [CHECK-B-2](u)]")).toBe("foo");
  });

  test("leaves a body with no chrome unchanged", () => {
    expect(stripReviewChrome("plain finding text")).toBe("plain finding text");
  });

  test("preserves a mid-sentence rule reference and inline emoji", () => {
    expect(stripReviewChrome("mirror the guard in [CHECK-PR-001](u) before the 💡 branch")).toBe(
      "mirror the guard in [CHECK-PR-001](u) before the 💡 branch",
    );
  });

  test("fully removes the 🙋‍♂️ ZWJ sequence", () => {
    // 🙋 + ZWJ (U+200D) + ♂ (U+2642) + VS16 (U+FE0F)
    const suggestion = "\u{1F64B}\u{200D}\u{2642}\u{FE0F} tidy this up";
    const stripped = stripReviewChrome(suggestion);
    expect(stripped).toBe("tidy this up");
    expect(stripped).not.toContain("‍");
    expect(stripped).not.toContain("️");
  });
});
