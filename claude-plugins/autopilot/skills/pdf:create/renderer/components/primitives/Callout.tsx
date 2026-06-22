import { Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Block } from "../../schemas/blockSchema";
import { useTheme } from "../../theme/themeContext";
import { InlineRuns } from "./InlineText";

type CalloutData = Extract<Block, { type: "callout" }>;

export function Callout({ block }: { block: CalloutData }): ReactElement {
  const theme = useTheme();
  const toneColor = theme.colors[block.tone];
  return (
    <View
      wrap={false}
      style={{
        marginVertical: theme.spacing.sm,
        padding: theme.spacing.md,
        paddingLeft: theme.spacing.md + 4,
        backgroundColor: theme.colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: toneColor,
        borderTopRightRadius: theme.rounded.md,
        borderBottomRightRadius: theme.rounded.md,
      }}
    >
      {block.title ? (
        <Text style={{ ...theme.text.h3, color: toneColor, marginBottom: theme.spacing.xs }}>
          {block.title}
        </Text>
      ) : null}
      <Text style={theme.text.body}>
        <InlineRuns content={block.content} />
      </Text>
    </View>
  );
}
