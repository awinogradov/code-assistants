import assert from "node:assert/strict";
import { test } from "node:test";

import { assertFontsResolve } from "../theme/assertFontsResolve";
import { defaultTheme } from "../theme/defaultTheme";
import type { Theme } from "../theme/themeInterface";

function withBodyFamily(family: string, fonts: Theme["fonts"] = []): Theme {
  return {
    ...defaultTheme,
    text: { ...defaultTheme.text, body: { ...defaultTheme.text.body, fontFamily: family } },
    fonts,
  };
}

test("passes for the default standard-font theme", () => {
  assert.doesNotThrow(() => assertFontsResolve(defaultTheme));
});

test("throws when a used family is neither standard nor registered", () => {
  assert.throws(() => assertFontsResolve(withBodyFamily("GhostFont")), /GhostFont/);
});

test("throws on a remote font source", () => {
  const theme = withBodyFamily("Web", [{ family: "Web", sources: [{ src: "http://x/font.ttf" }] }]);
  assert.throws(() => assertFontsResolve(theme), /remote/);
});

test("throws on a variable-font file", () => {
  const theme = withBodyFamily("Var", [
    { family: "Var", sources: [{ src: "/fonts/Inter-VariableFont_wght.ttf" }] },
  ]);
  assert.throws(() => assertFontsResolve(theme), /variable font/);
});
