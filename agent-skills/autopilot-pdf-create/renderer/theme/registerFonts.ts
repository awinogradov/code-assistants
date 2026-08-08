import { Font } from "@react-pdf/renderer";

import type { Theme } from "./themeInterface";

/**
 * Register the theme's custom fonts with @react-pdf/renderer. Standard families
 * need no registration. Call `assertFontsResolve` first so this never registers
 * a missing or variable font (which would hang rendering).
 */
export function registerFonts(theme: Theme): void {
  for (const face of theme.fonts) {
    Font.register({
      family: face.family,
      fonts: face.sources.map((source) => ({
        src: source.src,
        fontWeight: source.fontWeight,
        fontStyle: source.fontStyle,
      })),
    });
  }

  // Disable hyphenation for cleaner business typography (react-pdf otherwise
  // splits words with the Knuth-Plass algorithm).
  Font.registerHyphenationCallback((word) => [word]);
}
