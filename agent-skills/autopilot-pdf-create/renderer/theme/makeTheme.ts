import { isAbsolute, join } from "node:path";

import type { DesignMdTokens, TypographyToken } from "./designMdSchema";
import { defaultTheme } from "./defaultTheme";
import { cssLengthToPt } from "./unitToPt";
import type {
  FontWeight,
  Theme,
  ThemeFontFace,
  ThemePalette,
  ThemeTextStyle,
  ThemeTextStyles,
} from "./themeInterface";

export interface MakeThemeOptions {
  /** Directory bundled font files are resolved against. */
  fontsDir: string;
}

/**
 * Build a complete theme by overlaying resolved design.md tokens onto the
 * default theme. Anything the design.md omits keeps its default, so a partial
 * brand spec still produces a full, valid theme.
 */
export function makeTheme(tokens: DesignMdTokens, options: MakeThemeOptions): Theme {
  const colors = flattenColors(tokens.colors);
  return {
    name: tokens.name ?? defaultTheme.name,
    version: tokens.version ?? defaultTheme.version,
    colors: mapPalette(colors),
    text: mapTypography(tokens.typography),
    spacing: mapScale(tokens.spacing, defaultTheme.spacing),
    rounded: mapScale(tokens.rounded, defaultTheme.rounded),
    fonts: mapFonts(tokens.fonts, options.fontsDir),
    page: defaultTheme.page,
  };
}

/** Flatten a (possibly nested) color tree to a lookup keyed by dot-path and by leaf name (lowercased). */
function flattenColors(input: DesignMdTokens["colors"]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (value: unknown, path: string[]): void => {
    if (typeof value === "string") {
      out[path.join(".").toLowerCase()] = value;
      const leaf = path[path.length - 1].toLowerCase();
      if (!(leaf in out)) out[leaf] = value;
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
    }
  };
  if (input) walk(input, []);
  return out;
}

function firstColor(colors: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    const value = colors[name.toLowerCase()];
    if (value) return value;
  }
  return undefined;
}

function mapPalette(colors: Record<string, string>): ThemePalette {
  const base = defaultTheme.colors;
  const pick = (slot: keyof ThemePalette, ...alts: string[]): string =>
    firstColor(colors, [slot, ...alts]) ?? base[slot];
  return {
    background: pick("background", "bg", "base", "canvas"),
    surface: pick("surface", "card", "panel"),
    text: pick("text", "foreground", "fg", "ink", "primary.text"),
    muted: pick("muted", "secondary", "subtle", "text.secondary"),
    primary: pick("primary", "brand", "brand.primary", "accent.primary"),
    onPrimary: pick("onPrimary", "on-primary", "onprimary", "primary.foreground"),
    border: pick("border", "outline", "divider"),
    accent: pick("accent", "brand.secondary"),
    info: pick("info", "blue"),
    success: pick("success", "green", "positive"),
    warning: pick("warning", "amber", "yellow", "caution"),
    danger: pick("danger", "red", "error", "negative", "destructive"),
    neutral: pick("neutral", "gray", "grey"),
  };
}

function normalizeWeight(weight: string | number | undefined): FontWeight | undefined {
  if (weight === undefined) return undefined;
  const numeric = Number(weight);
  if (Number.isFinite(numeric)) return numeric;
  return weight === "bold" ? "bold" : "normal";
}

function mergeTextStyle(base: ThemeTextStyle, token: TypographyToken): ThemeTextStyle {
  const lineHeight = token.lineHeight === undefined ? base.lineHeight : Number(token.lineHeight);
  return {
    fontFamily: token.fontFamily ?? base.fontFamily,
    fontSize: token.fontSize === undefined ? base.fontSize : cssLengthToPt(token.fontSize),
    fontWeight: normalizeWeight(token.fontWeight) ?? base.fontWeight,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : base.lineHeight,
    letterSpacing:
      token.letterSpacing === undefined ? base.letterSpacing : cssLengthToPt(token.letterSpacing),
    textTransform: (token.textTransform as ThemeTextStyle["textTransform"]) ?? base.textTransform,
    fontStyle: (token.fontStyle as ThemeTextStyle["fontStyle"]) ?? base.fontStyle,
    color: token.color ?? base.color,
  };
}

function firstToken(
  typography: DesignMdTokens["typography"],
  names: string[],
): TypographyToken | undefined {
  if (!typography) return undefined;
  const lower = new Map(Object.entries(typography).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    const value = lower.get(name.toLowerCase());
    if (value) return value;
  }
  return undefined;
}

function mapTypography(typography: DesignMdTokens["typography"]): ThemeTextStyles {
  const base = defaultTheme.text;
  const slot = (key: keyof ThemeTextStyles, ...alts: string[]): ThemeTextStyle => {
    const token = firstToken(typography, [key, ...alts]);
    return token ? mergeTextStyle(base[key], token) : base[key];
  };
  return {
    display: slot("display", "hero", "title"),
    h1: slot("h1", "heading1", "heading", "title"),
    h2: slot("h2", "heading2", "subtitle"),
    h3: slot("h3", "heading3"),
    body: slot("body", "paragraph", "text", "base"),
    caption: slot("caption", "small", "footnote"),
    quote: slot("quote", "blockquote"),
    label: slot("label", "eyebrow", "overline"),
    mono: slot("mono", "code"),
  };
}

function mapScale<T extends Record<string, number>>(
  scale: Record<string, string | number> | undefined,
  base: T,
): T {
  if (!scale) return base;
  const out = { ...base };
  for (const key of Object.keys(base) as (keyof T)[]) {
    const value = scale[key as string];
    if (value === undefined) continue;
    try {
      out[key] = cssLengthToPt(value) as T[keyof T];
    } catch {
      // Keep the default when a token value cannot be parsed as a length.
    }
  }
  return out;
}

function mapFonts(
  fonts: DesignMdTokens["fonts"],
  fontsDir: string,
): ThemeFontFace[] {
  if (!fonts) return [];
  const resolve = (file: string): string => (isAbsolute(file) ? file : join(fontsDir, file));
  return fonts.map((face) => {
    const sources = [
      ...Object.entries(face.weights ?? {}).map(([weight, file]) => ({
        src: resolve(file),
        fontWeight: normalizeWeight(weight),
      })),
      ...Object.entries(face.italics ?? {}).map(([weight, file]) => ({
        src: resolve(file),
        fontWeight: normalizeWeight(weight),
        fontStyle: "italic" as const,
      })),
    ];
    return { family: face.family, sources };
  });
}
