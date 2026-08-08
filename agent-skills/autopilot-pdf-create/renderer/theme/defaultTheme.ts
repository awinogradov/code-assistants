import type { Theme } from "./themeInterface";

/**
 * The bundled default theme. It uses the standard PDF font families (Helvetica,
 * Times-Roman, Courier) so the skill renders a clean, professional document with
 * zero bundled font files and no font-resolution risk. A design.md overlays its
 * tokens onto this base, so a partial brand spec still yields a complete theme.
 */
export const defaultTheme: Theme = {
  name: "Default",
  version: "1.0",
  colors: {
    background: "#ffffff",
    surface: "#f5f7fa",
    text: "#1a1d23",
    muted: "#5b6470",
    primary: "#1d4ed8",
    onPrimary: "#ffffff",
    border: "#dfe3e8",
    accent: "#0ea5e9",
    info: "#2563eb",
    success: "#15803d",
    warning: "#b45309",
    danger: "#b91c1c",
    neutral: "#52606d",
  },
  text: {
    display: { fontFamily: "Helvetica", fontSize: 30, fontWeight: "bold", lineHeight: 1.15, color: "#1a1d23" },
    h1: { fontFamily: "Helvetica", fontSize: 21, fontWeight: "bold", lineHeight: 1.2, color: "#1a1d23" },
    h2: { fontFamily: "Helvetica", fontSize: 15.5, fontWeight: "bold", lineHeight: 1.25, color: "#1a1d23" },
    h3: { fontFamily: "Helvetica", fontSize: 12.5, fontWeight: "bold", lineHeight: 1.3, color: "#1a1d23" },
    body: { fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.5, color: "#1a1d23" },
    caption: { fontFamily: "Helvetica", fontSize: 8.5, lineHeight: 1.4, color: "#5b6470" },
    quote: { fontFamily: "Times-Roman", fontSize: 13.5, fontStyle: "italic", lineHeight: 1.4, color: "#1a1d23" },
    label: {
      fontFamily: "Helvetica",
      fontSize: 8,
      fontWeight: "bold",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      lineHeight: 1.2,
      color: "#5b6470",
    },
    mono: { fontFamily: "Courier", fontSize: 9.5, lineHeight: 1.45, color: "#1a1d23" },
  },
  spacing: { xs: 3, sm: 6, md: 12, lg: 20, xl: 32, gutter: 16, keepWithNext: 56 },
  rounded: { sm: 2, md: 4, lg: 8 },
  fonts: [],
  page: { size: "A4", margins: { top: 64, right: 56, bottom: 64, left: 56 } },
};
