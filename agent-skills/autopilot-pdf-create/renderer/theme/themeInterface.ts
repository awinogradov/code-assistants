/** Font weight as accepted by @react-pdf/renderer. */
export type FontWeight = number | "normal" | "bold";

export interface ThemeTextStyle {
  fontFamily: string;
  /** Size in points. */
  fontSize: number;
  fontWeight?: FontWeight;
  /** Unitless multiple of font size. */
  lineHeight?: number;
  /** Letter spacing in points. */
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  fontStyle?: "normal" | "italic";
  color?: string;
}

export interface ThemeFontSource {
  /** Absolute file path (bundled font) or, discouraged, a URL. */
  src: string;
  fontWeight?: FontWeight;
  fontStyle?: "normal" | "italic";
}

export interface ThemeFontFace {
  family: string;
  sources: ThemeFontSource[];
}

export interface ThemePalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  border: string;
  accent: string;
  info: string;
  success: string;
  warning: string;
  danger: string;
  neutral: string;
}

export interface ThemeTextStyles {
  display: ThemeTextStyle;
  h1: ThemeTextStyle;
  h2: ThemeTextStyle;
  h3: ThemeTextStyle;
  body: ThemeTextStyle;
  caption: ThemeTextStyle;
  quote: ThemeTextStyle;
  label: ThemeTextStyle;
  mono: ThemeTextStyle;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  gutter: number;
  /** Minimum points that must remain on the page after a heading (keep-with-next). */
  keepWithNext: number;
}

export interface ThemeRounded {
  sm: number;
  md: number;
  lg: number;
}

export interface ThemePageConfig {
  size: "A4" | "LETTER";
  margins: { top: number; right: number; bottom: number; left: number };
}

/** The fully resolved theme every component reads via context. */
export interface Theme {
  name: string;
  version: string;
  colors: ThemePalette;
  text: ThemeTextStyles;
  spacing: ThemeSpacing;
  rounded: ThemeRounded;
  /** Custom fonts to register; empty when using the standard PDF families. */
  fonts: ThemeFontFace[];
  page: ThemePageConfig;
}
