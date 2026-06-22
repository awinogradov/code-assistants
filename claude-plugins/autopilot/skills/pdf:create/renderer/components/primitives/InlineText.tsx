import { Link, Text } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { RichText } from "../../schemas/blockSchema";
import { useTheme } from "../../theme/themeContext";

/**
 * Render rich text as inline runs. Returns a fragment of nested <Text>/<Link>
 * elements meant to sit inside a styled parent <Text>, so emphasis and links
 * flow inline rather than stacking as blocks.
 */
export function InlineRuns({ content }: { content: RichText }): ReactElement {
  const theme = useTheme();
  return (
    <>
      {content.map((mark, index) => {
        const isLink = Boolean(mark.href || mark.anchor);
        const style = {
          fontFamily: mark.code ? theme.text.mono.fontFamily : undefined,
          fontWeight: mark.bold ? ("bold" as const) : undefined,
          fontStyle: mark.italic ? ("italic" as const) : undefined,
          color: isLink ? theme.colors.primary : undefined,
          textDecoration: isLink ? ("underline" as const) : undefined,
        };
        if (mark.href) {
          return (
            <Link key={index} src={mark.href} style={style}>
              {mark.text}
            </Link>
          );
        }
        if (mark.anchor) {
          return (
            <Link key={index} src={`#${mark.anchor}`} style={style}>
              {mark.text}
            </Link>
          );
        }
        return (
          <Text key={index} style={style}>
            {mark.text}
          </Text>
        );
      })}
    </>
  );
}
