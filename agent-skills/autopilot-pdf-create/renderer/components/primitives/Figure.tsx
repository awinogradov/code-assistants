import { Image, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Block } from "../../schemas/blockSchema";
import { useTheme } from "../../theme/themeContext";
import { Caption } from "./Caption";

type FigureData = Extract<Block, { type: "figure" }>;

export function Figure({
  block,
  contentWidth,
}: {
  block: FigureData;
  contentWidth: number;
}): ReactElement {
  const theme = useTheme();
  const width = Math.round(contentWidth * block.widthPct);
  return (
    <View style={{ marginVertical: theme.spacing.md, alignItems: "center" }}>
      <Image src={block.src} style={{ width }} />
      {block.caption ? <Caption>{block.caption}</Caption> : null}
    </View>
  );
}
