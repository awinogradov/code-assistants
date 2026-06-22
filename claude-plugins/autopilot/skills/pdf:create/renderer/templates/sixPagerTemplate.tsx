import { Document, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { TableOfContents } from "../components/TableOfContents";
import { PageShell } from "../components/layout/PageShell";
import { Section } from "../components/layout/Section";
import { Heading } from "../components/primitives/Heading";
import { collectTocEntries } from "../render/collectTocEntries";
import { useTheme } from "../theme/themeContext";
import type { TemplateProps } from "./templateProps";

/**
 * Amazon-style six-pager: a memo header (no cover page), six numbered narrative
 * sections, and an unlimited appendix for tables and charts.
 */
export function sixPagerTemplate({ content, store }: TemplateProps): ReactElement {
  const theme = useTheme();
  const meta = content.metadata;
  const entries = collectTocEntries(content);
  const byline = [meta.org, meta.date, meta.authors.join(", ")].filter(Boolean).join("  ·  ");
  return (
    <Document title={meta.title} author={meta.authors.join(", ")}>
      <PageShell metadata={meta}>
        <View
          style={{
            borderBottomWidth: 2,
            borderBottomColor: theme.colors.primary,
            paddingBottom: theme.spacing.sm,
            marginBottom: theme.spacing.md,
          }}
        >
          <Text style={theme.text.h1}>{meta.title}</Text>
          {meta.subtitle ? (
            <Text style={{ ...theme.text.body, color: theme.colors.muted, marginTop: 2 }}>
              {meta.subtitle}
            </Text>
          ) : null}
          {byline ? (
            <Text style={{ ...theme.text.caption, marginTop: theme.spacing.xs }}>{byline}</Text>
          ) : null}
        </View>
        {content.toc ? <TableOfContents entries={entries} store={store} /> : null}
        {content.sections.map((section, index) => (
          <Section key={section.id} section={section} store={store} numberLabel={`${index + 1}.`} />
        ))}
        {content.appendix.length > 0 ? (
          <View break>
            <Heading level={1}>Appendix</Heading>
            {content.appendix.map((section) => (
              <Section key={section.id} section={section} store={store} />
            ))}
          </View>
        ) : null}
      </PageShell>
    </Document>
  );
}
