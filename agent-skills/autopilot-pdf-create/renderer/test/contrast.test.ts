import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastRatio } from "../theme/contrast";

test("white on black is near-maximal contrast", () => {
  const ratio = contrastRatio("#ffffff", "#000000");
  assert.ok(ratio !== null && ratio > 20);
});

test("returns null for an unparseable color", () => {
  assert.equal(contrastRatio("not-a-color", "#000000"), null);
});

test("flags low contrast below the AA threshold", () => {
  const ratio = contrastRatio("#cccccc", "#ffffff");
  assert.ok(ratio !== null && ratio < 4.5);
});
