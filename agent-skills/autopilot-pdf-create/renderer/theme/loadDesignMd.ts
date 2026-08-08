import { readFileSync } from "node:fs";

import matter from "gray-matter";
import { ZodError } from "zod";

import { fontsDir } from "../lib/paths";
import { themeError } from "../render/errors";
import { designMdSchema } from "./designMdSchema";
import { defaultTheme } from "./defaultTheme";
import { makeTheme } from "./makeTheme";
import { resolveTokenRefs } from "./resolveTokenRefs";
import type { Theme } from "./themeInterface";

/** Parse a design.md file into a theme; throws a themed (exit 4) error on any problem. */
export function loadDesignMd(path: string): Theme {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw themeError(`Could not read design.md at ${path}`);
  }

  let frontMatter: Record<string, unknown>;
  try {
    frontMatter = matter(raw).data as Record<string, unknown>;
  } catch (error) {
    throw themeError(`Invalid YAML front-matter in ${path}: ${(error as Error).message}`);
  }

  let theme: Theme;
  try {
    const resolved = resolveTokenRefs(frontMatter);
    const tokens = designMdSchema.parse(resolved);
    theme = makeTheme(tokens, { fontsDir });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors
        .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw themeError(`design.md token validation failed in ${path}:\n${issues}`);
    }
    throw themeError(`Could not build theme from ${path}: ${(error as Error).message}`);
  }

  return theme;
}

/** Resolve a theme from an optional design.md path, falling back to the bundled default. */
export function resolveTheme(designPath?: string): Theme {
  return designPath ? loadDesignMd(designPath) : defaultTheme;
}
