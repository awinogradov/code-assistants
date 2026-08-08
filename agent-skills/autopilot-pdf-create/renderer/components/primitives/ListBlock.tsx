import { Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Block } from "../../schemas/blockSchema";
import { useTheme } from "../../theme/themeContext";
import { InlineRuns } from "./InlineText";

type ListBlockData = Extract<Block, { type: "list" }>;

export function ListBlock({ block }: { block: ListBlockData }): ReactElement {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.sm }}>
      {block.items.map((item, index) => (
        <View key={index} style={{ flexDirection: "row", marginBottom: theme.spacing.xs }}>
          <Text style={{ ...theme.text.body, width: 18, color: theme.colors.muted }}>
            {block.ordered ? `${index + 1}.` : "•"}
          </Text>
          <Text style={{ ...theme.text.body, flex: 1 }}>
            <InlineRuns content={item} />
          </Text>
        </View>
      ))}
    </View>
  );
}
