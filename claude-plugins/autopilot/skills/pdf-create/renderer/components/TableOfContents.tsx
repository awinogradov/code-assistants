import { Link, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { TocEntry } from "../render/collectTocEntries";
import type { PageNumberStore } from "../render/pageNumberStore";
import { useTheme } from "../theme/themeContext";

/**
 * A table of contents. Each row links to its section anchor; the page number is
 * read from the store (populated during the layout pass, finalized on the
 * second pass), and a PDF bookmark gives a navigable sidebar outline.
 */
export function TableOfContents({
  entries,
  store,
}: {
  entries: TocEntry[];
  store: PageNumberStore;
}): ReactElement {
  const theme = useTheme();
  return (
    <View bookmark={{ title: "Contents" }} style={{ marginBottom: theme.spacing.lg }}>
      <Text style={{ ...theme.text.h1, marginBottom: theme.spacing.md }}>Contents</Text>
      {entries.map((entry) => (
        <View
          key={entry.id}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: theme.spacing.xs,
            marginLeft: entry.level === 2 ? theme.spacing.md : 0,
          }}
        >
          <Link src={`#${entry.id}`} style={{ textDecoration: "none", flex: 1, paddingRight: theme.spacing.sm }}>
            <Text
              style={{
                ...theme.text.body,
                color: entry.level === 2 ? theme.colors.muted : theme.colors.text,
              }}
            >
              {entry.title}
            </Text>
          </Link>
          <Text style={{ ...theme.text.body, color: theme.colors.muted }} render={() => String(store.get(entry.id) ?? "")} />
        </View>
      ))}
    </View>
  );
}
