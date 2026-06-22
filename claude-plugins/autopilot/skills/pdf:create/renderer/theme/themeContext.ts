import { createContext, useContext } from "react";

import { defaultTheme } from "./defaultTheme";
import type { Theme } from "./themeInterface";

/** Carries the resolved theme to every component; defaults to the bundled theme. */
export const ThemeContext = createContext<Theme>(defaultTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
