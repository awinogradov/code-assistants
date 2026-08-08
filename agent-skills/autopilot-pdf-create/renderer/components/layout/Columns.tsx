import { View } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

import { useTheme } from "../../theme/themeContext";

/** A horizontal row of equal-gutter columns. Children control their own widths (e.g. `flex: 1`). */
export function Columns({ children }: { children: ReactNode }): ReactElement {
  const theme = useTheme();
  return <View style={{ flexDirection: "row", gap: theme.spacing.gutter }}>{children}</View>;
}
