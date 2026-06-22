import { Text } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { useTheme } from "../../theme/themeContext";

export function Caption({ children }: { children: string }): ReactElement {
  const theme = useTheme();
  return <Text style={{ ...theme.text.caption, marginTop: theme.spacing.xs }}>{children}</Text>;
}
