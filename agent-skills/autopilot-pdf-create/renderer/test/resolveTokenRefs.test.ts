import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTokenRefs } from "../theme/resolveTokenRefs";

test("resolves a nested reference", () => {
  const out = resolveTokenRefs({
    colors: { brand: { primary: "#fff" }, primary: "{colors.brand.primary}" },
  });
  assert.equal((out.colors as Record<string, unknown>).primary, "#fff");
});

test("resolves an embedded reference", () => {
  const out = resolveTokenRefs({ x: "1", y: "v-{x}" });
  assert.equal(out.y, "v-1");
});

test("throws on an unknown reference", () => {
  assert.throws(() => resolveTokenRefs({ a: "{nope.missing}" }), /Unknown token reference/);
});

test("throws on a cyclic reference", () => {
  assert.throws(() => resolveTokenRefs({ a: "{b}", b: "{a}" }), /Cyclic token reference/);
});
