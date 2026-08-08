import { Page, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Cover, Metadata } from "../schemas/contentSchema";
import { useTheme } from "../theme/themeContext";

export function CoverPage({ cover, metadata }: { cover?: Cover; metadata: Metadata }): ReactElement {
  const theme = useTheme();
  const title = cover?.title ?? metadata.title;
  const subtitle = cover?.subtitle ?? metadata.subtitle;
  return (
    <Page size={theme.page.size} bookmark={{ title: "Cover" }} style={{ backgroundColor: theme.colors.background }}>
      <View
        style={{
          backgroundColor: theme.colors.primary,
          paddingHorizontal: 56,
          paddingVertical: 64,
          minHeight: 300,
          justifyContent: "flex-end",
        }}
      >
        {cover?.eyebrow ? (
          <Text style={{ ...theme.text.label, color: theme.colors.onPrimary, marginBottom: theme.spacing.sm }}>
            {cover.eyebrow}
          </Text>
        ) : null}
        <Text style={{ ...theme.text.display, color: theme.colors.onPrimary }}>{title}</Text>
      </View>
      <View style={{ paddingHorizontal: 56, paddingTop: 32 }}>
        {subtitle ? (
          <Text style={{ ...theme.text.h2, fontWeight: "normal", color: theme.colors.muted }}>{subtitle}</Text>
        ) : null}
        <View style={{ marginTop: 24 }}>
          {metadata.authors.length > 0 ? (
            <Text style={{ ...theme.text.body, marginBottom: 2 }}>{metadata.authors.join(", ")}</Text>
          ) : null}
          {metadata.org ? <Text style={theme.text.caption}>{metadata.org}</Text> : null}
          {metadata.date ? <Text style={theme.text.caption}>{metadata.date}</Text> : null}
        </View>
      </View>
      {cover?.footnote ? (
        <View style={{ position: "absolute", bottom: 40, left: 56, right: 56 }}>
          <Text style={theme.text.caption}>{cover.footnote}</Text>
        </View>
      ) : null}
    </Page>
  );
}
