import assert from "node:assert/strict";
import { test } from "node:test";

import type { DesignMdTokens } from "../theme/designMdSchema";
import { defaultTheme } from "../theme/defaultTheme";
import { fontsDir } from "../lib/paths";
import { makeTheme } from "../theme/makeTheme";

const tokens = (value: unknown): DesignMdTokens => value as DesignMdTokens;

test("converts 1rem to 12pt", () => {
  const theme = makeTheme(tokens({ typography: { body: { fontSize: "1rem" } } }), { fontsDir });
  assert.equal(theme.text.body.fontSize, 12);
});

test("overlays colors onto the default palette", () => {
  const theme = makeTheme(tokens({ colors: { primary: "#123456" } }), { fontsDir });
  assert.equal(theme.colors.primary, "#123456");
  assert.equal(theme.colors.background, defaultTheme.colors.background);
});

test("maps a leaf color name from a nested tree", () => {
  const theme = makeTheme(tokens({ colors: { brand: { primary: "#abcdef" } } }), { fontsDir });
  assert.equal(theme.colors.primary, "#abcdef");
});

test("empty tokens reproduce the default theme typography", () => {
  const theme = makeTheme(tokens({}), { fontsDir });
  assert.equal(theme.text.body.fontFamily, defaultTheme.text.body.fontFamily);
  assert.equal(theme.text.h1.fontSize, defaultTheme.text.h1.fontSize);
});

test("resolves custom font file paths against the fonts dir", () => {
  const theme = makeTheme(tokens({ fonts: [{ family: "Inter", weights: { "400": "Inter-Regular.ttf" } }] }), {
    fontsDir,
  });
  assert.equal(theme.fonts.length, 1);
  assert.ok(theme.fonts[0].sources[0].src.endsWith("Inter-Regular.ttf"));
  assert.ok(theme.fonts[0].sources[0].src.startsWith("/"));
});
