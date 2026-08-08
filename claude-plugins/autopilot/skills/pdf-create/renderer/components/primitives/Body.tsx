import { Text } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { RichText } from "../../schemas/blockSchema";
import { useTheme } from "../../theme/themeContext";
import { InlineRuns } from "./InlineText";

export function Body({ content }: { content: RichText }): ReactElement {
  const theme = useTheme();
  return (
    <Text style={{ ...theme.text.body, marginBottom: theme.spacing.sm }} orphans={2} widows={2}>
      <InlineRuns content={content} />
    </Text>
  );
}
