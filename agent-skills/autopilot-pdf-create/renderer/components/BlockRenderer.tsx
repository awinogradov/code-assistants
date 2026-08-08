import { View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Block } from "../schemas/blockSchema";
import { contentWidth } from "../theme/pageMetrics";
import { useTheme } from "../theme/themeContext";
import { Chart } from "./Chart";
import { Table } from "./Table";
import { Body } from "./primitives/Body";
import { Callout } from "./primitives/Callout";
import { Figure } from "./primitives/Figure";
import { Heading } from "./primitives/Heading";
import { ListBlock } from "./primitives/ListBlock";
import { PullQuote } from "./primitives/PullQuote";

/** Dispatch a content block to its component. The `never` default enforces exhaustiveness. */
export function BlockRenderer({ block }: { block: Block }): ReactElement | null {
  const theme = useTheme();
  const width = contentWidth(theme);
  switch (block.type) {
    case "heading":
      return (
        <Heading level={block.level} id={block.id}>
          {block.text}
        </Heading>
      );
    case "paragraph":
      return <Body content={block.content} />;
    case "list":
      return <ListBlock block={block} />;
    case "table":
      return <Table block={block} />;
    case "figure":
      return <Figure block={block} contentWidth={width} />;
    case "chart":
      return <Chart block={block} maxWidth={width} />;
    case "callout":
      return <Callout block={block} />;
    case "pullquote":
      return <PullQuote block={block} />;
    case "pagebreak":
      return <View break />;
    default: {
      const exhaustive: never = block;
      void exhaustive;
      return null;
    }
  }
}
