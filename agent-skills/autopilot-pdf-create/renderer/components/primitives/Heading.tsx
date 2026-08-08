import { Text } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { useTheme } from "../../theme/themeContext";

interface HeadingProps {
  level: 1 | 2 | 3;
  children: string;
  /** Link-target id for internal references. */
  id?: string;
}

/**
 * A heading that stays attached to the content beneath it via `minPresenceAhead`
 * (rather than `wrap={false}`, which throws on blocks taller than a page).
 */
export function Heading({ level, children, id }: HeadingProps): ReactElement {
  const theme = useTheme();
  const style = { 1: theme.text.h1, 2: theme.text.h2, 3: theme.text.h3 }[level];
  const marginTop = level === 1 ? theme.spacing.lg : theme.spacing.md;
  return (
    <Text
      id={id}
      minPresenceAhead={theme.spacing.keepWithNext}
      style={{ ...style, marginTop, marginBottom: theme.spacing.sm }}
    >
      {children}
    </Text>
  );
}
