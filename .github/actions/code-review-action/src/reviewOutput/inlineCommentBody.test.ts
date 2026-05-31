/**
 * Tests for inlineCommentBody.ts — hunk lookup, body rendering (suggestion fence
 * + AI-agent prompt), and the Octokit `comments[]` payload shape.
 */
import { describe, expect, test } from "bun:test";

import {
  buildReviewComments,
  findHunkForLine,
  renderInlineCommentBody,
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
    expect(body).toContain("<comment>\n🚧 Bug here\n</comment>");
    expect(body).toContain("<file context>\n@@ -1,3 +1,4 @@");
    expect(body).toContain("src/a.ts, line 2");
    expect(body).not.toContain("```suggestion");
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
