/**
 * Tests for markedDetailsBlock.ts.
 * Covers marker placement, the blank line after `<br />` that lets markdown
 * render inside `<details>`, and body-line ordering.
 */
import { describe, expect, test } from "bun:test";

import { buildMarkedDetailsBlock } from "./markedDetailsBlock.ts";

describe("buildMarkedDetailsBlock", () => {
  test("bounds the block with the markers and a horizontal rule", () => {
    const block = buildMarkedDetailsBlock({
      startMarker: "<!-- start -->",
      endMarker: "<!-- end -->",
      summary: "Title 🤖",
      bodyLines: ["body"],
    });

    expect(block.startsWith("<!-- start -->\n---\n")).toBe(true);
    expect(block.endsWith("</details>\n<!-- end -->")).toBe(true);
    expect(block).toContain("<summary>Title 🤖</summary>");
  });

  test("keeps a blank line after <br /> so markdown renders inside <details>", () => {
    const block = buildMarkedDetailsBlock({
      startMarker: "<!-- start -->",
      endMarker: "<!-- end -->",
      summary: "Title",
      bodyLines: ["| Metric | Value |"],
    });

    expect(block).toContain("<br />\n\n| Metric | Value |\n\n</details>");
  });

  test("renders body lines in order", () => {
    const block = buildMarkedDetailsBlock({
      startMarker: "<!-- start -->",
      endMarker: "<!-- end -->",
      summary: "Title",
      bodyLines: ["one", "two", "three"],
    });

    expect(block).toContain("one\ntwo\nthree");
  });
});
