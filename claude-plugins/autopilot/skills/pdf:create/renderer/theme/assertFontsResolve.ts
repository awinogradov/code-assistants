import { existsSync } from "node:fs";

import { fontResolutionError } from "../render/errors";
import type { Theme } from "./themeInterface";

/** Standard PDF font families that need no registration. */
export const standardFamilies = new Set(["Helvetica", "Times-Roman", "Courier"]);

/**
 * Verify every font the theme uses can actually be rendered, BEFORE any
 * `Font.register` call. @react-pdf/renderer hangs silently on a missing or
 * variable font, so this turns those into a loud, named failure instead.
 */
export function assertFontsResolve(theme: Theme): void {
  const problems: string[] = [];
  const registered = new Set(theme.fonts.map((face) => face.family));

  const usedFamilies = new Set(Object.values(theme.text).map((style) => style.fontFamily));
  for (const family of usedFamilies) {
    if (standardFamilies.has(family) || registered.has(family)) continue;
    problems.push(
      `Font family "${family}" is used but is neither a standard PDF family ` +
        `(${[...standardFamilies].join(", ")}) nor registered. Add it to the design.md "fonts" ` +
        `mapping with a static-weight file in assets/fonts/, or use a standard family.`,
    );
  }

  for (const face of theme.fonts) {
    for (const source of face.sources) {
      const { src } = source;
      if (/^https?:\/\//i.test(src)) {
        problems.push(
          `Font "${face.family}" uses a remote src (${src}); bundle the file under assets/fonts/ ` +
            `so rendering is offline and deterministic.`,
        );
        continue;
      }
      if (!/\.(ttf|woff)$/i.test(src)) {
        problems.push(`Font "${face.family}" must be a .ttf or .woff file: ${src}`);
      }
      if (/variablefont|\[wght\]|-vf\b/i.test(src)) {
        problems.push(
          `Font "${face.family}" looks like a variable font (${src}); the PDF format needs ` +
            `static weights — provide separate files per weight.`,
        );
      }
      if (!existsSync(src)) {
        problems.push(`Font file not found for "${face.family}": ${src}`);
      }
    }
  }

  if (problems.length > 0) throw fontResolutionError(problems.join("\n"));
}
