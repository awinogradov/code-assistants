import { Page, Text, View } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

import type { Metadata } from "../../schemas/contentSchema";
import { useTheme } from "../../theme/themeContext";

/**
 * The standard content page: margins, a fixed running header (org/title and
 * optional confidentiality) and a fixed footer with the document title and
 * `page / total` numbers that repeat on every page.
 */
export function PageShell({
  children,
  metadata,
}: {
  children: ReactNode;
  metadata: Metadata;
}): ReactElement {
  const theme = useTheme();
  const { margins } = theme.page;
  return (
    <Page
      size={theme.page.size}
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.text.body.fontFamily,
        fontSize: theme.text.body.fontSize,
        paddingTop: margins.top,
        paddingBottom: margins.bottom,
        paddingLeft: margins.left,
        paddingRight: margins.right,
      }}
    >
      <View
        fixed
        style={{
          position: "absolute",
          top: 28,
          left: margins.left,
          right: margins.right,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ ...theme.text.label, color: theme.colors.muted }}>
          {metadata.org ?? metadata.title}
        </Text>
        {metadata.confidentiality ? (
          <Text style={{ ...theme.text.label, color: theme.colors.muted }}>{metadata.confidentiality}</Text>
        ) : null}
      </View>

      <View>{children}</View>

      <View
        fixed
        style={{
          position: "absolute",
          bottom: 28,
          left: margins.left,
          right: margins.right,
          flexDirection: "row",
          justifyContent: "space-between",
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.border,
          paddingTop: 4,
        }}
      >
        <Text style={theme.text.caption}>{metadata.title}</Text>
        <Text
          style={theme.text.caption}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </Page>
  );
}
