import { Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Block } from "../../schemas/blockSchema";
import { useTheme } from "../../theme/themeContext";

type PullQuoteData = Extract<Block, { type: "pullquote" }>;

export function PullQuote({ block }: { block: PullQuoteData }): ReactElement {
  const theme = useTheme();
  return (
    <View
      wrap={false}
      style={{
        marginVertical: theme.spacing.md,
        paddingLeft: theme.spacing.md,
        borderLeftWidth: 2,
        borderLeftColor: theme.colors.primary,
      }}
    >
      <Text style={theme.text.quote}>{block.text}</Text>
      {block.attribution ? (
        <Text style={{ ...theme.text.caption, marginTop: theme.spacing.xs }}>
          — {block.attribution}
        </Text>
      ) : null}
    </View>
  );
}
